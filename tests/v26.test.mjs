import test from 'node:test';
import assert from 'node:assert/strict';
import {detectMigrationReview,detectDomainBoundary,runControlDetectors} from '../lib/control-detectors.mjs';
const base={dependency_graph:{edges:[],unresolved:[]},parse_errors:[],project_config:{diagnostics:[]},findings:[]};
test('destructive migration candidate cannot be promoted to verified failure',()=>{
 const r=detectMigrationReview({...base,findings:[{rule_id:'DATA-002',uri:'migrations/1.sql',line:1,evidence:{sha256:'abc'}}]},{migration_review:{enabled:true}});
 assert.equal(r.status,'insufficient_evidence');assert.equal(r.findings[0].confidence,'candidate');assert.equal(r.findings[0].evidence.source_evidence_sha256,'abc');
});
test('migration review requires explicit opt in and valid evidence shape',()=>{
 assert.equal(detectMigrationReview(base,{}).status,'not_configured');
 assert.throws(()=>detectMigrationReview(base,{migration_review:{enabled:false}}));
});
test('clean candidate scan is scoped, not production migration approval',()=>{
 assert.equal(detectMigrationReview(base,{migration_review:{enabled:true}}).status,'pass_within_declared_scope');
});
test('unresolved external aliases do not silently pass domain boundary',()=>{
 const report={...base,dependency_graph:{edges:[{from:'src/domain/a.ts',specifier:'@infra/db',to:null,resolution:'external_or_unresolved_alias'}],unresolved:[]}};
 const contract={domain_boundary:{domain_roots:['src/domain'],forbidden_packages:['pg'],forbidden_paths:['src/infrastructure']}};
 assert.equal(detectDomainBoundary(report,contract).status,'insufficient_evidence');
});
test('control runner includes both controls with distinct results',()=>{
 assert.equal(runControlDetectors(base,{migration_review:{enabled:true}}).results.length,6);
});
