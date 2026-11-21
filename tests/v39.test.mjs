import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chainEvents} from '../lib/event-provenance-v38.mjs';
import {makeReplayPlan,auditScenarioReport,compareReplayAudits} from '../lib/scenario-audit-v39.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('../examples/anomaly-postgres-v39.json',import.meta.url)));
function fixture(){return {schema_version:'3.8',engine:manifest.engine,manifest_sha256:hash(manifest),cases:manifest.cases.map(c=>({id:c.id,kind:c.kind,control_ids:c.control_ids,status:'observed_pass_limited',cleanup_complete:true,events:chainEvents([{phase:'begin',session:'a'},{phase:'independent_final_state',pass:true,actual:[{value:1}],expected:[{value:1}]}],{caseId:c.id,engine:manifest.engine})})),assessment:{status:'observed_pass_limited_scope',exit_code:0}};}
test('v3.9 replay plan records five explicit transaction schedules and control bindings',()=>{const plan=makeReplayPlan(manifest);assert.equal(plan.cases.length,5);assert(plan.cases.every(c=>c.schedule.length>0&&c.control_ids.length>0));});
test('v3.9 audit passes chain-verified five-case evidence with independent final reads',()=>{const a=auditScenarioReport(fixture(),manifest);assert.equal(a.exit_code,0);assert.equal(a.cases.length,5);});
test('v3.9 failed independent final state is attributed to control and case',()=>{const r=fixture(),c=r.cases[0];c.events=chainEvents([{phase:'independent_final_state',pass:false,actual:[{value:1}],expected:[{value:2}]}],{caseId:c.id,engine:r.engine});const a=auditScenarioReport(r,manifest);assert.equal(a.exit_code,1);assert.equal(a.findings[0].code,'FINAL_STATE_MISMATCH');assert.deepEqual(a.findings[0].control_ids,c.control_ids);});
test('v3.9 execution error and missing final state are insufficient evidence',()=>{const r=fixture(),c=r.cases[1];c.events=chainEvents([{phase:'execution_error',error:'40001'}],{caseId:c.id,engine:r.engine});const a=auditScenarioReport(r,manifest);assert.equal(a.exit_code,2);assert(a.findings.some(f=>f.code==='FINAL_STATE_NOT_OBSERVED'));});
test('v3.9 reject tampered chain and wrong manifest',()=>{const r=fixture();r.cases[0].events[0].phase='changed';assert.throws(()=>auditScenarioReport(r,manifest));const m=structuredClone(manifest);m.cases[0].isolation='serializable';assert.throws(()=>auditScenarioReport(fixture(),m));});
test('v3.9 replay comparison flags divergent observed outcomes without demanding identical event hashes',()=>{const a=auditScenarioReport(fixture(),manifest),b=structuredClone(a);assert.equal(compareReplayAudits(a,b).status,'matching_observed_outcomes');b.cases[0].case_status='observed_fail';assert.equal(compareReplayAudits(a,b).status,'divergent');});
test('v3.9 both DB example manifests have exactly five kinds',()=>{for(const engine of ['postgres','mysql']){const m=JSON.parse(readFileSync(new URL(`../examples/anomaly-${engine}-v39.json`,import.meta.url)));assert.equal(m.schema_version,'3.9');assert.equal(makeReplayPlan(m).cases.length,5);}});
