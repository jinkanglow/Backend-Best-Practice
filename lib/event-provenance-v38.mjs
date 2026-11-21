import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
/** Hash-chain events with explicit case/engine domain separation. */
export function chainEvents(events,{caseId,engine}={}){
 if(!Array.isArray(events)||!caseId||!engine)throw Error('Event chain context required');
 let previous='0'.repeat(64);
 return events.map((event,i)=>{const payload={schema_version:'3.8',case_id:caseId,engine,index:i,previous_hash:previous,event};const event_hash=hash(payload);previous=event_hash;return {...event,...payload,event_hash};});
}
export function verifyEventChain(events,{caseId,engine}={}){
 if(!Array.isArray(events)||!caseId||!engine)return false;
 let previous='0'.repeat(64);
 for(let i=0;i<events.length;i++){
  const x=events[i];if(x.schema_version!=='3.8'||x.case_id!==caseId||x.engine!==engine||x.index!==i||x.previous_hash!==previous)return false;
  for(const [k,v] of Object.entries(x.event??{}))if(JSON.stringify(x[k])!==JSON.stringify(v))return false;
  const payload={schema_version:x.schema_version,case_id:x.case_id,engine:x.engine,index:x.index,previous_hash:x.previous_hash,event:x.event};
  if(hash(payload)!==x.event_hash)return false;previous=x.event_hash;
 }
 return true;
}
export function verifyScenarioReport(report){return report?.schema_version==='3.8'&&['postgres','mysql'].includes(report.engine)&&Array.isArray(report.cases)&&report.cases.length===5&&report.cases.every(c=>verifyEventChain(c.events,{caseId:c.id,engine:report.engine}));}
/** Integrity envelope; CI key must remain outside the test executor's trust boundary. */
export function attestReport(report,{key,runId}={}){
 if(!verifyScenarioReport(report)||typeof key!=='string'||key.length<32||!/^[-\w.]{1,128}$/.test(runId??''))throw Error('Valid report, CI secret and run ID required');
 const payload={schema_version:'3.8',run_id:runId,report_sha256:hash(report),chain_heads:report.cases.map(c=>({id:c.id,head:c.events.at(-1)?.event_hash??null}))};
 return {...payload,algorithm:'HMAC-SHA256',signature:createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex')};
}
export function verifyAttestation(report,attestation,{key,runId}={}){
 if(!verifyScenarioReport(report)||typeof key!=='string'||key.length<32||!attestation||attestation.run_id!==runId||attestation.schema_version!=='3.8'||attestation.algorithm!=='HMAC-SHA256')return false;
 const payload={schema_version:'3.8',run_id:runId,report_sha256:hash(report),chain_heads:report.cases.map(c=>({id:c.id,head:c.events.at(-1)?.event_hash??null}))};
 const sig=createHmac('sha256',key).update(JSON.stringify(payload)).digest('hex');
 return attestation.report_sha256===payload.report_sha256&&JSON.stringify(attestation.chain_heads)===JSON.stringify(payload.chain_heads)&&typeof attestation.signature==='string'&&/^[0-9a-f]{64}$/.test(attestation.signature)&&timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(attestation.signature,'hex'));
}
