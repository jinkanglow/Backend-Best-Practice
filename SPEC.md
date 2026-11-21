# Backend Engineering Assurance Plugin — Implementation Specification v1.0

## 0. Status
Design specification only. No runtime validation, integration, production readiness, or compatibility claims. This is an original engineering synthesis; it does not reproduce source-book passages.

## 1. Product contract
A local-first CLI and agent skill that discovers backend project characteristics, evaluates applicable rules, emits reproducible findings, proposes bounded remediations, and enforces configurable CI quality gates. The agent never labels an unexecuted check as passing.

### Non-goals
Not a universal proof of security, not an autonomous production deployer, not a replacement for security review, not a mandatory hexagonal architecture migration, not a score generated solely by LLM opinion.

## 2. First implementation scope
TypeScript Node.js backend projects (Fastify, Express, NestJS) with PostgreSQL; monorepos supported through workspace selection. Other stacks report `unsupported`, not `pass`. Runtime tests execute only with explicit user configuration in isolated disposable environments. CLI implementation: TypeScript on supported Node LTS; parser: TypeScript compiler API; dependency graph: resolver-aware imports; OpenAPI validation: schema parser; reports: JSON and SARIF 2.1.0.

## 3. CLI
```
backend-guard init [--workspace PATH]
backend-guard inventory [--format json]
backend-guard check [--profile baseline|strict] [--format text|json|sarif] [--output PATH]
backend-guard test --suite authorization|idempotency|transactions|api-contract --target TEST_CONFIG
backend-guard gate --report PATH --policy backend-guard.policy.yaml
backend-guard explain RULE_ID
backend-guard fix RULE_ID [--dry-run] [--apply]
backend-guard doctor
```
Exit codes: 0=gate passed; 1=confirmed blocking violation; 2=configuration/unsupported/insufficient evidence when policy requires evidence; 3=tool execution failure. `check` must not mutate project files. `fix` defaults to dry-run and must never write secrets or execute migrations.

## 4. Repository layout
```
backend-engineering-plugin/
  README.md
  SKILL.md
  package.json
  backend-guard.schema.json
  backend-guard.policy.schema.json
  rules/
    code/
    architecture/
    api/
    authorization/
    database/
    resilience/
    observability/
    delivery/
  packages/
    cli/
    core/
    adapters-typescript/
    adapters-node-http/
    adapters-postgres/
    runtime-harness/
    reporter-json/
    reporter-sarif/
  fixtures/
    vulnerable/
    compliant/
    ambiguous/
  tests/
    rule-contract/
    integration/
    mutation/
  docs/
    rule-authoring.md
    evidence-model.md
    threat-model.md
    adoption.md
  .github/workflows/ci.yml
```

## 5. Rule contract
Every rule has immutable ID, semantic version, title, intent, severity, applicability predicate, required evidence, detection adapter, false-positive limitations, passing/failing/unknown criteria, remediation constraints, and positive/negative fixtures. A rule cannot be marked stable without fixture tests and a documented known limitation.

Status enum: `pass | fail | warning | unknown | not_applicable | unsupported | error`. `unknown` means applicable but evidence insufficient; `unsupported` means analyzer cannot assess; `error` means execution failed. None count as pass. Each rule result includes rule_id, rule_version, subject URI, line/column when available, status, severity, confidence (`confirmed|candidate`), engine, evidence references, elapsed_ms, analyzer_version, and optional remediation. Runtime evidence includes command, environment identifier (redacted), start/end timestamps, exit code, test assertions, and artifact hash.

