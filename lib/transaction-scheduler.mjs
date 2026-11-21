import crypto from 'node:crypto';
import {catalog} from './controls.mjs';
const controls=new Set(catalog.map(x=>x.id));
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function ensure(x,msg){if(!x)throw Error(msg)}
const levels={postgres:['read_committed','repeatable_read','serializable'],mysql:['read_committed','repeatable_read','serializable']};
const sqlstate=e=>String(e?.code||e?.sqlState||e?.errno||'execution_error');
const readRows=(engine,r)=>engine==='postgres'?r.rows:r[0];
function validate(m){
 ensure(m?.schema_version==='3.1'&&levels[m.engine],'Invalid transaction manifest');
 ensure(/^[A-Z][A-Z0-9_]*$/.test(m.connection_env||''),'Connection environment variable required');
 ensure(m.test_database_acknowledged===true&&m.allow_mutation_on_test_database===true,'Explicit disposable database and mutation acknowledgement required');
 ensure(Array.isArray(m.cases)&&m.cases.length>0&&m.cases.length<=30,'1..30 cases required');
 const ids=new Set();for(const c of m.cases){
  ensure(/^[\w.-]{1,80}$/.test(c.id||'')&&!ids.has(c.id),'Invalid or duplicate case ID');ids.add(c.id);
  ensure(['lost_update','non_repeatable_read','phantom_read','serialization_failure','retry_recovery'].includes(c.kind),'Unsupported anomaly kind');
  ensure(levels[m.engine].includes(c.isolation),'Unsupported isolation level');
  ensure(Array.isArray(c.control_ids)&&c.control_ids.length>0&&c.control_ids.every(x=>controls.has(x)),'Unknown control ID');
  ensure(Array.isArray(c.steps)&&c.steps.length>0&&c.steps.length<=60,'1..60 steps required');
  ensure(c.expected&&['observed','prevented','retry_succeeded'].includes(c.expected.outcome),'Explicit outcome assertion required');
  ensure(typeof c.expected.assertion_step==='string','Explicit assertion step required');
  const stepIds=new Set();for(const s of c.steps){
   ensure(/^[\w.-]{1,80}$/.test(s.id||'')&&!stepIds.has(s.id),'Invalid or duplicate step ID');stepIds.add(s.id);
   ensure(['a','b','observer'].includes(s.session),'Invalid session');
   ensure(['begin','query','commit','rollback','reconnect'].includes(s.action),'Invalid action');
   if(s.action==='query'){
    ensure(typeof s.sql==='string'&&s.sql.length>0&&s.sql.length<=20000,'SQL required');
    ensure(/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(s.sql),'Only DML/query statements allowed');
    ensure(!/;\s*\S/.test(s.sql.trim())&&!/\b(CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|COPY|LOAD_FILE|OUTFILE|INFILE|FOR\s+SYSTEM_TIME)\b/i.test(s.sql),'DDL or unsafe SQL rejected');
    ensure(Array.isArray(s.params||[]),'SQL parameters must be an array');
   }
   if(s.expect_error!==undefined)ensure(typeof s.expect_error==='string'&&/^[\w-]{2,30}$/.test(s.expect_error),'Invalid expected error');
   if(s.assert!==undefined)ensure(typeof s.assert==='object'&&!Array.isArray(s.assert),'Invalid assertion');
  }
  ensure(stepIds.has(c.expected.assertion_step),'Assertion step does not exist');
 }
}
async function defaultConnect(engine,url){
 if(engine==='postgres'){
  const {Client}=await import('pg');const c=new Client({connectionString:url,connectionTimeoutMillis:5000});await c.connect();
  return {query:(q,p)=>c.query(q,p),close:()=>c.end()};
 }
 const {createConnection}=await import('mysql2/promise');const c=await createConnection(url);
 return {query:(q,p)=>c.query(q,p),close:()=>c.end()};
}
function assertions(s,rows,code){const checks=[];if(s.expect_error!==undefined)checks.push({type:'error_code',pass:s.expect_error===code,expected:s.expect_error,actual:code});
 if(s.assert){if(Object.hasOwn(s.assert,'row_count'))checks.push({type:'row_count',pass:rows?.length===s.assert.row_count,expected:s.assert.row_count,actual:rows?.length??null});
 if(Object.hasOwn(s.assert,'rows_sha256'))checks.push({type:'rows_sha256',pass:sha(rows)===s.assert.rows_sha256,expected:s.assert.rows_sha256,actual:sha(rows)});
 if(Object.hasOwn(s.assert,'first_row'))checks.push({type:'first_row',pass:JSON.stringify(rows?.[0]??null)===JSON.stringify(s.assert.first_row),expected_sha256:sha(s.assert.first_row),actual_sha256:sha(rows?.[0]??null)});
 }
 return checks;
}
export async function executeTransactionSchedule(manifest,{drivers={},env=process.env}={}){
 validate(manifest);ensure(env.BACKEND_GUARD_ALLOW_DB_TESTS==='yes','Database test opt-in required');ensure(env[manifest.connection_env],'Missing connection URL');
 const connect=drivers[manifest.engine]?.connect||((url)=>defaultConnect(manifest.engine,url));const reports=[];
 for(const c of manifest.cases){const sessions=new Map(),steps=[];let status='observed_pass',incomplete=false;
  const get=async id=>{if(!sessions.has(id))sessions.set(id,{db:await connect(env[manifest.connection_env]),inTransaction:false});return sessions.get(id)};
  try{for(const s of c.steps){let code=null,rows=null,affected=null,checks=[];
   try{if(s.action==='reconnect'){
      const old=sessions.get(s.session);if(old){await old.db.close();sessions.delete(s.session)}await get(s.session);
    }else{const session=await get(s.session);const db=session.db;
     if(s.action==='begin'){
      ensure(!session.inTransaction,'Nested transaction not supported');
      if(manifest.engine==='mysql')await db.query('SET TRANSACTION ISOLATION LEVEL '+c.isolation.replaceAll('_',' ').toUpperCase());
      await db.query('BEGIN');session.inTransaction=true;
      if(manifest.engine==='postgres')await db.query('SET TRANSACTION ISOLATION LEVEL '+c.isolation.replaceAll('_',' ').toUpperCase());
     }else if(s.action==='commit'||s.action==='rollback'){
      ensure(session.inTransaction,'Transaction not started');await db.query(s.action.toUpperCase());session.inTransaction=false;
     }else{
      const result=await db.query(s.sql,s.params||[]);if(/^\s*(SELECT|WITH)\b/i.test(s.sql))rows=readRows(manifest.engine,result);
      affected=manifest.engine==='postgres'?result.rowCount:result[0]?.affectedRows;
     }
    }}catch(e){code=sqlstate(e)}
   checks=assertions(s,rows,code);
   if(code&&!s.expect_error){incomplete=true;status='insufficient_evidence'}
   if(s.expect_error&&!code)checks.push({type:'expected_error_missing',pass:false});
   if(checks.some(x=>!x.pass)&&!(code&&!s.expect_error))status='observed_fail';
   steps.push({id:s.id,session:s.session,action:s.action,sql_sha256:s.sql?sha(s.sql):undefined,code,rows_sha256:rows===null?undefined:sha(rows),row_count:rows?.length,affected_rows:affected,checks});
   if(code&&!s.expect_error)break;
  }}catch(e){incomplete=true;status='insufficient_evidence';steps.push({id:'scheduler',code:sqlstate(e)})}
  finally{for(const x of sessions.values()){try{if(x.inTransaction)await x.db.query('ROLLBACK')}catch(e){void e}try{await x.db.close()}catch{incomplete=true}}}
  const assertion=steps.find(x=>x.id===c.expected.assertion_step);
  if(!assertion||!assertion.checks.length){incomplete=true;if(status!=='observed_fail')status='insufficient_evidence'}
  if(incomplete&&status==='observed_pass')status='insufficient_evidence';
  reports.push({id:c.id,kind:c.kind,isolation:c.isolation,control_ids:c.control_ids,status,expected_outcome:c.expected.outcome,steps});
 }
 const fail=reports.some(x=>x.status==='observed_fail'),unknown=reports.some(x=>x.status==='insufficient_evidence');
 return {schema_version:'3.1',engine:manifest.engine,manifest_sha256:sha(manifest),cases:reports,assessment:{status:fail?'fail':unknown?'insufficient_evidence':'observed_pass_limited',exit_code:fail?1:unknown?2:0,scope:'Deterministic step order; observed assertions only. No claim of exhaustive isolation verification.'}};
}
