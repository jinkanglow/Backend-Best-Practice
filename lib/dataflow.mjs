import path from 'node:path';

// Bounded, path-insensitive, conservative candidate flow explorer. No vulnerability verdicts.
export function buildDataflow(ts, program, root, config={}) {
  const checker=program.getTypeChecker();
  const maxDepth=Math.max(1,Math.min(12,Number(config.dataflow?.max_call_depth)||5));
  const sinks=new Set(config.dataflow?.sink_functions||['executeRawUnsafe','queryRawUnsafe']);
  const sanitizers=new Set(config.dataflow?.sanitizer_functions||[]);
  const flows=[],unknown=[],seenFlows=new Set();
  const rel=f=>path.relative(root,path.resolve(f)).split(path.sep).join('/');
  const inside=f=>{const r=rel(f);return r!== '..'&&!r.startsWith('../')&&!path.isAbsolute(r)&&!r.includes('node_modules/');};
  const loc=n=>{const s=n.getSourceFile(),p=s.getLineAndCharacterOfPosition(n.getStart());return {uri:rel(s.fileName),line:p.line+1,column:p.character+1};};
  const addUnknown=(node,reason)=>{if(unknown.length<500)unknown.push({...loc(node),reason});};
  const declarationFor=d=>{
    if(ts.isFunctionDeclaration(d)||ts.isMethodDeclaration(d)||ts.isFunctionExpression(d)||ts.isArrowFunction(d))return d;
    if(ts.isVariableDeclaration(d)&&d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer)))return d.initializer;
    return null;
  };
  const targetFor=call=>{
    const sig=checker.getResolvedSignature(call);
    let d=sig?.declaration;
    if(d&&declarationFor(d)&&inside(d.getSourceFile().fileName))return declarationFor(d);
    let sym=checker.getSymbolAtLocation(call.expression);
    if(sym?.flags&ts.SymbolFlags.Alias){try{sym=checker.getAliasedSymbol(sym)}catch{return null}}
    const targets=(sym?.declarations||[]).map(declarationFor).filter(Boolean).filter(d=>inside(d.getSourceFile().fileName));
    return targets.length===1?targets[0]:null;
  };
  // A value carries taint origins and the chain of call sites, never secret contents.
  const merge=(...xs)=>xs.flat().slice(0,80);
  const evalExpr=(node,env,depth,stack,trace)=>{
    if(!node)return [];
    if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isTypeAssertionExpression(node)||ts.isNonNullExpression(node))return evalExpr(node.expression,env,depth,stack,trace);
    if(ts.isIdentifier(node))return env.get(node.text)||[];
    if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)){
      const base=evalExpr(node.expression,env,depth,stack,trace);
      if(ts.isPropertyAccessExpression(node)&&node.name.text==='body'&&ts.isIdentifier(node.expression)&&['req','request'].includes(node.expression.text))return [{source:'http_request_body',origin:loc(node),path:[...trace,loc(node)]}];
      return base;
    }
    if(ts.isCallExpression(node)){
      const args=node.arguments.map(a=>evalExpr(a,env,depth,stack,trace));
      const name=ts.isIdentifier(node.expression)?node.expression.text:ts.isPropertyAccessExpression(node.expression)?node.expression.name.text:null;
      if(name&&sinks.has(name)){
        for(let i=0;i<args.length;i++)for(const t of args[i]){
          const key=JSON.stringify([loc(node),i,t.origin]);
          if(!seenFlows.has(key)){seenFlows.add(key);flows.push({source:t.source,source_location:t.origin,sink:name,sink_location:loc(node),argument_index:i,path:[...t.path,loc(node)],confidence:'candidate',reason:'syntactic source-to-sink propagation; validation, query parameterization and runtime reachability not established'});}
        }
      }
      if(name&&sanitizers.has(name))return [];
      const target=targetFor(node);
      if(target&&depth<maxDepth&&!stack.has(target))return analyzeFunction(target,args,depth+1,new Set([...stack,target]),[...trace,loc(node)]);
      if(args.some(a=>a.length)&&!target)addUnknown(node, 'tainted_argument_to_unresolved_call');
      if(args.some(a=>a.length)&&target&&depth>=maxDepth)addUnknown(node,'call_depth_limit');
      if(args.some(a=>a.length)&&target&&stack.has(target))addUnknown(node,'recursive_call_cycle');
      return [];
    }
    if(ts.isConditionalExpression(node))return merge(evalExpr(node.whenTrue,env,depth,stack,trace),evalExpr(node.whenFalse,env,depth,stack,trace));
    if(ts.isBinaryExpression(node))return merge(evalExpr(node.left,env,depth,stack,trace),evalExpr(node.right,env,depth,stack,trace));
    if(ts.isTemplateExpression(node))return merge(...node.templateSpans.map(s=>evalExpr(s.expression,env,depth,stack,trace)));
    if(ts.isObjectLiteralExpression(node))return merge(...node.properties.filter(ts.isPropertyAssignment).map(p=>evalExpr(p.initializer,env,depth,stack,trace)));
    if(ts.isArrayLiteralExpression(node))return merge(...node.elements.map(e=>evalExpr(e,env,depth,stack,trace)));
    return [];
  };
  const analyzeFunction=(fn,args,depth,stack,trace)=>{
    const env=new Map();fn.parameters.forEach((p,i)=>{if(ts.isIdentifier(p.name))env.set(p.name.text,args[i]||[])});
    const returns=[];
    const visit=node=>{
      if(node!==fn&&(ts.isFunctionDeclaration(node)||ts.isArrowFunction(node)||ts.isFunctionExpression(node)||ts.isMethodDeclaration(node)))return;
      if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name))env.set(node.name.text,evalExpr(node.initializer,env,depth,stack,trace));
      else if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isIdentifier(node.left))env.set(node.left.text,evalExpr(node.right,env,depth,stack,trace));
      else if(ts.isReturnStatement(node))returns.push(...evalExpr(node.expression,env,depth,stack,trace));
      else if(ts.isExpressionStatement(node))evalExpr(node.expression,env,depth,stack,trace);
      ts.forEachChild(node,visit);
    };
    if(fn.body)visit(fn.body);
    return returns;
  };
  for(const source of program.getSourceFiles()){
    if(!inside(source.fileName)||source.isDeclarationFile)continue;
    const visit=node=>{
      if(ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node)||ts.isArrowFunction(node)||ts.isFunctionExpression(node)){
        const args=node.parameters.map(p=>ts.isIdentifier(p.name)&&['req','request'].includes(p.name.text)?[]:[]);
        analyzeFunction(node,args,0,new Set([node]),[]);
        return;
      }
      ts.forEachChild(node,visit);
    };
    visit(source);
  }
  return {scope:'bounded path-insensitive source-to-sink candidate tracing; no security verdict',max_call_depth:maxDepth,flows:flows.slice(0,1000),unknown:unknown.slice(0,500),truncated:flows.length>1000||unknown.length>500,configured_sinks:[...sinks],configured_sanitizers:[...sanitizers]};
}