## 6. Mandatory detection rules (v1)
- CODE-001: no empty catch or swallowed rejected promise without documented handling; TypeScript AST; fixture confirms explicit logging+rethrow or intentional recovery is not flagged.
- CODE-002: domain module imports from forbidden HTTP/ORM infrastructure packages; configurable layer graph; import resolver handles aliases and reexports.
- API-001: HTTP handlers validate untrusted request payloads before business side effects; framework-aware analysis; indirect validation yields unknown rather than pass.
- API-002: declared OpenAPI request/response schemas agree with executable contract tests; schema-only validation is candidate evidence.
- AUTH-001: protected route lacks resolvable authentication enforcement; framework-specific detection; inherited/global guards must be resolved.
- AUTH-002: user/tenant scoped operations require negative cross-scope tests; static checks identify candidates, actual pass requires runtime isolation assertions.
- DATA-001: transaction spans related database writes for declared atomic operations; dynamic rollback test required for pass.
- DATA-002: migration contains destructive DDL or potentially long blocking operation; flag for review; cannot prove safety statically.
- DATA-003: schema migration compatibility assessed for rolling deployments; requires declared deployment topology and compatibility tests.
- REL-001: outbound network requests have bounded timeouts; framework adapters check effective configuration.
- REL-002: retry policy is bounded and avoids unsafe non-idempotent retries; ambiguous semantics yield unknown.
- REL-003: declared idempotent mutation preserves a single side effect across duplicate/concurrent requests; dynamic test required.
- SEC-001: known secrets embedded in tracked source; pattern and entropy candidates require review; never echo detected values.
- SEC-002: tainted untrusted input reaches raw SQL execution without parameterization; static candidate plus negative test.
- OBS-001: request correlation context is propagated into error logs for declared critical routes; integration assertion.
- OPS-001: graceful shutdown stops accepting requests and drains in-flight work within configured deadline; integration test.

## 7. Default policy
Baseline blocks confirmed critical/high violations; reports candidates as warnings; strict also blocks unknown/unsupported for explicitly designated critical controls. No aggregate score can override a blocking gate. `not_applicable` requires a recorded reason. Waivers require rule_id, resource scope, rationale, owner, expiry date, and approval reference; expired waivers fail. CI reports must not contain credentials, tokens, or full sensitive request bodies.

## 8. Runtime harness
Tests run against disposable services and seeded test data. Test configs explicitly define base URL, test principal A/B, resource ownership fixtures, database isolation, reset hook, and expected response classes. Reject targets identified as production unless a separate deliberate opt-in policy exists; v1 does not implement production test execution. Never automatically invoke destructive cleanup on an unknown database. Capture actual observed requests, assertions, and exit status. Fault injection only on local controlled dependencies.

## 9. Idempotency test protocol
For declared endpoint: create isolated fixture; issue request with key K and payload P; repeat K/P sequentially; issue K/P concurrently; issue K with different payload; inspect persisted side effects via configured oracle. Assert exactly one committed business operation for K/P; replay returns contract-consistent outcome; conflicting payload is rejected according to API contract. Timeouts and inconclusive oracle return unknown. No universal status-code assumption.

## 10. Authorization test protocol
Create A-owned and B-owned resources, authenticate as A, verify A's allowed operations, attempt read/update/delete of B-owned resource where endpoints exist, verify denial and no B-state mutation. Distinguish 403 and intentional 404 concealment according to contract. Do not treat 401 alone as sufficient resource-level authorization evidence.

## 11. Migration test protocol
Parse migration and classify additive, destructive, data rewrite, index build, constraint validation, and unknown. Require database-engine/version and deployment topology. Run against representative disposable schema and seeded dataset; measure lock/elapsed time where possible; test backward compatibility with old application version when rolling deployment is declared. A small fixture cannot establish production lock safety; report coverage limits.

## 12. Remediation safety
All suggested patches include affected files, precise violated invariant, proposed change, and required regression tests. Dry-run by default; preserve public contracts; never silently change database schema, authentication policy, payment behavior, or retry semantics. Re-run relevant rules and tests after applying. If verification fails, report incomplete remediation rather than success.

## 13. Acceptance tests for plugin itself
Each stable rule must have: one passing fixture, one failing fixture, one ambiguous fixture, deterministic repeatability, an expected SARIF result, and a false-positive regression. CI must run parser unit tests, rule contract tests, integration tests with disposable PostgreSQL, schema validation, and CLI exit-code checks. Baseline test fixtures must never reach external networks.

