---
name: backend-engineering-assurance
description: Implement and verify backend changes with executable invariants, bounded analysis, runtime tests, and evidence-based quality gates.
---

# Backend Engineering Assurance — Agent Operating Contract

## Trigger
Use for backend endpoint, service, authorization, persistence, migration, queue, cache, background job, reliability, architecture or performance work. Never assume the framework, database, deployment or required consistency model.

## Mandatory workflow
1. Read `references/engineering-workflow.md` and inspect actual entrypoints, project scripts and configuration. Record known facts separately from unknowns.
2. Classify change: API / identity / data / messaging / operations / architecture / algorithm. Read only the matching references below.
3. Write a measurable invariant: preconditions, input, expected durable effect, forbidden effect and error behavior.
4. Identify Control IDs in `rules/control-catalog.json`; do not claim the catalog is automated.
5. Produce a failing regression test and a negative boundary test before altering the implementation when feasible.
6. Make the smallest reversible patch; include compatibility and rollback considerations.
7. Run `npm test` (for this plugin), and the target project's own tests, typecheck and integration suite as applicable. Never run destructive DB checks without explicit opt-in and disposable credentials.
8. Run `backend-guard check`, `architecture-metrics --report ...` when module boundaries matter, and `assess`/`assure-v2` only with reviewed manifests.
9. Deliver findings as `confirmed`, `candidate` or `unknown`. Report exact commands, outputs, failure scope and unverified behavior. No silent PASS.

## Reference routing
- Architecture / coupling: `references/architecture-fitness.md`, `references/code-contracts.md`
- Endpoints: `references/api-runtime-contracts.md`, `references/security-authorization.md`
- Data / migrations: `references/database-transactions.md`
- Queue / retries / idempotency: `references/messaging-and-idempotency.md`
- Algorithms / performance: `references/algorithmic-cost.md`
- Delivery / observability: `references/operational-reliability.md`
- Test evidence / gate: `references/evidence-acceptance.md`
- Full source control catalog: `rules/control-catalog.json`

## Safety and evidence limits
Static analysis cannot certify runtime safety. An untrusted test manifest can execute arbitrary commands. An attestation signature proves integrity and possession of a key, not correctness of the test. Never access production data or deploy without approval. Reject evidence with mismatched commit, missing assertions or unverified environment. Unknown is not pass.

## Definition of done
Return: affected contract, precise files changed, tests and exit codes, observed effects, backward compatibility, rollback, residual risks and explicitly unverified claims.


## v2.3 architecture regression contract
Before accepting a change affecting module dependencies, produce current and baseline reports with comparable scopes. Run `architecture-baseline` and record new cycles, unresolved dependencies and exit code. A zero exit code means no new cycles above the configured budget; it never establishes full architecture compliance. Review baseline origin independently. See `references/architecture-regression-gates.md`.

## v2.4 mandatory detector coverage discipline

1. Run `backend-guard coverage` before claiming control-level automation. Treat missing mappings as unimplemented, not as passing.
2. Run `backend-guard benchmark --corpus benchmarks/architecture.json` after changing dependency graph or architecture regression logic.
3. A benchmark fixture must state its expected decision and include enough graph evidence to reproduce it. Do not extrapolate fixture precision/recall to real projects.
4. For each new detector, add positive, negative, unsupported, and malformed-input fixtures; document false-positive boundaries and how a finding maps to its Control ID.
5. Keep candidate findings separate from confirmed failures and from full control compliance.

## v2.5 mandatory architecture boundary verification

When the project defines domain roots, run `detect-controls` with an explicit contract. Treat `pass_within_declared_scope` as a limited check, never as proof of full compliance. Do not infer domain directories or forbidden packages without inspecting the project. Retain the contract, execution report, and negative regression fixture. A missing or incomplete graph is insufficient evidence.

## v2.6: migration evidence and unresolved aliases

For migration changes, inspect `references/migration-evidence-gate.md`. Run `detect-controls` with a project contract that explicitly enables `migration_review`. Treat destructive SQL pattern hits as review candidates, never confirmed database failures. Do not infer migration safety from a clean pattern scan. Unresolved external aliases within configured domain roots are insufficient evidence unless their target is proven.


