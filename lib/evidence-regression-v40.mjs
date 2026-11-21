import {createHash} from 'node:crypto';
import {auditScenarioReport} from './scenario-audit-v39.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const required=['lost_update','non_repeatable_read','phantom_read','serialization_failure','retry_recovery'];
const supported=new Set(['postgres','mysql']);
export function createEvidenceBaseline({manifest,report,environment}){
 if(!supported.has(manifest?.engine)||!environment||typeof environment.server_version!=='string'||!environment.server_version.trim()||typeof environment.image_digest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(environment.image_digest))throw Error('Actual DB server version and immutable image digest required');
 const audit=auditScenarioReport(report,manifest);
 if(audit.exit_code!==0||audit.cases.length!==5||!required.every(k=>audit.cases.some(c=>c.kind===k)))throw Error('Only fully audited five-case runs may establish a baseline');
 if(environment.engine!==manifest.engine||environment.source!=='live_database_probe')throw Error('Live database environment probe required');
 const cases=audit.cases.map(c=>({id:c.id,kind:c.kind,control_ids:c.control_ids,case_status:c.case_status,final_state_observed:c.final_state_observed,lock_wait_observed:c.lock_wait_observed,finding_codes:c.findings.map(f=>f.code).sort()}));
 return {schema_version:'4.0',engine:manifest.engine,manifest_sha256:audit.manifest_sha256,environment:{engine:environment.engine,server_version:environment.server_version,image_digest:environment.image_digest,source:environment.source},cases,report_sha256:audit.report_sha256,baseline_sha256:hash({engine:manifest.engine,manifest_sha256:audit.manifest_sha256,environment,cases}),scope:'Five-case observed outcomes only. A passing baseline is not proof of deterministic lock scheduling.'};
}
export function compareEvidenceBaseline(baseline,{manifest,report,environment}){
 if(baseline?.schema_version!=='4.0'||!supported.has(baseline.engine)||!Array.isArray(baseline.cases)||baseline.cases.length!==5)throw Error('Invalid v4.0 baseline');
 const candidate=createEvidenceBaseline({manifest,report,environment});
 const differences=[];
 for(const field of ['engine','manifest_sha256'])if(candidate[field]!==baseline[field])differences.push({code:'BASELINE_IDENTITY_CHANGED',field});
 for(const field of ['server_version','image_digest','source'])if(candidate.environment[field]!==baseline.environment?.[field])differences.push({code:'DATABASE_ENVIRONMENT_CHANGED',field,baseline:baseline.environment?.[field],candidate:candidate.environment[field]});
 for(const expected of baseline.cases){const actual=candidate.cases.find(c=>c.id===expected.id&&c.kind===expected.kind);if(!actual){differences.push({code:'SCENARIO_MISSING',case_id:expected.id});continue;}
  for(const field of ['control_ids','case_status','final_state_observed','lock_wait_observed','finding_codes'])if(JSON.stringify(actual[field])!==JSON.stringify(expected[field]))differences.push({code:'SCENARIO_REGRESSION',case_id:expected.id,field,baseline:expected[field],candidate:actual[field]});
 }
 return {schema_version:'4.0',status:differences.length?'regression_or_environment_drift':'matching_observed_outcomes',exit_code:differences.length?1:0,differences,baseline_sha256:baseline.baseline_sha256,candidate_report_sha256:candidate.report_sha256,warning:'Matching outcomes are not evidence of deterministic interleaving or production transaction safety.'};
}