## 14. Rollout
M0: CLI, config schemas, inventory, JSON/SARIF reporters, four static rules, 3 fixtures each.
M1: architecture/API/security analyzers and baseline gate.
M2: isolated Postgres runtime harness, authorization and idempotency behavioral suites.
M3: migration, resilience and shutdown fault-injection suites.
M4: agent skill integration, controlled fixes, CI compatibility, performance/false-positive benchmarking.
A milestone is complete only when runnable artifacts and CI evidence exist; documentation alone does not qualify.

## 15. Evidence honesty
Verified: rule executed and assertions satisfied in a declared environment. Candidate: static evidence suggests a defect. Unknown: applicability established but missing proof. Not applicable: documented predicate false. Unsupported: analyzer unavailable. Never claim production reliability from fixture tests or local runs alone.


## 16. v1.1 implementation delta (2026-11-19)

The executable prototype is deliberately narrower than the target above. Implemented: dependency-free Node.js CLI, four regex-based candidate rules, JSON/SARIF emission, JSON policy gate, minimal automated tests. The previously specified TypeScript compiler API, YAML policy, runtime harness, framework adapters and automatic fixes are **not implemented**. The four detectors are not the same complete implementation as the v1 target rules; none can return a verified PASS.

### Rule confidence contract
`candidate` is an observation requiring review, not a confirmed defect. `unknown` is the status of all four controls because heuristic absence cannot prove compliance. A baseline gate with exit 0 means only that no **confirmed** blocking findings were reported; it is not an assurance claim. `require_evidence: true` returns exit 2 until supported verification exists.

### Next engineering milestones
M0.1: replace regex with TypeScript compiler AST and parser unit tests; handle aliases and reexports. M0.2: JSON schema validation and formal evidence provenance. M0.3: verify SARIF compatibility with a consumer. M1: implement framework-specific detection and genuine pass/unknown criteria. M2: isolated runtime harness with two-tenant authorization and concurrent idempotency tests. Do not claim milestones complete without execution evidence.

---

## v1.2 implementation delta (2026-11-19)

The original specification remains a target architecture, **not an implementation inventory**. v1.2 implements the following subset:

- TypeScript Compiler API AST checks for `CODE-001`, `REL-001`, `SEC-001`.
- `ARCH-001` relative import/reexport boundary check against user-supplied glob rules.
- Relative dependency graph, parser diagnostics, source hash and position evidence.
- `DATA-002` remains SQL heuristic. JSON/SARIF and gate preserved from v1.1.

### Finding interpretation

`confirmed` means a syntactic or policy property was observed (e.g. a literal empty catch, a forbidden import), **not** that a security exploit was established. `candidate` means a risk pattern warrants review. Rule-level `unknown` means the analyzer has not established system-wide compliance. Strict gate returns exit 2 for unknown controls or parse diagnostics; exit 1 is reserved for confirmed blocking findings.

### Known limitations / acceptance boundary

No type checker, full module resolver, interprocedural dataflow, runtime harness, database fixture, benchmark corpus, or production CI integration is implemented. The analyzer is not a complete TypeScript compiler and unresolved imports must not be treated as clean dependencies. Every future rule must have at least one passing, failing, and ambiguous fixture before it is enabled by default.

## v1.3 implementation delta (verified in local test fixtures)

- `tsconfig.json` options are parsed with TypeScript's config API; diagnostics are included in the report.
- `ts.resolveModuleName` is used to resolve static import and re-export edges, including path aliases.
- `forbidden_dependencies[].to` matches the resolved repository-relative file; `[].import` continues to match raw specifiers.
- `forbidden_dependencies[].transitive=true` traverses the resolved internal dependency graph and includes `dependency_path` in the evidence.
- The quality gate counts confirmed high/critical findings with status `warning` or `fail` as blockers.
- Tested: alias resolution, transitive re-export, gate exit code, malformed tsconfig. Not tested: real monorepos, project references, package exports, CommonJS, dynamic import, or CI provider SARIF ingestion.

### Next acceptance gate

Before claiming production-ready semantic analysis, implement a real TypeScript Program and TypeChecker, parse diagnostics per project, project references, dynamic and CommonJS edges, edge-type classification, bounded graph traversal, fixture-based precision/recall measurement, and independently verified CI SARIF ingestion.

