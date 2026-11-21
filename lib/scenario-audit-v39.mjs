import {createHash} from 'node:crypto';
import {verifyScenarioReport} from './event-provenance-v38.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const kinds=['lost_update','non_repeatable_read','phantom_read','serialization_failure','retry_recovery'];
const terminal=new Set(['independent_final_state','execution_error','query_error','transaction_end_error','expected_error','unexpected_success','lock_evidence_unavailable','coordinated_lock','database_lock_evidence','retry_error','retry_success','forced_rollback']);
export function makeReplayPlan(manifest){
 if(!manifest||!['postgres','mysql'].includes(manifest.engine)||!Array.isArray(manifest.cases)||manifest.cases.length!==5||!kinds.every(k=>manifest.cases.filter(c=>c.kind===k).length===1))throw Error('Invalid five-case manifest');
 return {schema_version:'3.9',engine:manifest.engine,manifest_sha256:digest(manifest),cases:manifest.cases.map(c=>({id:c.id,kind:c.kind,isolation:c.isolation,control_ids:c.control_ids,setup_sha256:digest(c.setup),cleanup_sha256:digest(c.cleanup),verify_sha256:digest(c.verify),schedule:c.steps.map((step,index)=>({index,parallel:!!step.parallel,operations:(step.parallel??[step]).map(op=>({session:op.session,action:op.action,sql_sha256:op.sql?digest(op.sql):null,expected_error:op.expect_error??null}))}))}))};
}
export function auditScenarioReport(report,manifest){
 const plan=makeReplayPlan(manifest);
 if(!verifyScenarioReport(report)||report.engine!==plan.engine||report.manifest_sha256!==plan.manifest_sha256)throw Error('Invalid chain, engine, or manifest digest');
 const findings=[];const cases=[];
 for(const spec of plan.cases){
  const c=report.cases.find(x=>x.id===spec.id);
  if(!c||c.kind!==spec.kind||JSON.stringify(c.control_ids)!==JSON.stringify(spec.control_ids))throw Error('Case identity/control binding mismatch');
  const events=c.events.map(e=>e.event);
  const counts={};for(const e of events)counts[e.phase]=(counts[e.phase]??0)+1;
  const failures=[];
  const add=(code,severity,details)=>{const f={case_id:c.id,kind:c.kind,control_ids:c.control_ids,code,severity,details};failures.push(f);findings.push(f);};
  if(!events.some(e=>e.phase==='independent_final_state'))add('FINAL_STATE_NOT_OBSERVED','insufficient_evidence','No independent final-state read');
  for(const e of events){
   if(e.phase==='independent_final_state'&&e.pass===false)add('FINAL_STATE_MISMATCH','fail',{sql_sha256:e.sql_sha256,actual:e.actual,expected:e.expected});
   if(e.phase==='unexpected_success')add('EXPECTED_ERROR_MISSING','fail',{session:e.session,action:e.action});
   if(e.phase==='execution_error')add('EXECUTION_ERROR','insufficient_evidence',{error:e.error,message:e.message});
   if(e.phase==='lock_evidence_unavailable')add('LOCK_PROBE_UNAVAILABLE','insufficient_evidence',{code:e.code});
   if(e.phase==='query_error'||e.phase==='transaction_end_error'){
    const expected=events.some(x=>x.phase==='expected_error'&&x.session===e.session&&x.code===e.code);
    if(!expected)add('UNEXPECTED_DATABASE_ERROR','insufficient_evidence',{session:e.session,code:e.code,phase:e.phase});
   }
   if(e.phase==='coordinated_lock'&&e.result?.status!=='observed_pass_limited_scope')add('LOCK_CONFLICT_NOT_VERIFIED','insufficient_evidence',{status:e.result?.status});
  }
  if(!c.cleanup_complete)add('CLEANUP_INCOMPLETE','insufficient_evidence','Fixture cleanup or connection closure failed');
  if(c.status!=='observed_pass_limited')add('CASE_NOT_PASS','insufficient_evidence',{status:c.status});
  cases.push({id:c.id,kind:c.kind,control_ids:c.control_ids,case_status:c.status,event_count:events.length,phase_counts:counts,findings:failures,final_state_observed:!!counts.independent_final_state,lock_wait_observed:events.some(e=>e.phase==='database_lock_evidence'&&e.observed===true)||events.some(e=>e.phase==='coordinated_lock'&&e.result?.status==='observed_pass_limited_scope'),event_chain_head:c.events.at(-1)?.event_hash??null});
 }
 const status=findings.some(f=>f.severity==='fail')?'fail':findings.length?'insufficient_evidence':report.assessment?.exit_code===0&&report.assessment?.status==='observed_pass_limited_scope'?'observed_pass_limited_scope':'insufficient_evidence';
 return {schema_version:'3.9',engine:report.engine,manifest_sha256:plan.manifest_sha256,report_sha256:digest(report),replay_plan_sha256:digest(plan),status,exit_code:status==='fail'?1:status==='insufficient_evidence'?2:0,cases,findings,scope:'Recorded schedule and final-state assertions; parallel lock acquisition and error victim selection are not deterministic. No server-side proof without DB execution.'};
}
export function compareReplayAudits(baseline,candidate){
 if(baseline?.schema_version!=='3.9'||candidate?.schema_version!=='3.9'||baseline.engine!==candidate.engine||baseline.manifest_sha256!==candidate.manifest_sha256||baseline.replay_plan_sha256!==candidate.replay_plan_sha256)throw Error('Replay baseline mismatch');
 const differences=[];
 for(const a of baseline.cases){const b=candidate.cases.find(x=>x.id===a.id);if(!b)throw Error('Missing replay case');
  for(const field of ['case_status','final_state_observed','lock_wait_observed'])if(JSON.stringify(a[field])!==JSON.stringify(b[field]))differences.push({case_id:a.id,field,baseline:a[field],candidate:b[field]});
  const codes=x=>x.findings.map(f=>f.code).sort();if(JSON.stringify(codes(a))!==JSON.stringify(codes(b)))differences.push({case_id:a.id,field:'finding_codes',baseline:codes(a),candidate:codes(b)});
 }
 return {schema_version:'3.9',status:differences.length?'divergent':'matching_observed_outcomes',differences,warning:'Matching outcomes do not prove deterministic interleaving or complete transaction correctness.'};
}
