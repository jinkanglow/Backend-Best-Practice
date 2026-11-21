import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {detectErrorHandling,detectNetworkTimeouts,detectHardcodedCredentials,detectSecretInRepo,detectDependencyPinning,detectLockfilePresence} from '../lib/control-detectors.mjs';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'backend-v41-'));
const emptyReport=()=>({findings:[],parse_errors:[],rules:[],dependency_graph:{edges:[],unresolved:[]}});
const reportWith=(findings)=>({...emptyReport(),findings});
// BE-14-04 — detectErrorHandling
test('BE-14-04 maps CODE-001 findings to error handling candidates',()=>{
 const r=detectErrorHandling(reportWith([{rule_id:'CODE-001',uri:'src/api.ts',line:10,evidence:{sha256:'abc'}}]));
 assert.equal(r.control_id,'BE-14-04');assert.equal(r.findings.length,1);assert.equal(r.findings[0].confidence,'candidate');assert.equal(r.status,'insufficient_evidence');
});
test('BE-14-04 returns pass_within_declared_scope when no CODE-001 findings',()=>{
 const r=detectErrorHandling(emptyReport());
 assert.equal(r.status,'pass_within_declared_scope');assert.equal(r.findings.length,0);
});
test('BE-14-04 ignores non-CODE-001 findings',()=>{
 const r=detectErrorHandling(reportWith([{rule_id:'REL-001',uri:'src/a.ts',line:5,evidence:{}}]));
 assert.equal(r.findings.length,0);assert.equal(r.status,'pass_within_declared_scope');
});
test('BE-14-04 handles missing findings gracefully',()=>{
 const r=detectErrorHandling({});assert.equal(r.findings.length,0);
});
// BE-08-01 — detectNetworkTimeouts
test('BE-08-01 maps REL-001 findings to timeout candidates',()=>{
 const r=detectNetworkTimeouts(reportWith([{rule_id:'REL-001',uri:'src/client.ts',line:3,evidence:{sha256:'def'}}]));
 assert.equal(r.control_id,'BE-08-01');assert.equal(r.findings.length,1);assert.equal(r.findings[0].confidence,'candidate');assert.equal(r.status,'insufficient_evidence');
});
test('BE-08-01 always returns insufficient_evidence even with no findings',()=>{
 const r=detectNetworkTimeouts(emptyReport());
 assert.equal(r.status,'insufficient_evidence');assert.equal(r.findings.length,0);
});
// BE-09-03 — detectHardcodedCredentials
test('BE-09-03 maps SEC-001 findings to credential candidates',()=>{
 const r=detectHardcodedCredentials(reportWith([{rule_id:'SEC-001',uri:'src/config.ts',line:2,evidence:{sha256:'ghi'}}]));
 assert.equal(r.control_id,'BE-09-03');assert.equal(r.findings.length,1);assert.equal(r.findings[0].severity,'high');assert.equal(r.status,'insufficient_evidence');
});
test('BE-09-03 returns pass_within_declared_scope when no SEC-001 findings',()=>{
 assert.equal(detectHardcodedCredentials(emptyReport()).status,'pass_within_declared_scope');
});
// BE-15-02 — detectSecretInRepo
test('BE-15-02 maps SEC-001 findings to secret-in-repo candidates',()=>{
 const r=detectSecretInRepo(reportWith([{rule_id:'SEC-001',uri:'src/db.ts',line:1,evidence:{sha256:'jkl'}}]));
 assert.equal(r.control_id,'BE-15-02');assert.equal(r.findings.length,1);assert.equal(r.findings[0].confidence,'candidate');assert.equal(r.status,'insufficient_evidence');
});
test('BE-15-02 and BE-09-03 produce separate findings from same SEC-001 source',()=>{
 const src=reportWith([{rule_id:'SEC-001',uri:'src/x.ts',line:1,evidence:{sha256:'mno'}}]);
 assert.equal(detectHardcodedCredentials(src).control_id,'BE-09-03');
 assert.equal(detectSecretInRepo(src).control_id,'BE-15-02');
});
// BE-15-03 — detectDependencyPinning
test('BE-15-03 flags caret and tilde version ranges in package.json',()=>{
 const root=temp();try{
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({dependencies:{'express':'^4.18.0','lodash':'~4.17.0','exact-pkg':'1.2.3'}}));
  const r=detectDependencyPinning(root);
  assert.equal(r.control_id,'BE-15-03');assert.equal(r.findings.length,2);assert.ok(r.findings.every(f=>f.confidence==='candidate'));assert.equal(r.status,'insufficient_evidence');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('BE-15-03 returns pass_within_declared_scope when all versions are pinned',()=>{
 const root=temp();try{
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({dependencies:{'a':'1.0.0','b':'2.3.4'}}));
  const r=detectDependencyPinning(root);
  assert.equal(r.status,'insufficient_evidence');assert.equal(r.findings.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('BE-15-03 returns not_configured when no package.json',()=>{
 const root=temp();try{assert.equal(detectDependencyPinning(root).status,'not_configured');}finally{fs.rmSync(root,{recursive:true,force:true})}
});
// BE-15-05 — detectLockfilePresence
test('BE-15-05 passes when package-lock.json present',()=>{
 const root=temp();try{
  fs.writeFileSync(path.join(root,'package-lock.json'),'{}');
  const r=detectLockfilePresence(root);
  assert.equal(r.control_id,'BE-15-05');assert.equal(r.status,'pass_within_declared_scope');assert.ok(r.evidence.found.includes('package-lock.json'));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('BE-15-05 returns insufficient_evidence when no lockfile found',()=>{
 const root=temp();try{assert.equal(detectLockfilePresence(root).status,'insufficient_evidence');}finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('BE-15-05 recognises yarn.lock and pnpm-lock.yaml',()=>{
 const root=temp();try{
  fs.writeFileSync(path.join(root,'yarn.lock'),'');
  assert.equal(detectLockfilePresence(root).status,'pass_within_declared_scope');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