## v1.4 Program-aware analysis increment

Implemented: a TypeScript `Program` and `TypeChecker` are initialized using discovered project compiler options; compiler diagnostics are captured (capped at 500), dynamic `import('literal')` and `require('literal')` dependencies are included in the graph and enforced against configured boundaries. Unresolved relative dependencies are reported as evidence gaps. This is **not** whole-program taint analysis or call graph analysis. The checker is initialized but is not yet used for cross-file symbol-based rules. Nonliteral imports, workspace package boundaries, and project references require additional work.

Strict gates include unresolved relative dependencies as insufficient evidence. Compiler diagnostics are reported separately and are not automatically interpreted as security violations. Rule verdicts remain unverified unless evidence establishes a specific violation; absence of findings never implies compliance.

## v1.5 Static Symbol Call Graph (implemented)

`call_graph` contains `nodes`, `edges`, `unresolved`, and `scope`. Nodes identify source-defined functions, methods, constructors, and arrow/function expressions by repository-relative path and source offset. An edge is emitted only when TypeChecker symbol resolution identifies exactly one source-defined function target; aliased imports are dereferenced. Indirect callbacks, unresolved dynamic dispatch, and external library calls are reported separately, not assumed safe. Calls include source location, expression text (capped at 160 characters), and enclosing function ID where known. This is **not** a full interprocedural control-flow graph or taint analysis; it does not establish HTTP-to-database dataflow or runtime reachability. The quality gate continues to operate on validated findings, not the mere presence of call edges.

### v1.6 acceptance targets

1. Build symbol-based call graph fixtures for overloaded methods, class instances, callbacks, polymorphism, and barrel exports, with explicit unresolved classification.
2. Add argument-to-parameter propagation only for statically resolved calls, with bounded depth and cycle detection.
3. Require source/sink/sanitizer contracts before adding any security dataflow rule. Track provenance and report unknown when any hop cannot be resolved.
4. Benchmark false positives and false negatives against independently labeled repository fixtures; report sample counts and precision/recall, not ungrounded accuracy percentages.
5. Introduce runtime validation in isolated environments before claiming authorization, concurrency, idempotency, or recovery assurance.

## v1.6 — Bounded interprocedural candidate dataflow

`report.dataflow` is a separate evidence domain. It does not generate confirmed vulnerability findings.

- Sources: syntactic `req.body` / `request.body` property reads.
- Sinks: configured function names (`executeRawUnsafe`, `queryRawUnsafe` by default).
- Propagation: local identifiers, assignment, return values, arrays, objects, templates, conditional expressions, and statically resolved calls with positional argument mapping.
- Bound: default five call levels, configurable `dataflow.max_call_depth` up to twelve.
- Unknowns: unresolved calls receiving tracked values, recursion cycles, and call-depth exhaustion.
- Output: `flows`, `unknown`, `truncated`, `configured_sinks`, `configured_sanitizers`.

**Assurance limits:** path-insensitive, no alias/heap modeling, no closure or callback modeling, no framework-wide request object inference, no control-flow proof, no semantic validation/sanitizer verification, and no runtime exploit confirmation. Sanitizer names are explicit project assertions and must be independently verified. Sinks matched by name are candidates, not proven database sinks. Unobserved flows must not be interpreted as passing security checks.

### v1.6 Acceptance evidence

- Direct request-body-to-sink flow fixture passes.
- Cross-file positional argument flow fixture passes.
- Constant-only sink input does not produce taint flow.
- Unresolved callback receiving tracked data produces an unknown evidence gap.

Next: CFG-aware propagation, SSA-style variable versions, symbol-identity sink matching, framework adapters, validated sanitizer contracts, and labeled benchmark datasets. No performance, precision, or recall claims until measured.


# v1.7: Independent backend engineering control catalog

This release adds 85 authored controls in 17 categories, project and finding schemas, deployment profiles, and agent execution contracts. The catalog is normative guidance, not proof that every control is automatically detected. Preserve the v1.6 AST/call graph/dataflow capability labels and their limitations.