## v2.7 — Executable candidate detectors

The `detect-controls` command accepts `examples/control-v27.contract.json`. Two additional controls are now wired to actual TypeScript AST detectors: `BE-02-01` flags direct request-body arguments at configured side-effect methods; `BE-09-02` flags template interpolation and string concatenation passed to configured SQL query methods. Both return `insufficient_evidence` even when no candidates are found: validation, authorization, query parameterization, and reachability cannot be proved by syntax alone. Candidate findings must not be treated as confirmed vulnerabilities. The detector registry marks these as `implemented_candidate_only`. Run `npm test` and inspect the JSON output before interpreting results.

## v2.8 behavioral negative tests

For authorization, obtain two distinct test identities and one resource owned by the first. Verify successful owner access and denial to the second. Do not infer tenant isolation from middleware presence or a single happy-path test. For idempotency, run repeated requests with the same application-level key and observe a separate side-effect counter before and after; response equality alone is insufficient. Execute only against an isolated, explicitly approved local test server. The behavioral harness does not create test users, reset databases, simulate process crashes, or independently attest evidence. Record those gaps as unknown, not pass. See `references/behavioral-negative-tests.md`.

## v2.9 mandatory SQL and behavioral verification
- Before editing a SQL query, inspect schema constraints, index definitions, database engine/version, expected cardinality, nullable fields and execution plans. Apply `references/sql-query-correctness-and-cost.md`.
- Before claiming authorization or idempotency, identify the exact protected resource, identity matrix, side-effect invariant, independent probe and negative cases. Apply `references/behavioral-control-gates.md`.
- Run `backend-guard behavioral-gate --manifest <file> --profile profiles/behavioral-production.json` against a dedicated local test service. A passing result is `observed_pass_limited_scope`, not full compliance.
- Never synthesize success evidence, silently skip a required control, or treat a cryptographic digest as an independent runner signature.
- On database or HTTP test failures, preserve only sanitized diagnostics and reproducible non-secret test configuration. Never execute destructive tests on production databases.

## SQL correctness workflow (v3.0)

1. Inspect actual schema, engine, migration state and query callers. Never invent tables or production data.
2. For each SQL change, declare NULL behavior, join cardinality, ordering, and expected rows before implementation.
3. Use a dedicated disposable database, least-privilege credentials and deterministic fixtures. Do not run SQL harness against production.
4. Run `backend-guard sql-correctness --manifest examples/sql-correctness-v30.json --output sql-evidence.json` with explicit database opt-in.
5. Report each case's observed result and exact Control IDs. An observed pass never upgrades a whole control to certified.
6. For transaction isolation, require a separate two-connection concurrency test before claiming isolation safety.
7. Read `references/sql-correctness-harness.md` for precise safety, assertion and evidence requirements.

## v3.1 — Two-connection transaction evidence

For changes to transaction logic, first state the durable invariant and identify the actual tables and keys. Construct a controlled schedule using independent connections and an observer; require pre-state, interleaving, and post-state assertions. Do not treat a scenario label as proof of an anomaly. Record the exact isolation level and expected SQLSTATE. Retry the **whole transaction** on serialization failures, not just the last statement. For lock-based cases require database-enforced statement and lock timeouts. Stop with `insufficient_evidence` if a step cannot execute or its observation is missing. Never run against production or a shared persistent database. See `references/transaction-anomaly-scheduler.md`.

## v3.2 — Real database concurrency gate

For transaction or isolation changes, inspect `references/parallel-transaction-verification.md`. Specify the expected durable invariant and SQL assertions before editing code. Use a separate disposable database and an explicit bootstrap schema. Run `npm test` and, where Docker is available, `BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db`. Record whether the actual PostgreSQL/MySQL containers were started; mock-driver unit tests are not real-engine verification. Never treat a barrier as a deterministic lock-order guarantee. Missing or unverified scenarios remain `insufficient_evidence`.

## v3.3 — Lock conflict and retry recovery

