import crypto from 'node:crypto';
import {executeTransactionSchedule} from './transaction-scheduler.mjs';
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const check=(v,msg)=>{if(!v)throw Error(msg)};
const safeSQL=s=>typeof s==='string'&&s.length<20000&&/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(s)&&!(/;\s*\S|\b(CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|COPY|LOAD_FILE|OUTFILE|INFILE)\b/i.test(s));
const code=e=>String(e?.code||e?.sqlState||'execution_error');
async function nativeConnect(engine,url){
 if(engine==='postgres'){const {Client}=await import('pg');const c=new Client({connectionString:url,connectionTimeoutMillis:5000});await c.connect();return {query:(sql,p)=>c.query(sql,p),close:()=>c.end()}}
 const {createConnection}=await import('mysql2/promise');const c=await createConnection(url);return {query:(sql,p)=>c.query(sql,p),close:()=>c.end()};
}
function rows(engine,r){return engine==='postgres'?r.rows:r[0]}
function assertStep(step,actual){const checks=[];
 if(step.expect_error!==undefined)checks.push({kind:'error',pass:step.expect_error===actual.error,expected:step.expect_error,actual:actual.error});
 if(step.assert?.row_count!==undefined)checks.push({kind:'row_count',pass:actual.row_count===step.assert.row_count,expected:step.assert.row_count,actual:actual.row_count});
 if(step.assert?.first_row!==undefined)checks.push({kind:'first_row',pass:JSON.stringify(actual.first_row)===JSON.stringify(step.assert.first_row),expected_sha256:digest(step.assert.first_row),actual_sha256:digest(actual.first_row)});
 if(step.assert?.affected_rows!==undefined)checks.push({kind:'affected_rows',pass:actual.affected_rows===step.assert.affected_rows,expected:step.assert.affected_rows,actual:actual.affected_rows});
 return checks;
}
export async function executeParallelTransaction(manifest,{drivers={},env=process.env}={}){
 check(manifest?.schema_version==='3.2'&&['postgres','mysql'].includes(manifest.engine),'Invalid v3.2 manifest');
 check(manifest.test_database_acknowledged===true&&manifest.allow_mutation_on_test_database===true,'Disposable database acknowledgement required');
 check(env.BACKEND_GUARD_ALLOW_DB_TESTS==='yes','Explicit DB opt-in required');
 check(/^[A-Z][A-Z0-9_]*$/.test(manifest.connection_env||'')&&env[manifest.connection_env],'Connection URL environment variable missing');
 check(Array.isArray(manifest.cases)&&manifest.cases.length>0&&manifest.cases.length<=20,'1..20 cases required');
 const connect=drivers[manifest.engine]?.connect||((url)=>nativeConnect(manifest.engine,url));const results=[];
 for(const c of manifest.cases){
  check(/^[\w.-]{1,80}$/.test(c.id||'')&&Array.isArray(c.control_ids)&&c.control_ids.length>0&&c.control_ids.every(x=>/^BE-\d\d-\d\d$/.test(x)),'Case ID and control IDs required');
  check(['read_committed','repeatable_read','serializable'].includes(c.isolation),'Invalid isolation');
  check(Array.isArray(c.phases)&&c.phases.length>0&&c.phases.length<=30,'1..30 phases required');
  const all=[...(c.setup||[]),...(c.cleanup||[])];for(const p of c.phases){check(Array.isArray(p.steps)&&p.steps.length>0&&p.steps.length<=3,'Phase requires 1..3 steps');all.push(...p.steps)}
  for(const s of all){check(['a','b','observer'].includes(s.session),'Invalid session');check(['begin','commit','rollback','query'].includes(s.action),'Invalid action');if(s.action==='query')check(safeSQL(s.sql)&&Array.isArray(s.params||[]),'Unsafe or invalid SQL');check(!s.expect_error||/^[\w-]{2,30}$/.test(s.expect_error),'Invalid expected error')}
  check((c.setup||[]).every(s=>s.session==='observer'&&s.action==='query')&&(c.cleanup||[]).every(s=>s.session==='observer'&&s.action==='query'),'Setup/cleanup require observer DML only');
  const sessions=new Map(),events=[];let incomplete=false,failed=false,cleanupFailed=false;
  const get=async name=>{if(!sessions.has(name))sessions.set(name,{db:await connect(env[manifest.connection_env]),tx:false});return sessions.get(name)};
  async function step(s,phase){let error=null,r=null,affected=null;const sess=await get(s.session);
   try{
    if(s.action==='begin'){
     check(!sess.tx,'Nested transaction');if(manifest.engine==='mysql')await sess.db.query('SET TRANSACTION ISOLATION LEVEL '+c.isolation.replaceAll('_',' ').toUpperCase());
     await sess.db.query('BEGIN');sess.tx=true;
     if(manifest.engine==='postgres')await sess.db.query('SET TRANSACTION ISOLATION LEVEL '+c.isolation.replaceAll('_',' ').toUpperCase());
     const lockMs=Math.min(Math.max(Number(c.lock_timeout_ms||1000),100),10000);
     if(manifest.engine==='postgres')await sess.db.query(`SET LOCAL lock_timeout = '${lockMs}ms'`);
     else await sess.db.query(`SET SESSION innodb_lock_wait_timeout = ${Math.max(1,Math.ceil(lockMs/1000))}`);
    }else if(s.action==='commit'||s.action==='rollback'){
     check(sess.tx,'Transaction not started');await sess.db.query(s.action.toUpperCase());sess.tx=false;
    }else{
     const result=await sess.db.query(s.sql,s.params||[]);if(/^\s*(SELECT|WITH)\b/i.test(s.sql))r=rows(manifest.engine,result);
     affected=manifest.engine==='postgres'?result.rowCount:result[0]?.affectedRows;
    }
   }catch(e){error=code(e)}
   const actual={error,row_count:r?.length??null,first_row:r?.[0]??null,affected_rows:affected};const checks=error&&!s.expect_error?[]:assertStep(s,actual);
   if(checks.some(x=>!x.pass))failed=true;
   if(error&&!s.expect_error)incomplete=true;
   if(s.expect_error&&!error)failed=true;
   events.push({phase,id:s.id||null,session:s.session,action:s.action,sql_sha256:s.sql?digest(s.sql):undefined,error:actual.error,row_count:actual.row_count,first_row_sha256:digest(actual.first_row),affected_rows:actual.affected_rows,checks});
   return actual;
  }
  try{
   for(const s of c.setup||[])await step(s,'setup');
   for(let i=0;i<c.phases.length&&!incomplete;i++){
    const p=c.phases[i];const sessionsInPhase=p.steps.map(s=>s.session);
    check(new Set(sessionsInPhase).size===sessionsInPhase.length,'One step per session per barrier phase');
    // A phase is a synchronization barrier: all steps start without awaiting one another.
    await Promise.all(p.steps.map(s=>step(s,`barrier-${i}`)));
   }
  }catch(e){incomplete=true;events.push({phase:'scheduler',error:code(e)})}
  finally{
   for(const sess of sessions.values())if(sess.tx){try{await sess.db.query('ROLLBACK');sess.tx=false}catch{cleanupFailed=true}}
   try{for(const s of c.cleanup||[]){const result=await step(s,'cleanup');if(result.error)cleanupFailed=true}}catch{cleanupFailed=true}
   for(const sess of sessions.values())try{await sess.db.close()}catch{cleanupFailed=true}
  }
  if(cleanupFailed)incomplete=true;
  const asserted=events.some(e=>e.checks?.length>0);if(!asserted)incomplete=true;
  results.push({id:c.id,control_ids:c.control_ids,kind:c.kind||'custom',isolation:c.isolation,status:failed?'observed_fail':incomplete?'insufficient_evidence':'observed_pass',events,cleanup_complete:!cleanupFailed});
 }
 const fail=results.some(x=>x.status==='observed_fail'),unknown=results.some(x=>x.status==='insufficient_evidence');
 return {schema_version:'3.2',engine:manifest.engine,manifest_sha256:digest(manifest),cases:results,assessment:{status:fail?'fail':unknown?'insufficient_evidence':'observed_pass_limited',exit_code:fail?1:unknown?2:0,scope:'Barrier starts concurrent promises; database lock timing is nondeterministic. Assertions describe observed outcomes only.'}};
}