## Required future implementation contracts

- Every new rule: applicability predicate, exact evidence sources, pass/fail/unknown conditions, safe remediation, negative test, fixture and version.
- Every runtime test: isolated environment, test data setup, reproducible command, timeout, teardown and immutable report.
- Every gate: distinguish confirmed blockers, candidate risks, unknown evidence and execution failures.
- Every automatic fix: patch preview, regression test, revert path and approval boundary.
- Every performance threshold: derive from a declared SLO, not a universal constant.


## v1.8 Executable evidence layer

The 85-control catalog is evaluated into explicit `pass`, `fail`, `unknown`, or `not_applicable` states. No control is auto-passed because no finding was observed. Framework adapter identification is restricted to manifest dependency declarations. The harness executes only explicitly supplied trusted argv, with a bounded timeout and output digest. The assessor rejects malformed attestations and enforces strict evidence gates. `pass` denotes a submitted attestation, not an independently verified guarantee. This version does not implement 85 static rules, automatic framework-specific checks, or isolated runtime execution.

## v1.9 Evidence chain and limits

- Test manifests have `schema_version=1.9` and bounded test kinds: command, http (loopback only), sqlite_migration.
- Each run records a control mapping, execution result, timestamp, and SHA-256 evidence digest.
- The verified gate executes and assesses in one process. It does not accept a standalone user-authored report as verified execution.
- Test success is not promoted to control compliance; control remains `unknown`. Test failure is linked to the declared control as failure evidence.
- Framework-specific findings are candidate heuristics, not authenticated route/security verification.
- Runtime command manifests are trusted input and must not be executed from unreviewed contributions.
- PostgreSQL/MySQL migration semantics, transaction race conditions, idempotency fault injection, and independently authenticated provenance remain unsupported.

## v2.0 implemented execution slice

The executable v2.0 module adds opt-in PostgreSQL/MySQL migration execution, transaction SQL rollback-before-commit fault injection, concurrent HTTP idempotency observations, explicit query assertions, control-ID linkage, per-run evidence digests, and optional HMAC signature verification. It does not supply a database server, an isolation sandbox, a network fault proxy, or independent CI infrastructure. See the v2.0 reference contracts for scope and trust boundaries.

## v2.1 — Runner attestation and integration harness

- `infra/compose.integration.yml` defines disposable PostgreSQL and MySQL test services with health checks and loopback ports. The integration script requires an explicit opt-in and tears down volumes on exit.
- `lib/attestation.mjs` signs SHA-256 digests of canonicalized execution reports with Ed25519. Claims include runner ID, run ID, legacy v2.0 manifest hash, environment image digest and issuance timestamp.
- Verification requires a pinned public key, expected manifest hash, expected image digest and valid signature. The API supports an external replay ledger via `seenRunIds`.
- Attestation is cryptographic integrity and runner-key identity evidence, **not independent proof of runtime execution or correctness**. A protected CI runner and a durable replay ledger are deployment requirements.
- Actual PostgreSQL/MySQL execution, fault-injection repeatability, and process isolation remain unverified until run in a provisioned CI environment.


## v2.2 — Concrete engineering decision contracts

The new reference set specifies request authorization, transactional invariants, duplicate delivery, fault budgets, migration rollout, algorithmic cost, architectural fitness and evidence acceptance. The reference files are authored as original implementation contracts, not copies of third-party code or text.

### New executable rule: architecture-metrics
Input: a report containing `dependency_graph.edges`. Output: node/edge counts, unresolved count, directed strongly connected components, and top fan-in. `observed` is not `pass`; `partial` means some edges could not be resolved; `unknown` means an analysis budget was exceeded. Cycles are diagnostic until a project policy explicitly prohibits them. No claim of runtime dependency completeness. Exit 2 for unknown due to analysis budget, 0 for observed/partial.

### Verification tiers
T0 specification only; T1 static candidate; T2 executable local assertion; T3 real dependency integration; T4 isolated fault test; T5 independently verified runner attestation. A control can be accepted only for the scope directly supported by its evidence.


