import fs from 'node:fs';
import {buildCallGraph} from './callgraph.mjs';
import {buildDataflow} from './dataflow.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
export function loadTS(){try{return require('typescript')}catch{try{return require(path.join(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'))}catch{return null}}}
export const RULES=[
{id:'CODE-001',severity:'medium',title:'Empty catch block'},
{id:'REL-001',severity:'high',title:'Fetch without inline abort signal'},
{id:'SEC-001',severity:'critical',title:'Potential embedded credential'},
{id:'DATA-002',severity:'high',title:'Destructive SQL migration candidate'},
{id:'ARCH-001',severity:'high',title:'Forbidden module dependency'}];
const EXCLUDE=new Set(['node_modules','.git','dist','build','coverage','.next','.turbo']);
export function filesUnder(root,dir=root,out=[]){for(const item of fs.readdirSync(dir,{withFileTypes:true})){if(EXCLUDE.has(item.name)||item.isSymbolicLink())continue;const f=path.join(dir,item.name);if(item.isDirectory())filesUnder(root,f,out);else if(item.isFile()&&/\.(?:ts|tsx|js|jsx|mjs|cjs|sql)$/.test(item.name)&&fs.statSync(f).size<1024*1024)out.push(f)}return out.sort()}
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function globMatch(value,glob){const re='^'+glob.split('**').map(p=>p.split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('.*')+'$';return new RegExp(re).test(value)}
function loadProjectOptions(ts,root){
 const configFile=ts.findConfigFile(root,ts.sys.fileExists,'tsconfig.json');
 if(!configFile)return {options:{},configFile:null,diagnostics:[]};
 const read=ts.readConfigFile(configFile,ts.sys.readFile);
 if(read.error)return {options:{},configFile,diagnostics:[read.error]};
 const parsed=ts.parseJsonConfigFileContent(read.config,ts.sys,path.dirname(configFile),undefined,configFile);
 return {options:parsed.options,configFile,diagnostics:parsed.errors};
}
function resolveModule(ts,root,from,spec,files,options){
 const resolved=ts.resolveModuleName(spec,from,options,ts.sys).resolvedModule?.resolvedFileName;
 if(resolved){const absolute=path.resolve(resolved);if(files.has(absolute))return path.relative(root,absolute).split(path.sep).join('/');}
 return resolveLocal(root,from,spec,files);
}
function resolveLocal(root,from,spec,files){if(!spec.startsWith('.'))return null;const base=path.resolve(path.dirname(from),spec);for(const suffix of ['','.ts','.tsx','.js','.jsx','.mjs','.cjs','/index.ts','/index.tsx','/index.js']){const candidate=base+suffix;if(files.has(candidate))return path.relative(root,candidate).split(path.sep).join('/')}return null}
export function analyze(root,config={}){
 const ts=loadTS();if(!ts)throw Error('TypeScript compiler unavailable; install dependencies with npm install');
 const paths=filesUnder(root),fileSet=new Set(paths),findings=[],edges=[],parseErrors=[];
 const project=loadProjectOptions(ts,root);
 const program=ts.createProgram({rootNames:paths.filter(f=>/\.(?:tsx?|jsx?|mjs|cjs)$/.test(f)),options:{...project.options,noEmit:true,allowJs:true,checkJs:false}});
 const callGraph=buildCallGraph(ts,program,root);
 const dataflow=buildDataflow(ts,program,root,config);
 const semanticDiagnostics=ts.getPreEmitDiagnostics(program).slice(0,500).map(d=>({uri:d.file?path.relative(root,d.file.fileName).split(path.sep).join('/'):null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' '),line:d.file&&d.start!=null?d.file.getLineAndCharacterOfPosition(d.start).line+1:null}));
 const projectDiagnostics=project.diagnostics.map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));
 const add=(id,uri,source,index,message,confidence='candidate',engine='typescript-ast-v1',extra={})=>{const file=ts.createSourceFile(uri,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);const p=file.getLineAndCharacterOfPosition(index);findings.push({rule_id:id,status:'warning',confidence,severity:RULES.find(r=>r.id===id).severity,uri,line:p.line+1,column:p.character+1,message,evidence:{sha256:sha(source),start_offset:index,method:engine,...extra},engine})};
 for(const filename of paths){const uri=path.relative(root,filename).split(path.sep).join('/'),source=fs.readFileSync(filename,'utf8');
 if(filename.endsWith('.sql')){if(/(?:migration|migrations)/i.test(uri))for(const m of source.matchAll(/\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE|ALTER\s+TABLE\s+[^;\n]+\s+DROP\s+COLUMN)\b/gi))add('DATA-002',uri,source,m.index,'Destructive SQL migration requires deployment review','candidate','sql-heuristic-v1');continue}
 const kind=/\.tsx$/.test(filename)?ts.ScriptKind.TSX:/\.jsx$/.test(filename)?ts.ScriptKind.JSX:/\.(?:js|mjs|cjs)$/.test(filename)?ts.ScriptKind.JS:ts.ScriptKind.TS;
 const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,kind);
 for(const d of ast.parseDiagnostics||[])parseErrors.push({uri,line:ast.getLineAndCharacterOfPosition(d.start||0).line+1,code:d.code});
 const visit=node=>{
 // Dynamic imports and CommonJS imports form dependency edges as well.
 if(ts.isCallExpression(node)&&node.arguments.length===1&&ts.isStringLiteralLike(node.arguments[0])&&
   (node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))){
   const spec=node.arguments[0].text,target=resolveModule(ts,root,filename,spec,fileSet,project.options);
   edges.push({from:uri,specifier:spec,to:target,kind:node.expression.kind===ts.SyntaxKind.ImportKeyword?'dynamic_import':'require',resolution:target?'resolved':spec.startsWith('.')||spec.startsWith('#')?'unresolved':'external_or_unresolved_alias'});
   for(const boundary of config.forbidden_dependencies||[])if(globMatch(uri,boundary.from)&&((boundary.import&&globMatch(spec,boundary.import))||(boundary.to&&target&&globMatch(target,boundary.to))))add('ARCH-001',uri,source,node.getStart(ast),`Forbidden dependency from ${uri} to ${spec}`,'confirmed','typescript-module-resolution-v2',{boundary_id:boundary.id||null});
 }

 if(ts.isCatchClause(node)&&node.block.statements.length===0)add('CODE-001',uri,source,node.getStart(ast),'Empty catch block discards errors','confirmed','typescript-ast-v1');
 if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='fetch'){
 const arg=node.arguments[1];let hasSignal=false;
 if(arg&&ts.isObjectLiteralExpression(arg))hasSignal=arg.properties.some(p=>ts.isPropertyAssignment(p)&&((ts.isIdentifier(p.name)&&p.name.text==='signal')||(ts.isStringLiteral(p.name)&&p.name.text==='signal')));
 if(!hasSignal)add('REL-001',uri,source,node.getStart(ast),'Fetch call has no visible inline signal; wrapper and external cancellation not assessed');
 }
 if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&/^(?:api_?key|secret|password|token)$/i.test(node.name.text)&&node.initializer&&(ts.isStringLiteral(node.initializer)||ts.isNoSubstitutionTemplateLiteral(node.initializer))){const value=node.initializer.text;if(value.length>=8&&!/^(?:placeholder|example|test|changeme|your[_-])/i.test(value))add('SEC-001',uri,source,node.name.getStart(ast),'Potential hardcoded credential; value redacted');}
 if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)||ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
 const spec=node.moduleSpecifier.text,target=resolveModule(ts,root,filename,spec,fileSet,project.options);edges.push({from:uri,specifier:spec,to:target,kind:ts.isImportDeclaration(node)?'import':'reexport',resolution:target?'resolved':spec.startsWith('.')||spec.startsWith('#')?'unresolved':'external_or_unresolved_alias'});
 for(const boundary of config.forbidden_dependencies||[])if(globMatch(uri,boundary.from)&&((boundary.import&&globMatch(spec,boundary.import))||(boundary.to&&target&&globMatch(target,boundary.to)))){add('ARCH-001',uri,source,node.getStart(ast),`Forbidden dependency from ${uri} to ${spec}`,'confirmed','typescript-ast-v1',{boundary_id:boundary.id||null})}
 }
 ts.forEachChild(node,visit);
 };visit(ast);
 }
 // Transitive checks require a resolved internal path for every hop; unresolved edges are never treated as safe.
 const adjacency=new Map();for(const edge of edges)if(edge.to){if(!adjacency.has(edge.from))adjacency.set(edge.from,[]);adjacency.get(edge.from).push(edge.to)}
 for(const boundary of config.forbidden_dependencies||[]){if(!boundary.transitive||!boundary.to)continue;
  for(const from of paths.map(f=>path.relative(root,f).split(path.sep).join('/')).filter(f=>globMatch(f,boundary.from))){
   const queue=(adjacency.get(from)||[]).map(to=>({to,path:[from,to]})),seen=new Set([from]);
   while(queue.length){const current=queue.shift();if(seen.has(current.to))continue;seen.add(current.to);
    if(current.path.length>2&&globMatch(current.to,boundary.to)){
     const source=fs.readFileSync(path.join(root,from),'utf8');add('ARCH-001',from,source,0,`Transitive forbidden dependency: ${current.path.join(' -> ')}`,'confirmed','typescript-module-graph-v1',{boundary_id:boundary.id||null,dependency_path:current.path});
    }
    for(const to of adjacency.get(current.to)||[])if(!seen.has(to))queue.push({to,path:[...current.path,to]});
   }
  }
 }
 const unresolved=edges.filter(e=>e.resolution==='unresolved');
 findings.sort((a,b)=>a.uri.localeCompare(b.uri)||a.line-b.line||a.rule_id.localeCompare(b.rule_id));
 return {schema_version:'1.7',tool:'backend-guard',analyzer_version:'1.7.0',root:'.',files_scanned:paths.length,generated_at:new Date().toISOString(),capabilities:{parser:'typescript-compiler-api',runtime_harness:false,dependency_graph:'TypeScript module resolution, dynamic imports, CommonJS and transitive graph',type_checker:'symbol resolution for static call graph',semantic_diagnostics:'collected',tsconfig_paths:!!project.configFile},rules:RULES.map(r=>({...r,status:'unknown',reason:'Absence of findings does not prove compliance'})),findings,dependency_graph:{edges,unresolved},call_graph:callGraph,dataflow,semantic_diagnostics:semanticDiagnostics,project_config:{tsconfig:project.configFile?path.relative(root,project.configFile):null,diagnostics:projectDiagnostics},parse_errors:parseErrors};
}
