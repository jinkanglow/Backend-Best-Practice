import {createHash} from 'node:crypto';
import {catalog} from './controls.mjs';
import {sessionIdentity, inspectLockWait} from './database-lock-evidence.mjs';
import {coordinateLockConflict} from './async-lock-coordinator.mjs';
import {chainEvents} from './event-provenance-v38.mjs';
import {auditScenarioReport,makeReplayPlan} from './scenario-audit-v39.mjs';
const known=new Set(catalog.map(x=>x.id));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const assert=(x,msg)=>{if(!x)throw Error(msg)};
const allowed=/^(SELECT|UPDATE|INSERT|DELETE)\b/i;
const sqlOK=s=>typeof s==='string'&&s.length<10000&&allowed.test(s.trim())&&!/;|\b(DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i.test(s);
const code=e=>String(e?.code??e?.sqlState??e?.errno??'unknown');
const accepted=(expected,actual)=>Array.isArray(expected)?expected.includes(actual):expected===actual;
const errorCode=e=>({code:code(e),sqlstate:e?.sqlState??null,errno:e?.errno??null});
async function native(engine,url){
 if(engine==='postgres'){const {Client}=await import('pg');const c=new Client({connectionString:url,connectionTimeoutMillis:5000,query_timeout:8000});await c.connect();return {query:(s,p)=>c.query(s,p),close:()=>c.end()};}
 const {createConnection}=await import('mysql2/promise');const c=await createConnection(url);return {query:(s,p)=>c.query(s,p),close:()=>c.end()};
}
const data=(engine,r)=>engine==='postgres'?r.rows:Array.isArray(r[0])?r[0]:[];
const changed=(engine,r)=>engine==='postgres'?r.rowCount:r[0]?.affectedRows;
function validate(m){
 assert(['3.5','3.6','3.8','3.9'].includes(m?.schema_version)&&['postgres','mysql'].includes(m.engine),'Invalid scenario manifest');
 assert(m.disposable_database_acknowledged===true&&m.allow_mutations===true,'Disposable database opt-in required');
 assert(/^[A-Z][A-Z0-9_]*$/.test(m.connection_env||''),'Connection env required');
 assert(Array.isArray(m.cases)&&m.cases.length===5,'Exactly five independent anomaly cases required');
 const kinds=['lost_update','non_repeatable_read','phantom_read','serialization_failure','retry_recovery'];
 assert(kinds.every(k=>m.cases.filter(c=>c.kind===k).length===1),'All five unique scenario kinds required');
 for(const c of m.cases){
  assert(/^[a-z0-9_-]{1,64}$/.test(c.id||''),'Invalid case ID');
  assert(['read_committed','repeatable_read','serializable'].includes(c.isolation),'Invalid isolation');
  assert(Array.isArray(c.control_ids)&&c.control_ids.length>0&&c.control_ids.every(x=>known.has(x)),'Unknown Control ID');
  assert(Array.isArray(c.setup)&&c.setup.length&&Array.isArray(c.cleanup)&&c.cleanup.length,'Setup and cleanup required');
  assert(Array.isArray(c.steps)&&c.steps.length>=3&&c.steps.length<=30,'Steps required');
  assert(Array.isArray(c.verify)&&c.verify.length,'Independent final-state assertions required');
  for(const s of [...c.setup,...c.cleanup,...c.verify,...c.steps.flatMap(x=>x.parallel??[x])]){
   if(s.sql!==undefined){assert(sqlOK(s.sql)&&Array.isArray(s.params??[]),'Invalid SQL or parameters');}
   if(s.expect_rows!==undefined)assert(Number.isInteger(s.expect_rows)&&s.expect_rows>=0,'Invalid row count');
   if(s.expect_error!==undefined)assert((Array.isArray(s.expect_error)?s.expect_error:[s.expect_error]).length>0&&(Array.isArray(s.expect_error)?s.expect_error:[s.expect_error]).every(x=>/^[A-Z0-9_]{2,30}$/.test(String(x))),'Invalid error code');
  }
  for(const s of c.verify)assert(sqlOK(s.sql)&&Array.isArray(s.expected)&&s.expected.length>=0,'Verification must contain exact expected rows');
  for(const s of c.steps){
   const group=s.parallel??[s];assert(Array.isArray(group)&&group.length>0&&group.length<=2,'Invalid parallel group');
   for(const op of group){assert(['a','b'].includes(op.session)&&['begin','query','commit','rollback','retry','lock_probe','coordinated_lock'].includes(op.action),'Invalid transaction step');if(op.action==='coordinated_lock'){assert(c.require_session_identity===true&&['a','b'].includes(op.waiter)&&['a','b'].includes(op.holder)&&op.waiter!==op.holder,'Coordinated lock requires distinct identified sessions');assert(sqlOK(op.sql)&&/^(UPDATE|DELETE|SELECT)\b/i.test(op.sql.trim()),'Coordinated SQL required');assert(['COMMIT','ROLLBACK'].includes(op.release_sql??'COMMIT'),'Invalid holder release');}
    if(op.action==='lock_probe')assert(c.require_session_identity===true&&['a','b'].includes(op.waiter)&&['a','b'].includes(op.blocker)&&op.waiter!==op.blocker,'Lock probe needs explicit distinct sessions');}
  }
 }
}
const normalized=r=>JSON.parse(JSON.stringify(r));
export async function executeAnomalyScenarios(manifest,{drivers={},env=process.env}={}){
 validate(manifest);
 assert(env.BACKEND_GUARD_ALLOW_DB_TESTS==='yes'&&env[manifest.connection_env],'Explicit database execution opt-in and URL required');
 const connect=drivers[manifest.engine]?.connect??(url=>native(manifest.engine,url));
 const cases=[];
 for(const c of manifest.cases){
  const events=[];let a,b,observer;let state={a:false,b:false};let failed=false,unknown=false,clean=true;let identities={};let lockEvidence=[];
  const emit=(phase,fields={})=>events.push({phase,...fields});
  const query=async(db,s)=>db.query(s.sql,s.params??[]);
  async function begin(db){
   const iso=c.isolation.replaceAll('_',' ').toUpperCase();
   if(manifest.engine==='mysql')await db.query('SET TRANSACTION ISOLATION LEVEL '+iso);
   await db.query('BEGIN');
   if(manifest.engine==='postgres'){await db.query('SET TRANSACTION ISOLATION LEVEL '+iso);await db.query("SET LOCAL lock_timeout = '2500ms'");}
   else await db.query('SET SESSION innodb_lock_wait_timeout = 3');
  }
  async function step(s){
   const db=s.session==='a'?a:b;const name=s.session;
   if(s.action==='begin'){assert(!state[name],'Transaction already open');await begin(db);state[name]=true;emit('begin',{session:name});return;}
   if(s.action==='commit'||s.action==='rollback'){assert(state[name],'No transaction to finish');try{await db.query(s.action.toUpperCase());state[name]=false;emit(s.action,{session:name});if(s.expect_error){failed=true;emit('unexpected_success',{session:name,action:s.action});}}catch(e){emit('transaction_end_error',{session:name,action:s.action,...errorCode(e)});if(!accepted(s.expect_error,code(e)))unknown=true;else emit('expected_error',{session:name,action:s.action,code:code(e)});}return;}
   if(s.action==='coordinated_lock'){
    assert(observer&&identities[s.waiter]&&identities[s.holder],'Coordinated lock requires verified identities');
    assert(state[s.waiter]&&state[s.holder],'Both transactions must be active');
    const waiter=s.waiter==='a'?a:b,holder=s.holder==='a'?a:b;
    const r=await coordinateLockConflict({engine:manifest.engine,waiter,holder,observer,waiterId:identities[s.waiter],holderId:identities[s.holder],waitSql:s.sql,waitParams:s.params??[],releaseSql:s.release_sql??'COMMIT',pollMs:s.poll_ms??40,maxSamples:s.max_samples??30,minimumMatches:s.minimum_matches??2});
    emit('coordinated_lock',{session:name,waiter:s.waiter,holder:s.holder,sql_sha256:sha(s.sql),result:r});
    lockEvidence.push(...r.samples.map(x=>({...x,waiter:s.waiter,blocker:s.holder})));
    if(r.release_attempted)state[s.holder]=false;
    if(r.status!=='observed_pass_limited_scope'||r.waiter_outcome?.kind!=='success')unknown=true;
    if(s.expect_affected!==undefined&&changed(manifest.engine,r.waiter_outcome?.value)!==s.expect_affected)failed=true;
    return;
   }
   if(s.action==='lock_probe'){
    assert(observer&&identities[s.waiter]&&identities[s.blocker],'Lock probe requires session identities');
    try{const evidence=await inspectLockWait(manifest.engine,observer,identities[s.waiter],identities[s.blocker]);const item={session:name,waiter:s.waiter,blocker:s.blocker,waiter_id:identities[s.waiter],blocker_id:identities[s.blocker],...evidence};lockEvidence.push(item);emit('database_lock_evidence',item);if(!evidence.observed)unknown=true;}catch(e){unknown=true;emit('lock_evidence_unavailable',{...errorCode(e)});}return;
   }
   if(s.action==='retry'){
    assert(!state[name],'Retry requires rollback first');assert(Number.isInteger(s.max_attempts)&&s.max_attempts>=1&&s.max_attempts<=3,'Invalid retry bound');
    assert(sqlOK(s.sql),'Retry query required');let success=false;
    for(let i=1;i<=s.max_attempts;i++){
     try{await begin(db);state[name]=true;const r=await query(db,s);if(s.expect_affected!==undefined)assert(changed(manifest.engine,r)===s.expect_affected,'Retry affected mismatch');await db.query('COMMIT');state[name]=false;emit('retry_success',{session:name,attempt:i});success=true;break;}
     catch(e){emit('retry_error',{session:name,attempt:i,...errorCode(e)});if(state[name]){try{await db.query('ROLLBACK')}finally{state[name]=false;}}if(!Array.isArray(s.retryable_errors)||!s.retryable_errors.includes(code(e)))break;}
    }
    if(!success)failed=true;return;
   }
   assert(s.action==='query'&&sqlOK(s.sql),'Invalid query step');
   try{
    const r=await query(db,s);const rows=data(manifest.engine,r),aff=changed(manifest.engine,r);
    emit('query',{session:name,sql_sha256:sha(s.sql),rows:normalized(rows),affected_rows:aff});
    if(s.expect_error){failed=true;emit('unexpected_success',{session:name,expected_error:s.expect_error});}
    if(s.expected!==undefined&&!same(rows,s.expected))failed=true;
    if(s.expect_rows!==undefined&&rows.length!==s.expect_rows)failed=true;
    if(s.expect_affected!==undefined&&aff!==s.expect_affected)failed=true;
   }catch(e){
    emit('query_error',{session:name,sql_sha256:sha(s.sql),...errorCode(e)});
    if(!accepted(s.expect_error,code(e))){unknown=true;}else emit('expected_error',{session:name,action:'query',code:code(e)});
   }
  }
  try{
   observer=await connect(env[manifest.connection_env]);
   for(const s of c.setup)await query(observer,s);
   a=await connect(env[manifest.connection_env]);b=await connect(env[manifest.connection_env]);
   if(c.require_session_identity){identities={a:await sessionIdentity(manifest.engine,a),b:await sessionIdentity(manifest.engine,b)};emit('session_identity',{...identities});}
   for(const s of c.steps){
    if(s.parallel){emit('parallel_barrier',{count:s.parallel.length});await Promise.all(s.parallel.map(step));}
    else await step(s);
   }
   for(const s of c.verify){
    const r=await query(observer,s);const actual=data(manifest.engine,r);const ok=same(actual,s.expected);
    emit('independent_final_state',{sql_sha256:sha(s.sql),actual:normalized(actual),expected:s.expected,pass:ok});if(!ok)failed=true;
   }
  }catch(e){unknown=true;emit('execution_error',{error:code(e),message:String(e.message||'').slice(0,160)});}
  finally{
   for(const [name,db] of [['a',a],['b',b]])if(db&&state[name])try{await db.query('ROLLBACK');state[name]=false;emit('forced_rollback',{session:name});}catch{clean=false;}
   if(observer)for(const s of c.cleanup)try{await query(observer,s);}catch{clean=false;}
   for(const db of [a,b,observer])if(db)try{await db.close();}catch{clean=false;}
  }
  if(!clean)unknown=true;
  cases.push({id:c.id,kind:c.kind,control_ids:c.control_ids,lock_evidence:lockEvidence,session_ids:identities,status:unknown?'insufficient_evidence':failed?'observed_fail':'observed_pass_limited',cleanup_complete:clean,events:chainEvents(events,{caseId:c.id,engine:manifest.engine})});
 }
 const hasFail=cases.some(c=>c.status==='observed_fail'),hasUnknown=cases.some(c=>c.status==='insufficient_evidence');
 const report={schema_version:'3.8',engine:manifest.engine,manifest_sha256:sha(manifest),cases,assessment:{status:hasFail?'fail':hasUnknown?'insufficient_evidence':'observed_pass_limited_scope',exit_code:hasFail?1:hasUnknown?2:0,scope:'Five scheduled scenarios with independent final-state reads; not an exhaustive isolation or crash-recovery proof.'}};
 if(manifest.schema_version==='3.9'){report.replay_plan=makeReplayPlan(manifest);report.audit=auditScenarioReport(report,manifest);if(report.audit.exit_code!==0){report.assessment.status=report.audit.status;report.assessment.exit_code=report.audit.exit_code;}}
 return report;
}
function same(a,b){return JSON.stringify(normalized(a))===JSON.stringify(normalized(b));}
