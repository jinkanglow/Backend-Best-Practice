#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {attestReport,verifyAttestation,verifyScenarioReport} from '../lib/event-provenance-v38.mjs';
try{
 const [mode,reportFile,attestationFile]=process.argv.slice(2);
 if(!['sign','verify'].includes(mode)||!reportFile||!attestationFile)throw Error('Usage: evidence-gate-v38.mjs sign|verify REPORT.json ATTESTATION.json');
 const report=JSON.parse(readFileSync(reportFile,'utf8'));
 const key=process.env.BGA_CI_ATTESTATION_KEY,runId=process.env.GITHUB_RUN_ID;
 if(!key||!runId)throw Error('Protected CI key and run ID required');
 if(!verifyScenarioReport(report))throw Error('Invalid per-event evidence chain');
 if(mode==='sign')writeFileSync(attestationFile,JSON.stringify(attestReport(report,{key,runId}),null,2)+'\n');
 else {
  const attestation=JSON.parse(readFileSync(attestationFile,'utf8'));
  if(!verifyAttestation(report,attestation,{key,runId}))throw Error('Evidence verification failed');
  if(report.assessment?.exit_code!==0||report.assessment?.status!=='observed_pass_limited_scope'||report.cases.some(c=>c.status!=='observed_pass_limited'||!c.cleanup_complete))throw Error('Signed evidence does not satisfy gate');
  process.stdout.write('Evidence chain, signature and gate verified\n');
 }
}catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=2;}
