import crypto from 'node:crypto';
import {runBehavioral} from './behavioral-assurance.mjs';

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const KNOWN = Object.freeze({authorization_negative:'BE-03-02',idempotency_concurrent:'BE-06-02'});

// Bind every observation to the exact manifest evaluated in this process.
export async function executeBehavioralGate(manifest,{required_controls=[],strict=true}={}) {
  if(!Array.isArray(required_controls)||required_controls.some(id=>typeof id!=='string')) throw Error('required_controls must be an array of strings');
  const manifest_sha256=digest(manifest);
  const execution=await runBehavioral(manifest);
  const controls={};
  for(const test of manifest.tests){
    const expected=KNOWN[test.kind];
    const actual=execution.results.find(r=>r.test_id===test.id);
    if(!actual||actual.control_id!==expected||actual.kind!==test.kind)throw Error('Behavioral evidence/control mismatch');
    if(!controls[expected])controls[expected]={control_id:expected,tests:[],status:'observed_pass'};
    controls[expected].tests.push({test_id:test.id,status:actual.status,evidence_sha256:actual.evidence_sha256});
    if(actual.status!=='observed_pass')controls[expected].status='observed_fail';
  }
  const required=[...new Set(required_controls)];
  for(const id of required){if(!controls[id])controls[id]={control_id:id,tests:[],status:'insufficient_evidence'};}
  const all=Object.values(controls);
  const failures=all.filter(c=>c.status==='observed_fail').length;
  const unknown=all.filter(c=>c.status==='insufficient_evidence').length;
  const status=failures?'fail':unknown&&strict?'insufficient_evidence':'observed_pass_limited_scope';
  return {schema_version:'2.9',manifest_sha256,execution,assessment:{status,exit_code:failures?1:unknown&&strict?2:0,controls:all,summary:{observed_fail:failures,insufficient_evidence:unknown,observed_pass:all.filter(c=>c.status==='observed_pass').length},limitations:['Locally generated evidence is not independently attested','Passing a finite scenario does not establish full control compliance','Database rollback and crash recovery are not verified by this gate']}};
}
