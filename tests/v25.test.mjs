import test from 'node:test';
import assert from 'node:assert/strict';
import {detectDomainBoundary,runControlDetectors} from '../lib/control-detectors.mjs';
import {auditControlCoverage} from '../lib/benchmark.mjs';
import {catalog} from '../lib/controls.mjs';
import fs from 'node:fs';
const config={domain_boundary:{domain_roots:['src/domain'],forbidden_packages:['pg'],forbidden_paths:['src/infrastructure']}};
const report=(edges,unresolved=[])=>({dependency_graph:{edges,unresolved},parse_errors:[],project_config:{diagnostics:[]}});
test('BE-01-02 detects prohibited package and resolved internal module',()=>{
 const r=detectDomainBoundary(report([{from:'src/domain/order.ts',specifier:'pg',to:null,resolution:'external_or_unresolved_alias',kind:'import'},{from:'src/domain/order.ts',specifier:'../infrastructure/db',to:'src/infrastructure/db.ts',resolution:'resolved',kind:'import'}]),config);
 assert.equal(r.status,'fail');assert.equal(r.findings.length,2);assert.equal(r.findings[0].confidence,'confirmed');
});
test('BE-01-02 ignores imports outside domain and allowed imports',()=>{
 const r=detectDomainBoundary(report([{from:'src/api/server.ts',specifier:'pg',to:null,resolution:'external_or_unresolved_alias'},{from:'src/domain/order.ts',specifier:'./types',to:'src/domain/types.ts',resolution:'resolved'}]),config);
 assert.equal(r.status,'pass_within_declared_scope');assert.equal(r.findings.length,0);
});
test('BE-01-02 returns insufficient evidence on unresolved domain imports',()=>{
 const r=detectDomainBoundary(report([{from:'src/domain/order.ts',specifier:'./missing',to:null,resolution:'unresolved'}],[{from:'src/domain/order.ts'}]),config);
 assert.equal(r.status,'insufficient_evidence');
});
test('BE-01-02 requires explicit contract; invalid contracts rejected',()=>{
 assert.equal(detectDomainBoundary(report([]),{}).status,'not_configured');
 assert.throws(()=>detectDomainBoundary(report([]),{domain_boundary:{domain_roots:['../secret'],forbidden_packages:['pg']}}));
});
test('detector is registered, but coverage does not assert validation of control',()=>{
 const registry=JSON.parse(fs.readFileSync(new URL('../rules/detector-registry.json',import.meta.url)));
 const coverage=auditControlCoverage(catalog,registry.detectors);
 assert.equal(coverage.declared_implemented,8);assert.equal(coverage.controls.find(x=>x.id==='BE-01-02').coverage,'detector_declared_not_validated');
 assert.equal(runControlDetectors(report([]),config).results.length,6);
});
