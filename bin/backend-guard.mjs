#!/usr/bin/env node
import {auditScenarioReport,makeReplayPlan,compareReplayAudits} from '../lib/scenario-audit-v39.mjs';
import {executeAnomalyScenarios} from '../lib/anomaly-scenarios.mjs';
import {executeConflictRecovery} from '../lib/conflict-recovery.mjs';
import {executeParallelTransaction} from '../lib/parallel-transaction.mjs';
import {executeTransactionSchedule} from '../lib/transaction-scheduler.mjs';
import {executeSqlCorrectness} from '../lib/sql-correctness.mjs';
import {runBehavioral} from '../lib/behavioral-assurance.mjs';
import {executeBehavioralGate} from '../lib/behavioral-gate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {evaluateControls,catalog,detectAdapters} from '../lib/controls.mjs';
import {architectureMetrics} from '../lib/architecture-metrics.mjs';
import {runBenchmark,auditControlCoverage} from '../lib/benchmark.mjs';
import {runControlDetectors} from '../lib/control-detectors.mjs';
import {compareArchitecture} from '../lib/architecture-baseline.mjs';
import {runHarness,harnessEvidence} from '../lib/runtime.mjs';
import {verify,evaluateVerified,frameworkFindings} from '../lib/verified.mjs';
import {executeAssurance,decideAssurance,signEvidence,verifyEvidenceSignature} from '../lib/assurance.mjs';
import {attest,verifyAttestation,readTrustedRunners,legacyManifestHash} from '../lib/attestation.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {analyze,filesUnder,RULES,loadTS} from '../lib/analyzer.mjs';
function scan(root,config){return analyze(root,config)}
function sarif(report){return {version:'2.4.0',$schema:'https://json.schemastore.org/sarif-2.1.0.json',runs:[{tool:{driver:{name:'backend-guard',version:'2.4.0',rules:RULES.map(r=>({id:r.id,shortDescription:{text:r.title}}))}},results:report.findings.map(f=>({ruleId:f.rule_id,level:'warning',message:{text:f.message},locations:[{physicalLocation:{artifactLocation:{uri:f.uri},region:{startLine:f.line}}}],properties:{confidence:f.confidence,status:f.status}}))}]};}
function usage(){console.log('backend-guard 3.9.0\nCommands: scenario-audit --manifest FILE --report FILE [--output FILE] | scenario-replay --manifest FILE --baseline FILE [--output FILE] | anomaly-scenarios --manifest FILE [--output FILE] | conflict-recovery --manifest FILE [--output FILE] | parallel-transaction --manifest FILE [--output FILE] | transaction-schedule --manifest FILE [--output FILE] | sql-correctness --manifest FILE [--output FILE] | behavioral-gate --manifest FILE [--profile FILE] [--output FILE] | behavioral-test --manifest FILE [--output FILE] | detect-controls --contract FILE [--report FILE] [--root PATH] | inventory | check [--root PATH] [--format json|sarif|text] [--output FILE] | gate --report FILE [--policy FILE] | controls | assess --report FILE [--evidence FILE] [--profile FILE] | harness --manifest FILE [--output FILE] | adapters | framework-check | assure-v2 --manifest FILE [--profile FILE] [--sign-key-env ENV] | verify-signature --input FILE --key-env ENV | verify-gate --manifest FILE [--profile FILE] [--output FILE] | explain RULE_ID | benchmark --corpus FILE | coverage [--registry FILE] | architecture-baseline --report FILE --baseline FILE [--max-new-cycles N] [--allow-partial] | doctor');}
function opt(args,name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1];}
function gate(report,policy){
 const blocking=new Set(policy.block_severities||['critical','high']);
 const confirmed=report.findings.filter(f=>(f.status==='fail'||f.status==='warning')&&f.confidence==='confirmed'&&blocking.has(f.severity));
 const candidates=report.findings.filter(f=>f.confidence==='candidate');
 const unknown=report.rules.filter(r=>r.status==='unknown'||r.status==='unsupported');
 const parseErrors=(report.parse_errors?.length||0)+(report.project_config?.diagnostics?.length||0);
 const unresolvedImports=(report.dependency_graph?.unresolved?.length||0);
 const strict=policy.require_evidence===true;
 return {status:confirmed.length?'fail':strict&&(unknown.length||parseErrors||unresolvedImports)?'insufficient_evidence':'pass_with_unverified_controls',confirmed_blockers:confirmed.length,candidates:candidates.length,unknown_controls:unknown.length,parse_errors:parseErrors,unresolved_imports:unresolvedImports,exit_code:confirmed.length?1:strict&&(unknown.length||parseErrors||unresolvedImports)?2:0};
}
export async function main(argv=process.argv.slice(2)){
 const [cmd,...args]=argv; const root=path.resolve(opt(args,'--root','.'));
 try{
  if(cmd==='attest-v21'){
   const input=opt(args,'--input',null),keyEnv=opt(args,'--key-env',null),runnerId=opt(args,'--runner-id',null),runId=opt(args,'--run-id',null),imageDigest=opt(args,'--image-digest',null);
   if(!input||!keyEnv||!runnerId||!runId||!imageDigest)throw Error('Missing --input, --key-env, --runner-id, --run-id or --image-digest');
   const doc=JSON.parse(fs.readFileSync(input,'utf8')),execution=doc.execution?.payload||doc.execution||doc;
   const envelope=attest(execution,{privateKey:process.env[keyEnv],runnerId,runId,manifestHash:execution.manifest_sha256,environment:{image_digest:imageDigest}});
   const output=opt(args,'--output',null);if(output)fs.writeFileSync(output,JSON.stringify(envelope,null,2)+'\n');else console.log(JSON.stringify(envelope,null,2));return 0;
  }
  if(cmd==='verify-attestation-v21'){
   const input=opt(args,'--input',null),trust=opt(args,'--trust-store',null),manifest=opt(args,'--manifest',null),imageDigest=opt(args,'--image-digest',null);
   if(!input||!trust||!manifest||!imageDigest)throw Error('Missing --input, --trust-store, --manifest or --image-digest');
   const envelope=JSON.parse(fs.readFileSync(input,'utf8')),m=JSON.parse(fs.readFileSync(manifest,'utf8'));
   const result=verifyAttestation(envelope,{trustedRunners:readTrustedRunners(trust),expectedManifestHash:legacyManifestHash(m),expectedImageDigest:imageDigest});
   console.log(JSON.stringify(result,null,2));return result.valid?0:2;
  }
  if(cmd==='assure-v2'){
   const file=opt(args,'--manifest',null);if(!file)throw Error('--manifest required');
   const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
   const profileFile=opt(args,'--profile',null),profile=profileFile?JSON.parse(fs.readFileSync(profileFile,'utf8')):{};
   const execution=await executeAssurance(root,manifest);
   const assessment=decideAssurance(execution,{profile});
   const keyEnv=opt(args,'--sign-key-env',null);
   const envelope=keyEnv?signEvidence(execution,process.env[keyEnv]):null;
   const body=JSON.stringify({execution:envelope||execution,assessment},null,2);
   const out=opt(args,'--output',null);if(out)fs.writeFileSync(out,body+'\n');else console.log(body);
   return assessment.exit_code;
  }
  if(cmd==='verify-signature'){
   const file=opt(args,'--input',null),keyEnv=opt(args,'--key-env',null);
   if(!file||!keyEnv)throw Error('--input and --key-env required');
   const doc=JSON.parse(fs.readFileSync(file,'utf8'));
   const valid=verifyEvidenceSignature(doc.execution||doc,process.env[keyEnv]);
   console.log(JSON.stringify({signature_valid:valid,trust:'Valid only if verifier controls key and trusts signing runner'}));return valid?0:2;
  }
  if(cmd==='framework-check'){console.log(JSON.stringify(frameworkFindings(root),null,2));return 0;}
  if(cmd==='verify-gate'){
   const manifestFile=opt(args,'--manifest',null);if(!manifestFile)throw Error('--manifest required');
   const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
   const reportFile=opt(args,'--report',null),profileFile=opt(args,'--profile',null);
   const report=reportFile?JSON.parse(fs.readFileSync(reportFile,'utf8')):analyze(root,{});
   const profile=profileFile?JSON.parse(fs.readFileSync(profileFile,'utf8')):{};
   const execution=await verify(root,manifest);const assessment=evaluateVerified({root,report,execution,profile});
   const out=opt(args,'--output',null);const body=JSON.stringify({execution,assessment},null,2);
   if(out)fs.writeFileSync(out,body+'\n');else console.log(body);return assessment.exit_code;
  }
  if(cmd==='scenario-audit'){
   const mf=opt(args,'--manifest',null),rf=opt(args,'--report',null);
   if(!mf||!rf)throw Error('--manifest and --report required');
   const result=auditScenarioReport(JSON.parse(fs.readFileSync(rf,'utf8')),JSON.parse(fs.readFileSync(mf,'utf8')));
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';
   if(out)fs.writeFileSync(out,body);else console.log(body);return result.exit_code;
  }
  if(cmd==='scenario-replay'){
   const mf=opt(args,'--manifest',null),bf=opt(args,'--baseline',null);
   if(!mf||!bf)throw Error('--manifest and --baseline required');
   const manifest=JSON.parse(fs.readFileSync(mf,'utf8'));
   const baseline=auditScenarioReport(JSON.parse(fs.readFileSync(bf,'utf8')),manifest);
   const fresh=await executeAnomalyScenarios(manifest);
   const current=auditScenarioReport(fresh,manifest);
   const comparison=compareReplayAudits(baseline,current);
   const result={replay_plan:makeReplayPlan(manifest),comparison,current_report:fresh,current_audit:current};
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';
   if(out)fs.writeFileSync(out,body);else console.log(body);
   return current.exit_code!==0?current.exit_code:comparison.differences.length?1:0;
  }
  if(cmd==='anomaly-scenarios'){
   const file=opt(args,'--manifest',null);if(!file)throw Error('--manifest required');
   const result=await executeAnomalyScenarios(JSON.parse(fs.readFileSync(file,'utf8')));
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';
   if(out)fs.writeFileSync(out,body);else console.log(body);return result.assessment.exit_code;
  }
  if(cmd==='conflict-recovery'){
   const file=opt(args,'--manifest',null);if(!file)throw Error('--manifest required');
   const result=await executeConflictRecovery(JSON.parse(fs.readFileSync(file,'utf8')));
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';
   if(out)fs.writeFileSync(out,body);else console.log(body);return result.assessment.exit_code;
  }
  if(cmd==='parallel-transaction'){
   const file=opt(args,'--manifest',null);if(!file)throw Error('--manifest required');
   const result=await executeParallelTransaction(JSON.parse(fs.readFileSync(file,'utf8')));
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';
   if(out)fs.writeFileSync(out,body);else console.log(body);return result.assessment.exit_code;
  }
  if(cmd==='transaction-schedule'){
   const file=opt(args,'--manifest',null);if(!file)throw Error('--manifest required');
   const result=await executeTransactionSchedule(JSON.parse(fs.readFileSync(file,'utf8')));
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';
   if(out)fs.writeFileSync(out,body);else console.log(body);return result.assessment.exit_code;
  }
  if(cmd==='sql-correctness'){
   const file=opt(args,'--manifest',null);if(!file)throw Error('--manifest required');
   const result=await executeSqlCorrectness(JSON.parse(fs.readFileSync(file,'utf8')));
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';
   if(out)fs.writeFileSync(out,body);else console.log(body);return result.assessment.exit_code;
  }
  if(cmd==='behavioral-gate'){
   const file=opt(args,'--manifest',null);if(!file)throw Error('--manifest required');
   const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
   const profileFile=opt(args,'--profile',null);
   const profile=profileFile?JSON.parse(fs.readFileSync(profileFile,'utf8')):{};
   const result=await executeBehavioralGate(manifest,{required_controls:profile.required_behavioral_controls||[],strict:profile.strict!==false});
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';
   if(out)fs.writeFileSync(out,body);else console.log(body);
   return result.assessment.exit_code;
  }
  if(cmd==='behavioral-test'){
   const manifestFile=opt(args,'--manifest',null);if(!manifestFile)throw Error('--manifest required');
   const result=await runBehavioral(JSON.parse(fs.readFileSync(manifestFile,'utf8')));
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';
   if(out)fs.writeFileSync(out,body);else console.log(body);
   return result.summary.observed_fail?1:0;
  }
  if(cmd==='detect-controls'){
   const contractFile=opt(args,'--contract',null);if(!contractFile)throw Error('--contract required');
   const reportFile=opt(args,'--report',null);
   const report=reportFile?JSON.parse(fs.readFileSync(reportFile,'utf8')):analyze(root,{});
   const result=runControlDetectors(report,JSON.parse(fs.readFileSync(contractFile,'utf8')),root);
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';if(out)fs.writeFileSync(out,body);else console.log(body);
   return result.results.some(r=>r.status==='fail')?1:result.results.some(r=>r.status==='insufficient_evidence'||r.status==='not_configured')?2:0;
  }
  if(cmd==='benchmark'){
   const file=opt(args,'--corpus',null);if(!file)throw Error('--corpus required');
   const result=runBenchmark(JSON.parse(fs.readFileSync(file,'utf8')));
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';if(out)fs.writeFileSync(out,body);else console.log(body);
   return result.summary.matched===result.summary.total?0:1;
  }
  if(cmd==='coverage'){
   const file=opt(args,'--registry',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../rules/detector-registry.json'));
   const result=auditControlCoverage(catalog,JSON.parse(fs.readFileSync(file,'utf8')).detectors);
   const out=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';if(out)fs.writeFileSync(out,body);else console.log(body);
   return result.rejected.length?2:0;
  }
  if(cmd==='architecture-baseline'){
   const currentFile=opt(args,'--report',null),baselineFile=opt(args,'--baseline',null);
   if(!currentFile||!baselineFile)throw Error('--report and --baseline required');
   const maxNew=Number(opt(args,'--max-new-cycles','0'));
   const result=compareArchitecture(JSON.parse(fs.readFileSync(currentFile,'utf8')),JSON.parse(fs.readFileSync(baselineFile,'utf8')),{max_new_cycles:maxNew,require_complete:!args.includes('--allow-partial')});
   const output=opt(args,'--output',null),body=JSON.stringify(result,null,2)+'\n';if(output)fs.writeFileSync(output,body);else console.log(body);return result.exit_code;
  }
  if(cmd==='architecture-metrics'){
   const file=opt(args,'--report',null);if(!file)throw Error('--report required');
   const result=architectureMetrics(JSON.parse(fs.readFileSync(file,'utf8')));
   const out=opt(args,'--output',null);if(out)fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');else console.log(JSON.stringify(result,null,2));return result.status==='unknown'?2:0;
  }
  if(cmd==='controls'){console.log(JSON.stringify({schema_version:'1.8',count:catalog.length,controls:catalog},null,2));return 0;}
  if(cmd==='adapters'){console.log(JSON.stringify(detectAdapters(root),null,2));return 0;}
  if(cmd==='harness'){
   const file=opt(args,'--manifest',null);if(!file)throw Error('--manifest required');
   const result=runHarness(root,JSON.parse(fs.readFileSync(file,'utf8')));
   const out=opt(args,'--output',null);const body=JSON.stringify({...result,evidence:harnessEvidence(result)},null,2);
   if(out)fs.writeFileSync(out,body+'\n');else console.log(body);
   return result.summary.fail?1:0;
  }
  if(cmd==='assess'){
   const reportFile=opt(args,'--report',null);if(!reportFile)throw Error('--report required');
   const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
   const evidenceFile=opt(args,'--evidence',null),profileFile=opt(args,'--profile',null);
   const evidence=evidenceFile?JSON.parse(fs.readFileSync(evidenceFile,'utf8')):[];
   const profile=profileFile?JSON.parse(fs.readFileSync(profileFile,'utf8')):{};
   if(!Array.isArray(evidence))throw Error('Evidence must be an array');
   const result=evaluateControls({root,report,evidence,profile});
   const out=opt(args,'--output',null);if(out)fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');else console.log(JSON.stringify(result,null,2));
   return result.exit_code;
  }
  if(cmd==='inventory'){
   const paths=filesUnder(root);console.log(JSON.stringify({root,files:paths.length,typescript:paths.filter(f=>/\.tsx?$/.test(f)).length,sql:paths.filter(f=>f.endsWith('.sql')).length,framework:'not_determined',database:'not_determined'},null,2));return 0;
  }
  if(cmd==='check'){
   const configPath=opt(args,'--config',null);const config=configPath?JSON.parse(fs.readFileSync(configPath,'utf8')):{};const report=scan(root,config),format=opt(args,'--format','text');
   if(!['text','json','sarif'].includes(format)) throw Error('Unsupported format');
   const content=format==='sarif'?JSON.stringify(sarif(report),null,2):format==='json'?JSON.stringify(report,null,2):report.findings.map(f=>`${f.uri}:${f.line} ${f.rule_id} ${f.message}`).join('\n')+`\n${report.findings.length} candidates; ${report.rules.length} controls unverified\n`;
   const out=opt(args,'--output',null);if(out)fs.writeFileSync(path.resolve(out),content+'\n');else console.log(content);return 0;
  }
  if(cmd==='gate'){
   const filename=opt(args,'--report',null);if(!filename)throw Error('--report required');
   const report=JSON.parse(fs.readFileSync(filename,'utf8'));
   const policyfile=opt(args,'--policy',null);
   const policy=policyfile?JSON.parse(fs.readFileSync(policyfile,'utf8')):{};
   const result=gate(report,policy);console.log(JSON.stringify(result,null,2));return result.exit_code;
  }
  if(cmd==='explain'){const rule=RULES.find(r=>r.id===args[0]);if(!rule)throw Error('Unknown rule');console.log(JSON.stringify({...rule,assurance:'candidate-only; not proof of safety or vulnerability'},null,2));return 0;}
  if(cmd==='doctor'){console.log(JSON.stringify({node:process.version,root_exists:fs.existsSync(root),parser:loadTS()?'typescript compiler API':'unavailable',runtime_harness:'trusted-command subprocess runner; no isolation',sarif:'2.1.0 emitted'},null,2));return 0;}
  usage();return cmd?2:0;
 }catch(e){console.error('backend-guard:',e.message);return 3;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().then(code=>{process.exitCode=code}).catch(e=>{console.error(e);process.exitCode=3});