## v2.3 — Architecture regression gate
A deterministic iterative SCC analysis replaces recursive Tarjan traversal, removing the former 1,500-node recursion limit while preserving configurable node/edge budgets. The gate compares SCC membership against a baseline, reports added/removed cycles and distinguishes `fail` from `insufficient_evidence`. It does not infer architecture fitness from absence of cycles. Baseline provenance is not cryptographically verified.

## v2.4 detector mapping and evaluation contract

`rules/detector-registry.json` contains a versioned `detectors` array. Each entry must contain `id`, `status` (`implemented`, `candidate`, `planned`) and `control_ids` referencing known catalog controls. `coverage` validates references and returns `detector_declared_not_validated` rather than `pass` for declared implemented detectors. Missing declarations are `unimplemented`. The command is an inventory of mappings, not an execution proof.

`benchmarks/architecture.json` contains labeled graph-regression cases. `benchmark` produces per-case `expected`, `observed`, `matched` and confusion-matrix statistics. Insufficient-evidence cases are counted separately; undefined precision and recall must be represented as `null`. The default corpus is a smoke test, not an external representative dataset.

## v2.5 Control ID execution contract

`detect-controls` consumes a static analysis report and an explicit project contract, executes BE-01-02 direct-import enforcement, and emits per-control evidence. Findings must cite a concrete dependency edge. Missing configuration returns `not_configured`, incomplete resolution returns `insufficient_evidence` when no violation is already proven. Exit codes: 0 scoped pass, 1 confirmed contract violation, 2 unknown, 3 invalid input. Future detectors must satisfy the same test and evidence contract before registration.

## v2.6 migration candidate control

BE-05-04 is implemented as an evidence-request detector. It consumes `DATA-002` heuristic findings and produces candidate review findings; it does not confirm destructive SQL semantics or accept self-attested approval. `migration_review.enabled=true` is required. Domain-boundary unresolved external aliases are treated as incomplete evidence. Coverage registry entry means implementation is declared, not independently validated.


## v2.7 — Executable candidate detectors

The `detect-controls` command accepts `examples/control-v27.contract.json`. Two additional controls are now wired to actual TypeScript AST detectors: `BE-02-01` flags direct request-body arguments at configured side-effect methods; `BE-09-02` flags template interpolation and string concatenation passed to configured SQL query methods. Both return `insufficient_evidence` even when no candidates are found: validation, authorization, query parameterization, and reachability cannot be proved by syntax alone. Candidate findings must not be treated as confirmed vulnerabilities. The detector registry marks these as `implemented_candidate_only`. Run `npm test` and inspect the JSON output before interpreting results.

## v2.8 executable behavioral test contract

`behavioral-test --manifest <path> [--output <path>]` accepts `schema_version: 2.8` and a bounded list of `authorization_negative` and `idempotency_concurrent` tests. Credentials come exclusively from environment variables. Network calls are restricted to loopback HTTP, no redirects. The harness records response status, body hashes and bounded side-effect counter observations, never response bodies or tokens. Results are `observed_pass` or `observed_fail`, not global compliance. Exit code 1 means at least one observed failure; 0 means all specified observations passed. It is a separate test execution command, not yet wired into the 85-control assurance gate or independent attestation.

## v2.9 Behavioral Control Gate Contract

Input: schema 2.8 behavioral manifest and optional profile with `required_behavioral_controls` (array of Control IDs) and `strict` boolean. The manifest is hashed with SHA-256 before execution. The gate invokes the existing local HTTP behavior runner and binds each test ID, kind and expected Control ID to its observation. Unknown required controls are `insufficient_evidence`. Observed failures take precedence over unknowns. Output: schema 2.9, manifest hash, execution, assessment and explicit limitations. Exit codes: 0 for limited-scope observations, 1 for observed failure, 2 for missing required evidence, 3 for CLI/config errors.

The gate is intentionally **not** a substitute for signed independent attestation, real database crash recovery, rollback isolation, or full authorization policy coverage. See `references/behavioral-control-gates.md` and `references/sql-query-correctness-and-cost.md`.

