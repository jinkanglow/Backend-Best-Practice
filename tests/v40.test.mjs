import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chainEvents} from '../lib/event-provenance-v38.mjs';
import {createEvidenceBaseline,compareEvidenceBaseline} from '../lib/evidence-regression-v40.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('../examples/anomaly-postgres-v39.json',import.meta.url)));
const environment={engine:'postgres',server_version:'16.4',image_digest:'sha256:'+'a'.repeat(64),source:'live_database_probe',image_digest_kind:'container_image_config'};
function fixture(){return {schema_version:'3.8',engine:manifest.engine,manifest_sha256:hash(manifest),cases:manifest.cases.map(c=>({id:c.id,kind:c.kind,control_ids:c.control_ids,status:'observed_pass_limited',cleanup_complete:true,events:chainEvents([{phase:'begin',session:'a'},{phase:'independent_final_state',pass:true,actual:[{value:1}],expected:[{value:1}]}],{caseId:c.id,engine:manifest.engine})})),assessment:{status:'observed_pass_limited_scope',exit_code:0}};}
test('v4.0 creates five-case baseline with pinned database identity',()=>{const b=createEvidenceBaseline({manifest,report:fixture(),environment});assert.equal(b.cases.length,5);assert.equal(b.environment.server_version,'16.4');assert.match(b.baseline_sha256,/^[a-f0-9]{64}$/);});
test('v4.0 accepts repeated observed outcomes',()=>{const b=createEvidenceBaseline({manifest,report:fixture(),environment});const result=compareEvidenceBaseline(b,{manifest,report:fixture(),environment});assert.equal(result.exit_code,0);});
test('v4.0 rejects server-version drift',()=>{const b=createEvidenceBaseline({manifest,report:fixture(),environment});const result=compareEvidenceBaseline(b,{manifest,report:fixture(),environment:{...environment,server_version:'17.0'}});assert.equal(result.exit_code,1);assert(result.differences.some(x=>x.code==='DATABASE_ENVIRONMENT_CHANGED'));});
test('v4.0 rejects image identity drift',()=>{const b=createEvidenceBaseline({manifest,report:fixture(),environment});const result=compareEvidenceBaseline(b,{manifest,report:fixture(),environment:{...environment,image_digest:'sha256:'+'b'.repeat(64)}});assert.equal(result.exit_code,1);});
test('v4.0 refuses a failing database case as baseline',()=>{const r=fixture();r.cases[0].events=chainEvents([{phase:'independent_final_state',pass:false,actual:1,expected:2}],{caseId:r.cases[0].id,engine:r.engine});assert.throws(()=>createEvidenceBaseline({manifest,report:r,environment}));});
test('v4.0 refuses missing or untrusted environment metadata',()=>{assert.throws(()=>createEvidenceBaseline({manifest,report:fixture(),environment:{...environment,source:'config'}}));assert.throws(()=>createEvidenceBaseline({manifest,report:fixture(),environment:{...environment,image_digest:'postgres:16'}}));});
test('v4.0 rejects event tampering before regression comparison',()=>{const b=createEvidenceBaseline({manifest,report:fixture(),environment});const r=fixture();r.cases[0].events[0].phase='tampered';assert.throws(()=>compareEvidenceBaseline(b,{manifest,report:r,environment}));});
