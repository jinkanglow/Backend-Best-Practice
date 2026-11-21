import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const cli=path.resolve('bin/backend-guard.mjs');
function run(...args){return spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});}
test('candidate detection redacts credential and does not claim pass',()=>{
 const d=mkdtempSync(path.join(tmpdir(),'bg-'));
 try{
  writeFileSync(path.join(d,'app.ts'),`const password = "supersecret12345";\ntry {} catch(e) {}\nfetch('https://example.test');`);
  const r=run('check','--root',d,'--format','json');assert.equal(r.status,0);
  const j=JSON.parse(r.stdout);assert.equal(j.findings.length,3);
  assert.ok(j.rules.every(x=>x.status==='unknown'));
  assert.ok(!r.stdout.includes('supersecret12345'));
  const f=path.join(d,'report.json');writeFileSync(f,r.stdout);
  const strict=path.join(d,'strict.json');writeFileSync(strict,JSON.stringify({require_evidence:true}));
  assert.equal(run('gate','--report',f,'--policy',strict).status,2);
  assert.equal(run('gate','--report',f).status,0);
  const s=run('check','--root',d,'--format','sarif');assert.equal(JSON.parse(s.stdout).version,'2.4.0');
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('destructive migration flagged but never automatically blocked as confirmed',()=>{
 const d=mkdtempSync(path.join(tmpdir(),'bg-'));
 try{mkdirSync(path.join(d,'migrations'));writeFileSync(path.join(d,'migrations','001.sql'),'DROP TABLE users;');
 const j=JSON.parse(run('check','--root',d,'--format','json').stdout);assert.equal(j.findings[0].rule_id,'DATA-002');assert.equal(j.findings[0].confidence,'candidate');}
 finally{rmSync(d,{recursive:true,force:true});}
});
