#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {auditScenarioReport} from '../lib/scenario-audit-v39.mjs';
import {attestReport,verifyAttestation} from '../lib/event-provenance-v38.mjs';
try{
 const [mode,manifestFile,reportFile,attestationFile]=process.argv.slice(2);
 if(!['sign','verify'].includes(mode)||!manifestFile||!reportFile||!attestationFile)throw Error('Usage: evidence-gate-v39.mjs sign|verify MANIFEST REPORT ATTESTATION');
 const manifest=JSON.parse(readFileSync(manifestFile,'utf8')),report=JSON.parse(readFileSync(reportFile,'utf8'));
 const audit=auditScenarioReport(report,manifest);
 if(audit.exit_code!==0||report.assessment?.exit_code!==0||report.cases.some(c=>c.status!=='observed_pass_limited'||!c.cleanup_complete))throw Error('Audit gate rejected database evidence');
 const key=process.env.BGA_CI_ATTESTATION_KEY,runId=process.env.GITHUB_RUN_ID;
 if(!key||!runId)throw Error('Protected CI key and run ID required');
 if(mode==='sign')writeFileSync(attestationFile,JSON.stringify({attestation:attestReport(report,{key,runId}),audit},null,2)+'\n');
 else {
  const envelope=JSON.parse(readFileSync(attestationFile,'utf8'));
  if(!verifyAttestation(report,envelope.attestation,{key,runId})||JSON.stringify(envelope.audit)!==JSON.stringify(audit))throw Error('Attestation or audit mismatch');
  process.stdout.write('Five-case audit and CI attestation verified\n');
 }
}catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=2;}
