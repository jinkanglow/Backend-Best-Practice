#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {signEvidence,verifyEvidence} from '../lib/async-lock-coordinator.mjs';
const [mode,source,target]=process.argv.slice(2);
try{
 if(!['sign','verify'].includes(mode)||!source||!target)throw Error('Usage: evidence-attest-v37.mjs sign EVIDENCE.json SIGNATURE.json | verify EVIDENCE.json SIGNATURE.json');
 const envelope=JSON.parse(readFileSync(source,'utf8'));
 const key=process.env.BGA_CI_ATTESTATION_KEY,runId=process.env.GITHUB_RUN_ID;
 if(mode==='sign'){
  if(!key||!runId)throw Error('CI key and GITHUB_RUN_ID required');
  writeFileSync(target,JSON.stringify(signEvidence(envelope,{key,runId}),null,2)+'\n');
 }else{
  const attestation=JSON.parse(readFileSync(target,'utf8'));
  if(!verifyEvidence(envelope,attestation,{key,expectedRunId:runId}))throw Error('Evidence signature invalid');
  process.stdout.write('Evidence signature valid\n');
 }
}catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=2;}