When changing transaction code, require a disposable database and an explicit concurrency invariant. Use `backend-guard conflict-recovery --manifest <file>` to exercise a real conflicting row update and check the independent observer's final state. Inspect `references/lock-conflict-and-retry-recovery.md` for the execution and error contract. Never promote `observed_pass_limited` into blanket transaction safety. Record driver, database version, SQLSTATE, probe interval, retry count, final-state assertion, and cleanup result. If the database is unavailable, report `insufficient_evidence` rather than implying a live integration test ran.

## v3.4 — database-side lock evidence

For a claim of observed lock contention, require exact waiter and blocker session identities from PostgreSQL `pg_blocking_pids` or MySQL `performance_schema.data_lock_waits`. A pending Promise or timeout alone is not proof. Treat missing lock telemetry as `insufficient_evidence`. Follow `references/database-lock-evidence-v34.md` for execution and five anomaly acceptance specifications. Do not claim the five anomalies are implemented merely because the row-lock scenario passes.

## v3.5 — Execute five transaction anomaly scenarios

Run `npm test` before database integration. Use `BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v35` only against the disposable Docker test database. For direct execution, set `BACKEND_GUARD_ALLOW_DB_TESTS=yes` and the engine-specific URL, then run `backend-guard anomaly-scenarios --manifest examples/anomaly-postgres-v35.json --output evidence.json`. Do not treat an observed anomaly as an assurance that the application is safe; consult `references/anomaly-scenarios-v35.md` for engine-specific limitations and required final-state evidence.

## v3.6 — database evidence and commit-stage errors

Use `references/real-database-evidence-v36.md` before claiming a verified lock conflict. For transaction-specific tests, require explicit session identities, independent database lock observations, precise expected SQLSTATE/driver errors and final-state assertions. `lock_probe` is available but is not yet wired into the five sample manifests; do not treat them as database-confirmed lock scenarios. Run `BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v36` in an isolated Docker environment, and retain both engine reports and logs. Do not claim real DB verification unless that CI job has actually passed.

### v3.7 lock conflict evidence

Use `coordinateLockConflict` only with two identified DB sessions and a separate observer. Require repeated database-side lock matches, bound sampling and database-side timeouts. Use `assessDeadlockOutcomes` with either MySQL victim and an independent final-state check. CI provenance requires a protected runner-owned HMAC key; unsigned or unverifiable results are insufficient evidence. Consult `references/async-lock-and-provenance-v37.md`.

## v3.8 Event-bound transaction assurance

Run `npm test` and explicitly opt in to `npm run test:real-db:v38` on a disposable PostgreSQL/MySQL environment. Five anomaly scenarios produce hash-chained execution events and independent final-state observations. For actual blocking lock contention, add a `coordinated_lock` step to a scenario with `require_session_identity: true`, two active sessions, `waiter`, `holder`, and an UPDATE/DELETE/SELECT `sql`. The observer must obtain repeated matching database-side lock edges. A client-side pending request is insufficient.

CI must run the test executor without the attestation secret, then separately run `bin/evidence-gate-v38.mjs sign` and `verify` in an attestation environment with a protected key. Only a verified report with all five successful scenario statuses and complete cleanup passes the gate. An unsigned report is not independently attested. Do not claim real database verification without recorded execution artifacts.

## v3.9 scenario acceptance and replay

Run `npm test`, then on disposable PostgreSQL/MySQL only run `BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v39`. Use `backend-guard scenario-audit --manifest examples/anomaly-postgres-v39.json --report artifacts/real-db-v39/postgres.json --output audit.json` to produce control-bound failure attribution. `backend-guard scenario-replay --manifest examples/anomaly-postgres-v39.json --baseline artifacts/real-db-v39/postgres.json --output replay.json` re-executes the same schedule and compares observed outcomes; it does not promise identical interleaving. Consult `references/real-db-acceptance-v39.md` for the evidence contract. Never label a manifest, workflow, or mocked driver as a successful real-database execution.

## v4.0 Real Database Regression Gate

Do not claim PostgreSQL/MySQL acceptance from unit tests or from a workflow file. Run `BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v40` in a Docker-enabled runner. This executes two fresh disposable database runs, collects live server version and running container image config digest, and refuses to establish a baseline unless all five cases pass audit. Compare the second run against the first using `bin/evidence-regression-v40.mjs`. Independent CI attestation is a separate job. See `references/real-db-compatibility-and-regression-v40.md`.
