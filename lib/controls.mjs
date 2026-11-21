import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export const catalog=JSON.parse(fs.readFileSync(path.join(here,'../rules/control-catalog.json'),'utf8')).controls;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function detectAdapters(root){
 const files=['package.json','pyproject.toml','requirements.txt','go.mod','pom.xml','build.gradle','Cargo.toml'];
 const seen=[];for(const file of files){const p=path.join(root,file);if(fs.existsSync(p)&&fs.statSync(p).isFile())seen.push({file,sha256:hash(fs.readFileSync(p))});}
 let deps={};const pkg=path.join(root,'package.json');if(fs.existsSync(pkg)){try{const p=JSON.parse(fs.readFileSync(pkg,'utf8'));deps={...p.dependencies,...p.devDependencies};}catch{}}
 const matches=[['express','express'],['fastify','fastify'],['@nestjs/core','nestjs'],['koa','koa'],['hono','hono'],['prisma','@prisma/client'],['typeorm','typeorm'],['drizzle','drizzle-orm']].filter(([,name])=>Object.hasOwn(deps,name)).map(([id,dependency])=>({id,dependency,evidence_file:'package.json',confidence:'declared_dependency_only'}));
 return {ecosystems:seen.map(x=>x.file),frameworks:matches,manifest_evidence:seen,scope:'manifest declarations; not runtime framework confirmation'};
}
export function validateEvidence(item){
 if(!isObject(item)||typeof item.control_id!=='string'||typeof item.result!=='string')return 'invalid_shape';
 if(!['pass','fail','not_applicable'].includes(item.result))return 'invalid_result';
 if(!['automated_test','manual_review'].includes(item.method))return 'invalid_method';
 if(typeof item.observed_at!=='string'||Number.isNaN(Date.parse(item.observed_at)))return 'invalid_timestamp';
 if(typeof item.artifact_sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.artifact_sha256))return 'invalid_digest';
 if(typeof item.artifact!=='string'||!item.artifact.trim())return 'missing_artifact';
 if(typeof item.observation!=='string'||!item.observation.trim())return 'missing_observation';
 if(item.result==='not_applicable'&&(!item.justification||typeof item.justification!=='string'))return 'missing_justification';
 return null;
}
export function evaluateControls({root,report,evidence=[],profile={}}){
 const adapters=detectAdapters(root);const byId=new Map();const rejected=[];
 for(const e of evidence){const error=validateEvidence(e);if(error){rejected.push({control_id:e?.control_id??null,reason:error});continue;}if(!catalog.some(c=>c.id===e.control_id)){rejected.push({control_id:e.control_id,reason:'unknown_control'});continue;}if(byId.has(e.control_id)){rejected.push({control_id:e.control_id,reason:'duplicate_control_evidence'});byId.delete(e.control_id);continue;}byId.set(e.control_id,e);}
 const controls=catalog.map(c=>{
  const e=byId.get(c.id);if(!e)return {id:c.id,category:c.category,severity:c.severity,status:'unknown',verification:'not_executed',reason:'no_control_specific_evidence'};
  return {id:c.id,category:c.category,severity:c.severity,status:e.result,verification:e.method,evidence:{artifact:e.artifact,sha256:e.artifact_sha256,observed_at:e.observed_at,observation:e.observation,justification:e.justification??null},reason:'attested_evidence_not_independently_proven'};
 });
 const counts=Object.fromEntries(['pass','fail','unknown','not_applicable'].map(s=>[s,controls.filter(c=>c.status===s).length]));
 const strict=profile.require_evidence===true;
 const blocking=new Set(profile.block_severities??['critical','high']);
 const failed=controls.filter(c=>c.status==='fail'&&blocking.has(c.severity));
 const unknown=controls.filter(c=>c.status==='unknown');
 const findingBlockers=(report?.findings??[]).filter(f=>f.confidence==='confirmed'&&blocking.has(f.severity)&&['warning','fail'].includes(f.status));
 const evidenceGaps=(report?.dependency_graph?.unresolved?.length??0)+(report?.parse_errors?.length??0)+(report?.project_config?.diagnostics?.length??0);
 const status=failed.length||findingBlockers.length?'fail':strict&&(unknown.length||rejected.length||evidenceGaps)?'insufficient_evidence':'pass_with_unverified_controls';
 return {schema_version:'1.8',status,exit_code:status==='fail'?1:status==='insufficient_evidence'?2:0,summary:{...counts,total:catalog.length,control_blockers:failed.length,confirmed_finding_blockers:findingBlockers.length,rejected_evidence:rejected.length,analysis_gaps:evidenceGaps},adapters,controls,rejected_evidence:rejected,assurance:'evidence is attested; no external provenance or runtime correctness guarantee'};
}
