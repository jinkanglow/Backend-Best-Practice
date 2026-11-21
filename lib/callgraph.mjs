import path from 'node:path';

// Resolved static call targets only. Dynamic dispatch is explicitly reported as unknown.
export function buildCallGraph(ts, program, root) {
  const checker = program.getTypeChecker();
  const nodes = new Map();
  const edges = [];
  const unresolved = [];
  const inRoot = file => {
    const rel = path.relative(root, path.resolve(file)).split(path.sep).join('/');
    return rel !== '..' && !rel.startsWith('../') && !path.isAbsolute(rel) && !rel.includes('node_modules/');
  };
  const relative = file => path.relative(root, path.resolve(file)).split(path.sep).join('/');
  const declarationId = decl => `${relative(decl.getSourceFile().fileName)}:${decl.getStart()}`;
  const functionLike = n => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isConstructorDeclaration(n);
  const declarationFor = decl => {
    if (functionLike(decl)) return decl;
    if (ts.isVariableDeclaration(decl) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) return decl.initializer;
    return null;
  };
  for (const source of program.getSourceFiles()) {
    if (!inRoot(source.fileName) || source.isDeclarationFile) continue;
    const visit = node => {
      if (functionLike(node)) {
        const id = declarationId(node);
        const loc = source.getLineAndCharacterOfPosition(node.getStart());
        const name = node.name?.getText(source) || (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(source) : '<anonymous>');
        nodes.set(id, {id, uri:relative(source.fileName), line:loc.line+1, name});
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const source of program.getSourceFiles()) {
    if (!inRoot(source.fileName) || source.isDeclarationFile) continue;
    const visit = (node, enclosing) => {
      const current = functionLike(node) ? declarationId(node) : enclosing;
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const loc = source.getLineAndCharacterOfPosition(node.getStart());
        const site = {from:current || null, uri:relative(source.fileName), line:loc.line+1, column:loc.character+1, expression:node.expression.getText(source).slice(0,160)};
        let symbol = checker.getSymbolAtLocation(node.expression);
        if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) {
          try {symbol = checker.getAliasedSymbol(symbol);} catch {symbol = null;}
        }
        const declarations = symbol?.declarations || [];
        const targets = declarations.map(declarationFor).filter(Boolean).filter(d=>inRoot(d.getSourceFile().fileName));
        if (targets.length === 1 && nodes.has(declarationId(targets[0]))) {
          edges.push({...site, to:declarationId(targets[0]), resolution:'static_symbol'});
        } else {
          const reason = targets.length > 1 ? 'ambiguous_target' : declarations.length ? 'external_or_dynamic_target' : 'unresolved_symbol';
          unresolved.push({...site, reason});
        }
      }
      ts.forEachChild(node, child=>visit(child,current));
    };
    visit(source,null);
  }
  return {nodes:[...nodes.values()].sort((a,b)=>a.id.localeCompare(b.id)),edges:edges.sort((a,b)=>a.uri.localeCompare(b.uri)||a.line-b.line),unresolved:unresolved.sort((a,b)=>a.uri.localeCompare(b.uri)||a.line-b.line),scope:'statically resolved function and constructor calls; not complete runtime dispatch'};
}