## v3.0 SQL correctness execution contract

CLI: `backend-guard sql-correctness --manifest FILE [--output FILE]`.

Input: JSON schema version `3.0`, engine `postgres` or `mysql`, connection URL environment-variable name, explicit disposable-database acknowledgment, and up to 50 cases. Cases must declare one of `null_semantics`, `join_cardinality`, `query_plan`, `transaction_isolation` and valid Control IDs. The command requires `BACKEND_GUARD_ALLOW_DB_TESTS=yes`.

Execution: connect to selected engine through the optional driver, run read-only SQL assertions in transactions, rollback after each case, close the connection, and return case-specific evidence. Supported assertions include exact rows, row count, distinct count, plan fragments and estimated rows. Exit codes: 0 observed limited pass, 1 assertion failure, 2 execution error or insufficient evidence, 3 CLI/configuration error (subject to existing CLI error handler).

Non-goals: concurrency isolation proof, destructive migration testing, production query latency guarantees, independent attestation, and complete SQL injection prevention. A transaction isolation level setting alone does not prove its behavior.

## v3.1 Transaction Schedule Contract

`transaction-schedule --manifest <file> [--output <file>]` executes ordered steps on independent database sessions. Output contains manifest SHA-256, per-step error codes, row digests, control IDs and gate decision. Exit codes: 0 = explicit assertions passed within observed scope, 1 = explicit assertion failed, 2 = incomplete evidence, 3 = invalid manifest or execution setup. Scenario names are labels; no automatic classification of lost updates, phantom reads, or serialization anomalies is performed. The scheduler is sequential and does not guarantee concurrent lock contention. See `references/transaction-anomaly-scheduler.md` for required pre/post-state assertions and safety constraints.

## v3.2 — Parallel transaction harness

**CLI:** `backend-guard parallel-transaction --manifest <file> [--output <file>]`.

**Manifest:** `schema_version=3.2`, `engine=postgres|mysql`, `connection_env`, explicit disposable database acknowledgment, `cases[]`. Each case has `id`, `control_ids[]`, `isolation`, optional `lock_timeout_ms`, `setup[]`, `phases[]` and `cleanup[]`. Each phase runs one operation per session concurrently, then joins at a barrier. Each query may specify `params`, `expect_error`, and `assert` (`row_count`, `first_row`, `affected_rows`). `setup`/`cleanup` only allow observer DML; DDL must be bootstrapped independently.

**Execution:** Each case opens separate session connections, executes deterministic setup and cleanup in order, and rolls back outstanding transactions. On PostgreSQL, a local lock timeout is set within a transaction; on MySQL, the session InnoDB lock timeout is set in seconds. The engine records only hashes of SQL and row values. Unexpected errors or failed cleanup produce insufficient evidence unless an explicit assertion already failed.

**Evidence:** The report contains Control IDs, manifest SHA-256, ordered phase identifiers, observed error codes, row counts, affected rows, hashed first rows, assertion outcomes and cleanup status. This is locally generated evidence, not independently attested.

**Exit:** `0=observed_pass_limited`, `1=fail`, `2=insufficient_evidence`. Neither concurrency start nor passing mock tests proves lost-update, phantom or retry recovery semantics. Real-engine integration requires Docker and is opt-in.

## v3.3 Conflict/Recovery Harness Contract

Command: `backend-guard conflict-recovery --manifest examples/conflict-postgres-v33.json --output report.json`.

Manifest `schema_version: 3.3` requires `engine`, `connection_env`, disposable database acknowledgements, and a nonempty `cases` array. Each case requires a known `control_ids` mapping, an isolation level, bounded `lock_timeout_ms`, a shorter `probe_ms`, a holder UPDATE, a contender UPDATE, a holder `release` action, bounded retries, explicit retryable database error codes, deterministic setup/cleanup, and a final observer SELECT with exact row-count/value assertions.

Output `assessment.exit_code`: `0` for all specified observations passing, `1` for observed assertion failures, `2` for insufficient execution evidence. Hashes are integrity markers, not independent attestations. A pending contender is a timing observation, not a verified database lock graph. The test cannot prove the absence of all transaction anomalies.

