import {sessionIdentity, inspectLockWait} from './database-lock-evidence.mjs';
import {createHash} from 'node:crypto';
import {catalog} from './controls.mjs';
const known=new Set(catalog.map(x=>x.id));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const insist=(x,m)=>{if(!x)throw Error(m)};
const errorCode=e=>String(e?.code||e?.sqlState||e?.errno||'unknown_error');
const validSQL=s=>typeof s==='string'&&s.length>0&&s.length<=10000&&/^(SELECT|UPDATE|INSERT|DELETE)\b/i.test(s.trim())&&!/;|\b(DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i.test(s);
async function native(engine,url){
 if(engine==='postgres'){const {Client}=await import('pg');const c=new Client({connectionString:url,connectionTimeoutMillis:5000});await c.connect();return {query:(q,p)=>c.query(q,p),close:()=>c.end()};}
 const {createConnection}=await import('mysql2/promise');const c=await createConnection(url);return {query:(q,p)=>c.query(q,p),close:()=>c.end()};
}
const rows=(engine,result)=>engine==='postgres'?result.rows:result[0];
const affected=(engine,result)=>engine==='postgres'?result.rowCount:result[0]?.affectedRows;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function validate(m){
 insist(['3.3','3.4'].includes(m?.schema_version)&&['postgres','mysql'].includes(m.engine),'Invalid v3.3 manifest');
 insist(m.test_database_acknowledged===true&&m.allow_mutation_on_test_database===true,'Disposable database acknowledgement required');
 insist(/^[A-Z][A-Z0-9_]*$/.test(m.connection_env||''),'Connection environment name required');
 insist(Array.isArray(m.cases)&&m.cases.length>0&&m.cases.length<=20,'1..20 cases required');
 const ids=new Set();
 for(const c of m.cases){
  insist(/^[\w.-]{1,80}$/.test(c.id||'')&&!ids.has(c.id),'Unique case ID required');ids.add(c.id);
  insist(['lock_conflict','retry_recovery'].includes(c.kind),'Unsupported case kind');
  insist(['read_committed','repeatable_read','serializable'].includes(c.isolation),'Invalid isolation');
  insist(Array.isArray(c.control_ids)&&c.control_ids.length>0&&c.control_ids.every(x=>known.has(x)),'Known control IDs required');
  insist(Array.isArray(c.setup)&&c.setup.length>0&&Array.isArray(c.cleanup)&&c.cleanup.length>0,'Explicit setup and cleanup required');
  for(const s of [...c.setup,...c.cleanup])insist(validSQL(s.sql)&&Array.isArray(s.params||[]),'Unsafe setup/cleanup SQL');
  insist(validSQL(c.hold.sql)&&validSQL(c.contender.sql)&&validSQL(c.verify.sql),'Hold, contender, verify SQL required');
  insist(Array.isArray(c.hold.params||[])&&Array.isArray(c.contender.params||[])&&Array.isArray(c.verify.params||[]),'Parameters must be arrays');
  insist(c.hold.sql.trim().toUpperCase().startsWith('UPDATE')&&c.contender.sql.trim().toUpperCase().startsWith('UPDATE'),'Conflict requires two UPDATE statements');
  insist(Number.isInteger(c.verify.expected_value)&&Number.isInteger(c.verify.expected_rows)&&c.verify.expected_rows>=1,'Final state assertion required');
  insist(['commit','rollback'].includes(c.release),'Explicit holder release required');
  insist(Number.isInteger(c.lock_timeout_ms)&&c.lock_timeout_ms>=100&&c.lock_timeout_ms<=5000,'Lock timeout must be 100..5000 ms');
  insist(Number.isInteger(c.probe_ms)&&c.probe_ms>=10&&c.probe_ms<=Math.min(500,c.lock_timeout_ms/2),'Probe window must be shorter than lock timeout');
  insist(Number.isInteger(c.max_retries)&&c.max_retries>=0&&c.max_retries<=3,'Bounded retry count required');
  insist(Array.isArray(c.retryable_errors)&&c.retryable_errors.length>0&&c.retryable_errors.every(x=>/^[A-Z0-9_]{2,30}$/.test(x)),'Retryable SQLSTATE codes required');
 }
}
export async function executeConflictRecovery(manifest,{drivers={},env=process.env}={}){
 validate(manifest);
 insist(env.BACKEND_GUARD_ALLOW_DB_TESTS==='yes','Database opt-in required');
 insist(env[manifest.connection_env],'Missing database URL');
 const connect=drivers[manifest.engine]?.connect||((url)=>native(manifest.engine,url));
 const requireLockEvidence=manifest.schema_version==='3.4';
 const results=[];
 for(const c of manifest.cases){
  const events=[];let failed=false,unknown=false,cleanupOK=true,holder,contender,observer,contenderTx=false,holderTx=false;
  const record=(stage,details={})=>events.push({stage,...details});
  const query=async(db,s)=>db.query(s.sql,s.params||[]);
  const begin=async(db)=>{
   if(manifest.engine==='mysql')await db.query('SET TRANSACTION ISOLATION LEVEL '+c.isolation.replaceAll('_',' ').toUpperCase());
   await db.query('BEGIN');
   if(manifest.engine==='postgres'){
    await db.query('SET TRANSACTION ISOLATION LEVEL '+c.isolation.replaceAll('_',' ').toUpperCase());
    await db.query(`SET LOCAL lock_timeout = '${c.lock_timeout_ms}ms'`);
   }else await db.query(`SET SESSION innodb_lock_wait_timeout = ${Math.max(1,Math.ceil(c.lock_timeout_ms/1000))}`);
  };
  try{
   observer=await connect(env[manifest.connection_env]);
   for(const s of c.setup)await query(observer,s);
   holder=await connect(env[manifest.connection_env]);contender=await connect(env[manifest.connection_env]);
   await begin(holder);holderTx=true;
   const h=await query(holder,c.hold);record('holder_lock',{affected_rows:affected(manifest.engine,h),sql_sha256:hash(c.hold.sql)});
   insist(affected(manifest.engine,h)===1,'Holder did not update exactly one row');
   await begin(contender);contenderTx=true;
   const holderId=requireLockEvidence?await sessionIdentity(manifest.engine,holder):null;
   const contenderId=requireLockEvidence?await sessionIdentity(manifest.engine,contender):null;
   // Launch the contender query without awaiting it. The pending probe verifies that it has not completed
   // before releasing the holder; it cannot prove which internal database lock is being waited on.
   let settled=false, outcome;
   const pending=query(contender,c.contender).then(r=>({ok:true,r}),e=>({ok:false,error:errorCode(e)})).then(x=>{settled=true;return x});
   await sleep(c.probe_ms);
   record('contention_probe',{pending:!settled,probe_ms:c.probe_ms});
   if(settled)failed=true;
   if(requireLockEvidence){
    let lockEvidence;
    try{lockEvidence=await inspectLockWait(manifest.engine,observer,contenderId,holderId);}
    catch(e){unknown=true;record('database_lock_observation_error',{code:errorCode(e)});}
    if(lockEvidence){record('database_lock_observation',lockEvidence);if(!lockEvidence.observed)unknown=true;}
   }
   await holder.query(c.release.toUpperCase());holderTx=false;record('holder_release',{action:c.release});
   // A driver that never settles must not hang the runner indefinitely.
   outcome=await Promise.race([pending,sleep(c.lock_timeout_ms+1500).then(()=>({timed_out:true}))]);
   if(outcome.timed_out){unknown=true;record('contender_timeout');}
   else if(outcome.ok){record('contender_result',{affected_rows:affected(manifest.engine,outcome.r)});if(affected(manifest.engine,outcome.r)!==1)failed=true;await contender.query('COMMIT');contenderTx=false;}
   else{
    record('contender_error',{code:outcome.error});
    if(!c.retryable_errors.includes(outcome.error))unknown=true;
    // PostgreSQL failed transactions must be rolled back before further queries.
    await contender.query('ROLLBACK');contenderTx=false;record('connection_recovered',{method:'rollback'});
    let recovered=false;
    if(c.kind==='retry_recovery'&&c.retryable_errors.includes(outcome.error)){
     for(let attempt=1;attempt<=c.max_retries;attempt++){
      try{await begin(contender);contenderTx=true;const r=await query(contender,c.contender);insist(affected(manifest.engine,r)===1,'Retry affected unexpected rows');await contender.query('COMMIT');contenderTx=false;record('retry_success',{attempt});recovered=true;break;}
      catch(e){record('retry_error',{attempt,code:errorCode(e)});if(contenderTx){await contender.query('ROLLBACK');contenderTx=false;}if(!c.retryable_errors.includes(errorCode(e)))break;}
     }
    }
    if(!recovered)failed=true;
   }
   const verification=await query(observer,c.verify),data=rows(manifest.engine,verification);
   const actual=data?.[0]?.value;
   const pass=Array.isArray(data)&&data.length===c.verify.expected_rows&&Number(actual)===c.verify.expected_value;
   record('final_state',{pass,row_count:data?.length??null,expected_value:c.verify.expected_value,actual_value:actual??null,query_sha256:hash(c.verify.sql)});
   if(!pass)failed=true;
  }catch(e){unknown=true;record('execution_error',{code:errorCode(e)});}
  finally{
   for(const [db,tx] of [[holder,holderTx],[contender,contenderTx]])if(db&&tx){try{await db.query('ROLLBACK')}catch{cleanupOK=false;}}
   if(observer){for(const s of c.cleanup){try{await query(observer,s)}catch{cleanupOK=false;}}}
   for(const db of [holder,contender,observer])if(db)try{await db.close()}catch{cleanupOK=false;}
  }
  if(!cleanupOK)unknown=true;
  results.push({id:c.id,kind:c.kind,control_ids:c.control_ids,status:unknown?'insufficient_evidence':failed?'observed_fail':'observed_pass',cleanup_complete:cleanupOK,events});
 }
 const failure=results.some(x=>x.status==='observed_fail'),incomplete=results.some(x=>x.status==='insufficient_evidence');
 return {schema_version:manifest.schema_version,engine:manifest.engine,manifest_sha256:hash(manifest),cases:results,assessment:{status:failure?'fail':incomplete?'insufficient_evidence':'observed_pass_limited',exit_code:failure?1:incomplete?2:0,scope:requireLockEvidence?'Database-reported blocker/waiter relationship for sampled row-lock test only; no exhaustive anomaly proof.':'Client-side pending probe only; no database lock proof.'}};
}
