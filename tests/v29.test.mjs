import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {executeBehavioralGate} from '../lib/behavioral-gate.mjs';

async function server(fn){const s=http.createServer(fn);await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));return {s,url:`http://127.0.0.1:${s.address().port}`};}
const manifest=(url,kind='authorization_negative')=>({schema_version:'2.8',tests:[{id:'case1',kind,owner:{url,token_env:'BGA_TEST_OWNER'},outsider:{url,token_env:'BGA_TEST_OUTSIDER'}}]});
test('authorization negative observation is bound to control and manifest',async()=>{process.env.BGA_TEST_OWNER='owner';process.env.BGA_TEST_OUTSIDER='other';const {s,url}=await server((req,res)=>{res.statusCode=req.headers.authorization==='Bearer owner'?200:403;res.end('{}');});try{const result=await executeBehavioralGate(manifest(url),{required_controls:['BE-03-02']});assert.equal(result.assessment.exit_code,0);assert.equal(result.assessment.controls[0].tests[0].test_id,'case1');assert.match(result.manifest_sha256,/^[a-f0-9]{64}$/);}finally{s.close();}});
test('missing required control fails closed',async()=>{process.env.BGA_TEST_OWNER='owner';process.env.BGA_TEST_OUTSIDER='other';const {s,url}=await server((req,res)=>{res.statusCode=req.headers.authorization==='Bearer owner'?200:403;res.end('{}');});try{const result=await executeBehavioralGate(manifest(url),{required_controls:['BE-03-02','BE-06-02']});assert.equal(result.assessment.exit_code,2);assert.equal(result.assessment.summary.insufficient_evidence,1);}finally{s.close();}});
test('authorization bypass produces a failing gate',async()=>{process.env.BGA_TEST_OWNER='owner';process.env.BGA_TEST_OUTSIDER='other';const {s,url}=await server((req,res)=>{res.statusCode=200;res.end('{}');});try{const result=await executeBehavioralGate(manifest(url));assert.equal(result.assessment.exit_code,1);}finally{s.close();}});
test('malformed profile is rejected',async()=>{await assert.rejects(()=>executeBehavioralGate({schema_version:'2.8',tests:[]},{required_controls:'bad'}),/required_controls/);});