## v3.4 — database lock observation

The `conflict-recovery` command accepts `schema_version: "3.4"` and requires database-side observation of the exact holder/contender pair. `schema_version: "3.3"` remains supported for backward compatibility but does not produce database lock proof. PostgreSQL uses `pg_stat_activity`/`pg_blocking_pids`; MySQL uses `performance_schema.data_lock_waits`. Observation failure or missing matching pair MUST produce `insufficient_evidence`, not `observed_pass`. Scope: sampled row-lock contention only; other anomaly types are specified in `references/database-lock-evidence-v34.md` and are not yet automated.

## v3.5 Transaction anomaly runner

The `anomaly-scenarios` command accepts a schema_version `3.5` manifest containing exactly one case for each of `lost_update`, `non_repeatable_read`, `phantom_read`, `serialization_failure`, and `retry_recovery`. Each case must have known Control IDs, explicit setup/cleanup, two-session steps, and independent final-state assertions. Return exit 0 only for all observed expected outcomes, exit 1 for a deterministic assertion failure, and exit 2 for insufficient execution evidence. These statuses are scoped to the declared fixtures; they do not certify an application or production database.

## v3.6 — evidence contract

`anomaly-scenarios` accepts schema versions `3.5` and `3.6`. v3.6 adds `require_session_identity`, a `lock_probe` step, expected error-code arrays, and expected error checks on COMMIT/ROLLBACK. Database lock evidence is sampled from an independent observer and bound to exact session IDs. Failure to observe a required lock yields `insufficient_evidence`. Existing manifests do not yet schedule concurrent lock probes; see `references/real-database-evidence-v36.md` for limits and non-deterministic deadlock-victim behavior.

## v3.7 Async Lock Evidence Contract

Repeated server-side waiter/blocker matches are required; a pending client promise is not sufficient. MySQL deadlock victim selection is nondeterministic. CI HMAC signing is conditional on protected independent runner key material and currently covers aggregate run status only. No claim of completed end-to-end five-scenario verification is permitted until real database evidence is executed and linked to individual scenario events.

## v3.8 Scenario execution, event chain, and attestation

The anomaly runner accepts manifest schema `3.8` in addition to older schemas. The `coordinated_lock` action requires distinct `waiter` and `holder` sessions, active transactions, session identities, bounded database-side lock polling, and a valid single SQL statement. Failure to observe matching database-side lock edges yields `insufficient_evidence`.

Every case event is wrapped in a SHA-256 chain whose preimage includes the case ID, engine, zero-based index, predecessor digest, and original event. The separate `evidence-gate-v38` executable verifies all five chains, checks a CI-run-bound HMAC-SHA256 signature, and fails closed unless every scenario has `observed_pass_limited`, cleanup is complete, and aggregate assessment is `observed_pass_limited_scope` with exit code 0. An HMAC is only an integrity attestation within a trusted CI key boundary, not proof of the DB server's identity. Existing example manifests retain their original scenario schedules; lock coordination must be explicitly configured where it is applicable.

## v3.9 Real DB acceptance contract

`scenario-audit` verifies the v3.8 hash-chain envelope against the exact v3.9 manifest digest and produces per-case findings with Control IDs and `exit_code` 0 (observed limited pass), 1 (assertion failure), or 2 (insufficient evidence). `scenario-replay` runs the same manifest again and reports outcome divergence, not deterministic SQL interleaving. `evidence-gate-v39.mjs` requires both the five-case audit and independently held CI signing secret before issuing an attestation. See `references/real-db-acceptance-v39.md`.

## v4.0 Cross-run real database acceptance

`createEvidenceBaseline` accepts only a fully chain-audited five-case report and a live database environment record with server version and container image config digest. `compareEvidenceBaseline` rejects changed manifest, Control ID, final-state evidence, observed status, error finding codes, server version or image identity. Exit 0 means matching observed outcomes; 1 means drift; 2 means invalid/missing evidence. These results do not prove deterministic transaction interleaving. Docker execution and successful CI are not established by local unit tests.
