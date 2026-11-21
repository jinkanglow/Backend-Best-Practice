import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {inspectLockWait} from './database-lock-evidence.mjs';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const err=e=>({code:String(e?.code??e?.sqlState??'unknown'),message:String(e?.message??'').slice(0,160)});
/**
 * Start an already-identified waiting session's statement without awaiting it.
 * Sample DB-side blocking edges through an independent observer, then release holder.
 * No promise-pending inference is accepted as lock evidence.
 */
export async function coordinateLockConflict({engine,waiter,holder,observer,waiterId,holderId,waitSql,waitParams=[],releaseSql='COMMIT',pollMs=40,maxSamples=30,minimumMatches=2,inspect=inspectLockWait}={}){
 if(!['postgres','mysql'].includes(engine)||!waiter||!holder||!observer||!Number.isSafeInteger(waiterId)||!Number.isSafeInteger(holderId)||waiterId<=0||holderId<=0||waiterId===holderId)throw Error('Invalid independent lock coordination inputs');
 if(typeof waitSql!=='string'||!/^(UPDATE|DELETE|SELECT)\b/i.test(waitSql.trim())||/;/.test(waitSql)||!['COMMIT','ROLLBACK'].includes(releaseSql))throw Error('Unsafe coordination statement');
 if(!Number.isInteger(pollMs)||pollMs<1||pollMs>1000||!Number.isInteger(maxSamples)||maxSamples<1||maxSamples>1000||!Number.isInteger(minimumMatches)||minimumMatches<1||minimumMatches>maxSamples)throw Error('Invalid bounded sampling');
 const samples=[];let outcome;let settled=false;
 const pending=Promise.resolve().then(()=>waiter.query(waitSql,waitParams)).then(value=>{settled=true;outcome={kind:'success',value};},error=>{settled=true;outcome={kind:'error',error:err(error)};});
 let matching=0,probeError=null;
 try{
  for(let i=0;i<maxSamples;i++){
   try{
    const p=await inspect(engine,observer,waiterId,holderId);
    const observed=p?.observed===true;
    samples.push({sample:i+1,waiter_id:waiterId,blocker_id:holderId,observed,source:p?.source??'unknown',sample_count:p?.sample_count??0});
    if(observed)matching++;
   }catch(e){probeError=err(e);break;}
   if(matching>=minimumMatches||settled)break;
   await sleep(pollMs);
  }
  if(matching>=minimumMatches){
   try{await holder.query(releaseSql);}catch(e){probeError=err(e);}
  }
  // Do not await a blocked query indefinitely: caller must set server-side statement/lock timeouts.
  await Promise.race([pending,sleep(Math.max(1000,pollMs*maxSamples+1000))]);
  const status=probeError?'insufficient_evidence':matching<minimumMatches?'insufficient_evidence':!settled?'insufficient_evidence':'observed_pass_limited_scope';
  return {status,waiter_id:waiterId,blocker_id:holderId,matching_samples:matching,samples,release_attempted:matching>=minimumMatches,waiter_outcome:settled?outcome:{kind:'unresolved'},probe_error:probeError,evidence_sha256:digest({samples,outcome:settled?outcome?.kind:'unresolved',matching})};
 }finally{void pending;}
}
/** Deadlock victim is not predetermined. Exactly one known session must be victim. */
export function assessDeadlockOutcomes({a,b,allowedCodes=['1213','ER_LOCK_DEADLOCK'],finalStateObserved=false}={}){
 const victims=[['a',a],['b',b]].filter(([,x])=>x?.kind==='error'&&allowedCodes.includes(String(x.code)));
 const winners=[a,b].filter(x=>x?.kind==='committed');
 const valid=victims.length===1&&winners.length===1&&finalStateObserved===true;
 return {status:valid?'observed_pass_limited_scope':'insufficient_evidence',victim:victims[0]?.[0]??null,final_state_observed:finalStateObserved,reason:valid?'one_victim_one_commit_final_state_verified':'deadlock_outcome_not_verified'};
}
/** HMAC provenance: integrity only when secret is held by a separate trusted CI runner. */
export function signEvidence(envelope,{key,runId,issuer='ci-runner'}={}){
 if(typeof key!=='string'||key.length<32||!/^[-\w.]{1,128}$/.test(runId??''))throw Error('Trusted CI key and run ID required');
 const payload={schema_version:'3.7',issuer,run_id:runId,evidence_sha256:digest(envelope)};
 return {...payload,signature_algorithm:'HMAC-SHA256',signature:createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex')};
}
export function verifyEvidence(envelope,attestation,{key,expectedRunId}={}){
 if(!attestation||typeof key!=='string'||key.length<32||attestation.run_id!==expectedRunId||attestation.evidence_sha256!==digest(envelope)||attestation.signature_algorithm!=='HMAC-SHA256')return false;
 const payload={schema_version:attestation.schema_version,issuer:attestation.issuer,run_id:attestation.run_id,evidence_sha256:attestation.evidence_sha256};
 const expected=createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex');
 return typeof attestation.signature==='string'&&/^[0-9a-f]{64}$/.test(attestation.signature)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(attestation.signature,'hex'));
}
