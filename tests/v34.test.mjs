import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionIdentity,inspectLockWait} from '../lib/database-lock-evidence.mjs';
import {executeConflictRecovery} from '../lib/conflict-recovery.mjs';
import {readFileSync} from 'node:fs';
const pg=(rows)=>({query:async()=>({rows})});
const my=(rows)=>({query:async()=>[rows]});
test('PostgreSQL identifies exact blocker and waiter',async()=>{
 assert.equal((await inspectLockWait('postgres',pg([{waiter_id:22,blocker_id:11,wait_type:'Lock'}]),22,11)).observed,true);
 assert.equal((await inspectLockWait('postgres',pg([{waiter_id:22,blocker_id:13,wait_type:'Lock'}]),22,11)).observed,false);
});
test('MySQL identifies exact blocker and waiter',async()=>{
 assert.equal((await inspectLockWait('mysql',my([{waiter_id:22,blocker_id:11}]),22,11)).observed,true);
 assert.equal((await inspectLockWait('mysql',my([]),22,11)).observed,false);
});
test('session identities require positive integers',async()=>{
 assert.equal(await sessionIdentity('postgres',pg([{session_id:12}])),12);
 await assert.rejects(sessionIdentity('mysql',my([{session_id:null}])),/identity/);
});
test('invalid or identical session IDs rejected',async()=>{
 await assert.rejects(inspectLockWait('postgres',pg([]),3,3),/Invalid/);
 await assert.rejects(inspectLockWait('mysql',my([]),-1,2),/Invalid/);
});
test('v3.4 manifest cannot run without explicit database opt-in',async()=>{
 const m=JSON.parse(readFileSync(new URL('../examples/conflict-postgres-v33.json',import.meta.url)));
 m.schema_version='3.4';
 await assert.rejects(executeConflictRecovery(m,{env:{}}),/opt-in/);
});
