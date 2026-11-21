import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {executeAnomalyScenarios} from '../lib/anomaly-scenarios.mjs';
const base=JSON.parse(readFileSync(new URL('../examples/anomaly-postgres-v36.json',import.meta.url)));
const env={BACKEND_GUARD_ALLOW_DB_TESTS:'yes',BACKEND_GUARD_PG_URL:'fake'};
function driver({lock=true,commitError=false}={}){
 let count=0;
 return {connect:async()=>{const id=++count;return {async query(sql){
  if(sql.includes('pg_backend_pid()'))return {rows:[{session_id:id}]};
  if(sql.includes('pg_stat_activity'))return {rows:lock?[{waiter_id:2,blocker_id:3,wait_type:'Lock'}]:[]};
  if(sql==='COMMIT'&&commitError)throw Object.assign(Error('serialization'),{code:'40001'});
  return {rows:[],rowCount:0};
 },async close(){}};}};
}
function manifest(step,requireIdentity=true){const m=structuredClone(base);for(const c of m.cases){c.steps=[{session:'a',action:'begin'}, {session:'b',action:'begin'},step];c.verify=[{sql:'SELECT id FROM bga_v35 WHERE id=999',expected:[]}];c.require_session_identity=requireIdentity;}return m;}
test('v3.6 rejects lock probe without identity opt-in',async()=>{const m=manifest({session:'a',action:'lock_probe',waiter:'a',blocker:'b'},false);await assert.rejects(executeAnomalyScenarios(m,{env}),/Lock probe/)});
test('v3.6 database lock observation binds exact session ids',async()=>{const m=manifest({session:'a',action:'lock_probe',waiter:'a',blocker:'b'});const r=await executeAnomalyScenarios(m,{env,drivers:{postgres:driver()}});assert.equal(r.cases[0].lock_evidence[0].observed,true);assert.equal(r.cases[0].lock_evidence[0].waiter_id,2);assert.equal(r.cases[0].lock_evidence[0].blocker_id,3);assert.equal(r.assessment.exit_code,2);});
test('v3.6 missing database lock observation fails closed',async()=>{const m=manifest({session:'a',action:'lock_probe',waiter:'a',blocker:'b'});const r=await executeAnomalyScenarios(m,{env,drivers:{postgres:driver({lock:false})}});assert.equal(r.assessment.exit_code,2);});
test('v3.6 accepts error codes on commit as expected conflict',async()=>{const m=manifest({session:'a',action:'commit',expect_error:['40001','40P01']},false);const r=await executeAnomalyScenarios(m,{env,drivers:{postgres:driver({commitError:true})}});assert.equal(r.assessment.exit_code,0);assert(r.cases[0].events.some(e=>e.phase==='expected_error'&&e.action==='commit'));});
test('v3.6 unexpected commit error yields insufficient evidence',async()=>{const m=manifest({session:'a',action:'commit',expect_error:'40P01'},false);const r=await executeAnomalyScenarios(m,{env,drivers:{postgres:driver({commitError:true})}});assert.equal(r.assessment.exit_code,2);});
