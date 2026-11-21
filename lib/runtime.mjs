import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
export function runHarness(root,manifest){
 if(!manifest||!Array.isArray(manifest.tests)||manifest.tests.length>100)throw Error('Invalid harness manifest');
 const tests=[];
 for(const t of manifest.tests){
  if(!t||typeof t.id!=='string'||!Array.isArray(t.argv)||!t.argv.length||t.argv.some(v=>typeof v!=='string')||t.argv[0].length===0)throw Error('Invalid test command');
  if(t.argv.some(v=>v.length>2048))throw Error('Oversized argument');
  const timeout=Math.max(100,Math.min(120000,Number(t.timeout_ms)||10000));
  const cwd=path.resolve(root,t.cwd||'.');if(!fs.realpathSync(cwd).startsWith(fs.realpathSync(root)+path.sep)&&fs.realpathSync(cwd)!==fs.realpathSync(root))throw Error('Test cwd outside root');
  const started=new Date().toISOString();
  const result=spawnSync(t.argv[0],t.argv.slice(1),{cwd,timeout,encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,CI:'true'}});
  const output=(result.stdout||'')+'\n'+(result.stderr||'');
  const ok=result.status===0&&!result.error;
  tests.push({id:t.id,status:ok?'pass':'fail',exit_code:result.status,execution_error:result.error?.code??null,observed_at:started,artifact_sha256:sha(output),artifact:`harness:${t.id}`,observation:`process exit ${result.status??'none'}; output_sha256=${sha(output)}`,method:'automated_test',control_ids:Array.isArray(t.control_ids)?t.control_ids:[],timeout_ms:timeout});
 }
 return {schema_version:'1.8',tests,summary:{pass:tests.filter(x=>x.status==='pass').length,fail:tests.filter(x=>x.status==='fail').length},note:'Commands execute locally with current user privileges; run only trusted manifests. Output is hashed, not stored.'};
}
export function harnessEvidence(result){return result.tests.flatMap(t=>t.control_ids.map(control_id=>({control_id,result:t.status,method:t.method,observed_at:t.observed_at,artifact:t.artifact,artifact_sha256:t.artifact_sha256,observation:t.observation})));}
