import path from 'node:path';
import fs from 'node:fs';
import {loadTS,filesUnder} from './analyzer.mjs';
import {createHash} from 'node:crypto';

// BE-01-02 is evaluated only for explicit domain roots and forbidden imports.
// External imports are matched by package prefix; local imports by resolved file path.
function norm(p){return p.replaceAll('\\','/').replace(/^\.\//,'');}
function inside(p,dir){return p===dir||p.startsWith(dir+'/');}
function validRoots(a){return Array.isArray(a)&&a.length>0&&a.every(x=>typeof x==='string'&&x.length>0&&!path.posix.isAbsolute(x)&&!x.split('/').includes('..'));}
export function detectDomainBoundary(report,contract){
 const config=contract?.domain_boundary;
 if(!config)return {control_id:'BE-01-02',status:'not_configured',findings:[],evidence:null};
 const roots=config.domain_roots?.map(norm),forbidden=config.forbidden_packages,dirs=config.forbidden_paths?.map(norm)||[];
 if(!validRoots(roots)||!Array.isArray(forbidden)||!forbidden.every(x=>typeof x==='string'&&x.length>0)||!Array.isArray(dirs)||!dirs.every(x=>typeof x==='string'&&!x.split('/').includes('..'))||(!forbidden.length&&!dirs.length))throw Error('Invalid domain_boundary contract');
 if(!Array.isArray(report?.dependency_graph?.edges))throw Error('Missing dependency graph');
 const findings=[],domainEdges=report.dependency_graph.edges.filter(e=>typeof e.from==='string'&&roots.some(r=>inside(norm(e.from),r)));
 for(const e of domainEdges){
  const target=typeof e.to==='string'?norm(e.to):null;
  const spec=typeof e.specifier==='string'?e.specifier:'';
  const packageHit=forbidden.find(p=>spec===p||spec.startsWith(p+'/'));
  const pathHit=target&&dirs.find(d=>inside(target,d));
  if(packageHit||pathHit){
   const proof={from:norm(e.from),specifier:spec,to:target,kind:e.kind,rule:packageHit?'forbidden_package':'forbidden_path',matched:packageHit||pathHit};
   findings.push({rule_id:'BE-01-02',status:'fail',confidence:'confirmed',severity:'medium',message:'Domain boundary import violates explicit project contract',evidence:proof,evidence_sha256:createHash('sha256').update(JSON.stringify(proof)).digest('hex')});
  }
 }
 const unresolved=domainEdges.filter(e=>e.resolution==='unresolved'||(e.resolution==='external_or_unresolved_alias'&&e.specifier?.startsWith('#')));
 const incomplete=unresolved.length>0||domainEdges.some(e=>e.resolution==='external_or_unresolved_alias'&&!forbidden.some(p=>e.specifier===p||e.specifier?.startsWith(p+'/')))||!Array.isArray(report.dependency_graph.unresolved)||!!report.parse_errors?.length||!!report.project_config?.diagnostics?.length;
 return {control_id:'BE-01-02',status:findings.length?'fail':incomplete?'insufficient_evidence':'pass_within_declared_scope',scope:'direct imports from configured domain roots only; does not prove all architecture requirements',checked_edges:domainEdges.length,unresolved_edges:unresolved.length,findings,evidence:{contract_sha256:createHash('sha256').update(JSON.stringify(config)).digest('hex'),graph_edges:domainEdges.length}};
}
// BE-05-04 is a risk-evidence detector, not a SQL parser or approval authority.
// Candidate destructive migrations require external deployment/rollback evidence.
export function detectMigrationReview(report,contract){
 const cfg=contract?.migration_review;
 if(!cfg)return {control_id:'BE-05-04',status:'not_configured',findings:[],evidence:null};
 if(cfg.enabled!==true||!Array.isArray(report?.findings)||!Array.isArray(report?.parse_errors))throw Error('Invalid migration_review contract or report');
 const candidates=report.findings.filter(f=>f.rule_id==='DATA-002');
 const findings=candidates.map(f=>({rule_id:'BE-05-04',status:'review_required',confidence:'candidate',severity:'high',uri:f.uri,line:f.line,message:'Potential destructive migration: requires independently verified approval and rollback/forward-fix evidence',evidence:{source_rule:'DATA-002',source_evidence_sha256:f.evidence?.sha256||null}}));
 return {control_id:'BE-05-04',status:findings.length?'insufficient_evidence':'pass_within_declared_scope',scope:'Candidate destructive SQL patterns in scanned migration files only; no database execution or approval validation',checked_candidates:candidates.length,findings,evidence:{report_candidate_count:candidates.length}};
}
// These detectors identify concrete risky syntax, not complete security properties.
// A clean candidate scan is insufficient evidence, never a compliance pass.
export function detectApiValidation(root,contract){
 const cfg=contract?.api_validation;
 if(!cfg)return {control_id:'BE-02-01',status:'not_configured',findings:[]};
 if(cfg.enabled!==true)throw Error('api_validation.enabled must be true');
 const ts=loadTS();if(!ts)throw Error('TypeScript compiler unavailable');
 const findings=[];let scanned=0;
 for(const file of filesUnder(root).filter(f=>/\.[cm]?[jt]sx?$/.test(f))){
  const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);scanned++;
  const visit=node=>{
   // Only flag direct request body consumption at a configured sensitive sink.
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&cfg.sensitive_methods?.includes(node.expression.name.text)){
    const direct=node.arguments.some(arg=>ts.isPropertyAccessExpression(arg)&&arg.name.text==='body'&&ts.isIdentifier(arg.expression)&&['req','request'].includes(arg.expression.text));
    if(direct){const pos=ast.getLineAndCharacterOfPosition(node.getStart(ast));const evidence={uri:path.relative(root,file).replaceAll('\\','/'),line:pos.line+1,method:node.expression.name.text};findings.push({rule_id:'BE-02-01',status:'review_required',confidence:'candidate',severity:'high',message:'Request body passed directly to configured side-effect method; validation may exist elsewhere',evidence,evidence_sha256:createHash('sha256').update(JSON.stringify(evidence)).digest('hex')});}
   }
   ts.forEachChild(node,visit);
  };visit(ast);
 }
 return {control_id:'BE-02-01',status:'insufficient_evidence',scope:'Direct req.body/request.body arguments to configured sensitive methods only; does not establish validation absence or presence',files_scanned:scanned,findings};
}
export function detectSqlParameterization(root,contract){
 const cfg=contract?.sql_parameterization;
 if(!cfg)return {control_id:'BE-09-02',status:'not_configured',findings:[]};
 if(cfg.enabled!==true)throw Error('sql_parameterization.enabled must be true');
 const ts=loadTS();if(!ts)throw Error('TypeScript compiler unavailable');
 const methods=cfg.query_methods||['query','execute'];
 if(!Array.isArray(methods)||!methods.every(x=>typeof x==='string'&&/^[a-zA-Z_$][\w$]*$/.test(x)))throw Error('Invalid query_methods');
 const findings=[];let scanned=0;
 for(const file of filesUnder(root).filter(f=>/\.[cm]?[jt]sx?$/.test(f))){
  const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);scanned++;
  const visit=node=>{
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&methods.includes(node.expression.name.text)&&node.arguments.length){
    const arg=node.arguments[0];
    if(ts.isTemplateExpression(arg)&&arg.templateSpans.length||ts.isBinaryExpression(arg)&&arg.operatorToken.kind===ts.SyntaxKind.PlusToken){
     const pos=ast.getLineAndCharacterOfPosition(arg.getStart(ast));const evidence={uri:path.relative(root,file).replaceAll('\\','/'),line:pos.line+1,method:node.expression.name.text,expression_kind:ts.SyntaxKind[arg.kind]};
     findings.push({rule_id:'BE-09-02',status:'review_required',confidence:'candidate',severity:'high',message:'Dynamic SQL-like argument at configured query method; confirm binding and query construction',evidence,evidence_sha256:createHash('sha256').update(JSON.stringify(evidence)).digest('hex')});
    }
   }
   ts.forEachChild(node,visit);
  };visit(ast);
 }
 return {control_id:'BE-09-02',status:'insufficient_evidence',scope:'Template interpolation or concatenation as first argument to configured query methods; no proof of injection',files_scanned:scanned,findings};
}
// BE-14-04: code maintainability — explicit error handling; wraps CODE-001 findings
export function detectErrorHandling(report){
 const findings=(report?.findings||[]).filter(f=>f.rule_id==='CODE-001');
 const mapped=findings.map(f=>({rule_id:'BE-14-04',status:'review_required',confidence:'candidate',severity:'medium',uri:f.uri,line:f.line,message:'Empty catch block may suppress error context; verify error is preserved or re-thrown',evidence:{source_rule:'CODE-001',source_evidence_sha256:f.evidence?.sha256||null}}));
 return {control_id:'BE-14-04',status:mapped.length?'insufficient_evidence':'pass_within_declared_scope',scope:'CODE-001 empty-catch findings only; does not prove error handling discipline across all code paths',checked_candidates:findings.length,findings:mapped,evidence:{source_findings:findings.length}};
}
// BE-08-01: reliability — network operation timeouts; wraps REL-001 findings
export function detectNetworkTimeouts(report){
 const findings=(report?.findings||[]).filter(f=>f.rule_id==='REL-001');
 const mapped=findings.map(f=>({rule_id:'BE-08-01',status:'review_required',confidence:'candidate',severity:'medium',uri:f.uri,line:f.line,message:'fetch() without AbortSignal may hang; verify bounded timeout policy covers all network calls',evidence:{source_rule:'REL-001',source_evidence_sha256:f.evidence?.sha256||null}}));
 return {control_id:'BE-08-01',status:'insufficient_evidence',scope:'REL-001 fetch-without-signal findings only; does not cover database, gRPC, TCP or HTTP client libraries',checked_candidates:findings.length,findings:mapped,evidence:{source_findings:findings.length}};
}
// BE-09-03: security boundaries — credential protection; wraps SEC-001 findings
export function detectHardcodedCredentials(report){
 const findings=(report?.findings||[]).filter(f=>f.rule_id==='SEC-001');
 const mapped=findings.map(f=>({rule_id:'BE-09-03',status:'review_required',confidence:'candidate',severity:'high',uri:f.uri,line:f.line,message:'Potential hardcoded credential; migrate to secret management and rotate if confirmed',evidence:{source_rule:'SEC-001',source_evidence_sha256:f.evidence?.sha256||null}}));
 return {control_id:'BE-09-03',status:mapped.length?'insufficient_evidence':'pass_within_declared_scope',scope:'SEC-001 literal-credential heuristic only; does not validate secret manager integration or access controls',checked_candidates:findings.length,findings:mapped,evidence:{source_findings:findings.length}};
}
// BE-15-02: configuration/supply-chain — secrets not in repo; wraps SEC-001 findings
export function detectSecretInRepo(report){
 const findings=(report?.findings||[]).filter(f=>f.rule_id==='SEC-001');
 const mapped=findings.map(f=>({rule_id:'BE-15-02',status:'review_required',confidence:'candidate',severity:'high',uri:f.uri,line:f.line,message:'Potential secret value in tracked source; redacted in this report',evidence:{source_rule:'SEC-001',source_evidence_sha256:f.evidence?.sha256||null}}));
 return {control_id:'BE-15-02',status:mapped.length?'insufficient_evidence':'pass_within_declared_scope',scope:'SEC-001 literal-credential heuristic only; does not scan git history, .env files, generated output or logs',checked_candidates:findings.length,findings:mapped,evidence:{source_findings:findings.length}};
}
// BE-15-03: configuration/supply-chain — pinned dependency versions
export function detectDependencyPinning(root){
 const pkg=path.join(root,'package.json');
 if(!fs.existsSync(pkg))return {control_id:'BE-15-03',status:'not_configured',scope:'package.json not found',findings:[],evidence:null};
 let parsed;try{parsed=JSON.parse(fs.readFileSync(pkg,'utf8'))}catch(e){void e;return {control_id:'BE-15-03',status:'insufficient_evidence',scope:'package.json parse error',findings:[],evidence:{error:'parse_error'}};}
 const deps={...parsed.dependencies,...parsed.devDependencies};
 const findings=[];
 for(const [name,ver] of Object.entries(deps)){
  if(typeof ver==='string'&&/^[\^~]/.test(ver)){
   const proof={name,version:ver};
   findings.push({rule_id:'BE-15-03',status:'review_required',confidence:'candidate',severity:'medium',message:`Dependency "${name}@${ver}" uses a range specifier; consider exact pinning for reproducibility`,evidence:proof,evidence_sha256:createHash('sha256').update(JSON.stringify(proof)).digest('hex')});
  }
 }
 return {control_id:'BE-15-03',status:'insufficient_evidence',scope:'package.json semver range check only; does not verify lockfile integrity or transitive dependency pinning',checked_dependencies:Object.keys(deps).length,findings,evidence:{package_json_sha256:createHash('sha256').update(fs.readFileSync(pkg)).digest('hex')}};
}
// BE-15-05: configuration/supply-chain — SBOM or equivalent lockfile present
export function detectLockfilePresence(root){
 const lockfiles=['package-lock.json','yarn.lock','pnpm-lock.yaml','bun.lockb'];
 const found=lockfiles.filter(f=>fs.existsSync(path.join(root,f)));
 return {control_id:'BE-15-05',status:found.length?'pass_within_declared_scope':'insufficient_evidence',scope:'Lockfile file presence check only; does not verify lockfile integrity, SBOM format or release artifact provenance',findings:[],evidence:{checked:lockfiles,found}};
}
export function runControlDetectors(report,contract,root){return {schema_version:'2.7',results:[detectDomainBoundary(report,contract),detectMigrationReview(report,contract),detectErrorHandling(report),detectNetworkTimeouts(report),detectHardcodedCredentials(report),detectSecretInRepo(report),...(root?[detectApiValidation(root,contract),detectSqlParameterization(root,contract),detectDependencyPinning(root),detectLockfilePresence(root)]:[])]};}
