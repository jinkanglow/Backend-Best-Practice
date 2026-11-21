import test from 'node:test';
import assert from 'node:assert/strict';
import {executeParallelTransaction} from '../lib/parallel-transaction.mjs';
const env={BACKEND_GUARD_ALLOW_DB_TESTS:'yes',TEST_URL:'mock'};
const sample=()=>({schema_version:'3.2',engine:'postgres',connection_env:'TEST_URL',test_database_acknowledged:true,allow_mutation_on_test_database:true,cases:[{id:'c1',control_ids:['BE-04-01'],isolation:'read_committed',phases:[{steps:[{id:'a',session:'a',action:'query',sql:'SELECT 1',assert:{first_row:{value:1}}},{id:'b',session:'b',action:'query',sql:'SELECT 1'}]}]}]});
function mock(){const calls=[];let closes=0;return {calls,get closes(){return closes},drivers:{postgres:{connect:async()=>({query:async(sql)=>{calls.push(sql);return {rows:[{value:1}],rowCount:1}},close:async()=>{closes++}})}}}}
test('parallel barrier executes both sessions and records assertions',async()=>{const d=mock();const r=await executeParallelTransaction(sample(),{drivers:d.drivers,env});assert.equal(r.assessment.exit_code,0);assert.equal(d.closes,2);assert.equal(r.cases[0].events.length,2)});
test('assertion mismatch fails',async()=>{const d=mock(),m=sample();m.cases[0].phases[0].steps[0].assert.first_row={value:3};assert.equal((await executeParallelTransaction(m,{drivers:d.drivers,env})).assessment.exit_code,1)});
test('unexpected database error is insufficient evidence',async()=>{
 const drivers={postgres:{connect:async()=>({query:async()=>{throw Object.assign(new Error('down'),{code:'08006'})},close:async()=>{}})}};
 assert.equal((await executeParallelTransaction(sample(),{drivers,env})).assessment.exit_code,2);
});
test('rejects unsafe setup SQL',async()=>{const m=sample();m.cases[0].setup=[{session:'observer',action:'query',sql:'DROP TABLE users'}];await assert.rejects(()=>executeParallelTransaction(m,{env}),/Unsafe or invalid SQL/)});
test('requires explicit opt in',async()=>{await assert.rejects(()=>executeParallelTransaction(sample(),{env:{TEST_URL:'mock'}}),/opt-in/)});
test('duplicate sessions within barrier rejected',async()=>{const m=sample();m.cases[0].phases[0].steps[1].session='a';assert.equal((await executeParallelTransaction(m,{drivers:mock().drivers,env})).assessment.exit_code,2)});
