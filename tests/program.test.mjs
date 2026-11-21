import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {analyze} from '../lib/analyzer.mjs';
const cli=path.resolve('bin/backend-guard.mjs');
function fixture(fn){const d=mkdtempSync(path.join(tmpdir(),'bg-program-'));try{fn(d)}finally{rmSync(d,{recursive:true,force:true})}}
test('tsconfig paths alias resolves and target boundary blocks',()=>fixture(d=>{
 mkdirSync(path.join(d,'src','domain'),{recursive:true});mkdirSync(path.join(d,'src','infra'),{recursive:true});
 writeFileSync(path.join(d,'tsconfig.json'),JSON.stringify({compilerOptions:{baseUrl:'.',paths:{'@infra/*':['src/infra/*']}}}));
 writeFileSync(path.join(d,'src/infra/db.ts'),'export const db=1');
 writeFileSync(path.join(d,'src/domain/use.ts'),"import {db} from '@infra/db';");
 const r=analyze(d,{forbidden_dependencies:[{id:'no-infra',from:'src/domain/**',to:'src/infra/**'}]});
 assert.equal(r.dependency_graph.edges[0].to,'src/infra/db.ts');assert.equal(r.findings.filter(x=>x.rule_id==='ARCH-001').length,1);
 assert.equal(r.capabilities.tsconfig_paths,true);
}));
test('transitive forbidden dependency follows reexports',()=>fixture(d=>{
 for(const dir of ['domain','shared','infra'])mkdirSync(path.join(d,dir));
 writeFileSync(path.join(d,'domain','core.ts'),"import {db} from '../shared/index';");
 writeFileSync(path.join(d,'shared','index.ts'),"export {db} from '../infra/db';");
 writeFileSync(path.join(d,'infra','db.ts'),'export const db=1');
 const r=analyze(d,{forbidden_dependencies:[{from:'domain/**',to:'infra/**',transitive:true}]});
 assert.ok(r.findings.some(x=>x.evidence.dependency_path?.length===3));
}));
test('confirmed architectural violation blocks quality gate',()=>fixture(d=>{
 mkdirSync(path.join(d,'domain'));mkdirSync(path.join(d,'infra'));
 writeFileSync(path.join(d,'domain','a.ts'),"import '../infra/b';");writeFileSync(path.join(d,'infra','b.ts'),'export {}');
 const config=path.join(d,'config.json');writeFileSync(config,JSON.stringify({forbidden_dependencies:[{from:'domain/**',to:'infra/**'}]}));
 const report=path.join(d,'report.json');const check=spawnSync(process.execPath,[cli,'check','--root',d,'--config',config,'--format','json','--output',report],{encoding:'utf8'});assert.equal(check.status,0);
 const gate=spawnSync(process.execPath,[cli,'gate','--report',report],{encoding:'utf8'});assert.equal(gate.status,1);assert.equal(JSON.parse(gate.stdout).confirmed_blockers,1);
}));
test('invalid tsconfig diagnostic prevents strict gate pass',()=>fixture(d=>{
 writeFileSync(path.join(d,'tsconfig.json'),'{ invalid');writeFileSync(path.join(d,'a.ts'),'export {}');
 const r=analyze(d);assert.ok(r.project_config.diagnostics.length>0);
}));
test('dynamic import and require participate in dependency enforcement',()=>fixture(d=>{
 mkdirSync(path.join(d,'domain'));mkdirSync(path.join(d,'infra'));
 writeFileSync(path.join(d,'infra','db.ts'),'export const db=1');
 writeFileSync(path.join(d,'domain','dynamic.ts'),"async function run(){ return import('../infra/db'); }");
 writeFileSync(path.join(d,'domain','common.js'),"const db = require('../infra/db');");
 const r=analyze(d,{forbidden_dependencies:[{from:'domain/**',to:'infra/**'}]});
 assert.equal(r.findings.filter(f=>f.rule_id==='ARCH-001').length,2);
 assert.deepEqual(new Set(r.dependency_graph.edges.map(e=>e.kind)),new Set(['dynamic_import','require']));
}));
test('unresolved relative import remains explicit evidence gap',()=>fixture(d=>{
 writeFileSync(path.join(d,'main.ts'),"import { missing } from './missing';");
 const r=analyze(d);
 assert.equal(r.dependency_graph.unresolved.length,1);
 assert.equal(r.dependency_graph.unresolved[0].specifier,'./missing');
 assert.ok(r.semantic_diagnostics.some(x=>x.code===2307));
}));
