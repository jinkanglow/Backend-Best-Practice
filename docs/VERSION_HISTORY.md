# Version history (v2.3–v4.0)

This historical record is retained from the original README. Older examples may require separate disposable services, credentials, and configuration.

## v2.3 — Architecture regression quality gate

The iterative SCC engine handles deep dependency chains without recursion. The new baseline command compares **new** cycles against a prior report and fails closed on unresolved imports by default:

```bash
node bin/backend-guard.mjs architecture-baseline \
  --report current.json --baseline baseline.json \
  --output architecture-diff.json
```

Exit codes: `0` no excess new cycles; `1` cycle budget violated; `2` insufficient evidence. Use `--allow-partial` only for exploratory work. Baseline authenticity and source-scope comparability are reviewer responsibilities.

## v2.4 — Reproducible benchmark and detector coverage audit

The `benchmark` command runs a labeled corpus of **architecture cycle-regression** cases. It reports confusion-matrix counts, precision and recall (null when mathematically undefined), and the cases with insufficient evidence. This is **not** a measurement of overall backend security detection accuracy.

```bash
node bin/backend-guard.mjs benchmark --corpus benchmarks/architecture.json --output benchmark-report.json
node bin/backend-guard.mjs coverage --output control-coverage.json
```

The `coverage` command reads `rules/detector-registry.json`, checks detector-to-control mappings, and reports which controls lack a declared implemented detector. A declaration is **not** proof of detector accuracy, nor proof that a control passes. The initial registry is deliberately empty, so all 85 controls are marked unimplemented for the purpose of automated control-level detection. Prior scanners and tests remain available; they are not falsely promoted to full control verification.

Before claiming a detector implemented, add a stable detector ID, specific Control IDs, test fixtures for positive and negative cases, a precise scope and explicit limitations. CI should fail on benchmark regressions and unknown registry IDs.

## v2.5 executable control detector

The first explicit Control ID detector enforces **BE-01-02** for direct imports from configured domain roots. It reports `fail`, `insufficient_evidence`, `not_configured`, or `pass_within_declared_scope`. This is a narrowly scoped check, not comprehensive backend assurance.

```bash
node bin/backend-guard.mjs detect-controls --root ./my-service --contract examples/domain-boundary.contract.json --output domain-result.json
node bin/backend-guard.mjs coverage
```

Customize the contract for the actual repository before running. Read `references/control-detector-acceptance.md` for applicability, evidence and known blind spots.

## v2.6 — Migration review evidence gate

Adds a second control-linked detector for **BE-05-04**. It links candidate destructive SQL migration findings to an explicit review requirement without asserting that the database is unsafe. The Domain Boundary detector now treats unresolved external aliases as incomplete evidence instead of silently passing.

```bash
node bin/backend-guard.mjs detect-controls --root ./your-backend --contract examples/migration-review.contract.json --output controls.json
```

The control report may return `insufficient_evidence` (exit 2). A clean heuristic scan returns `pass_within_declared_scope`, not a production migration approval. See `references/migration-evidence-gate.md`.


## v2.7 — Executable candidate detectors

The `detect-controls` command accepts `examples/control-v27.contract.json`. Two additional controls are now wired to actual TypeScript AST detectors: `BE-02-01` flags direct request-body arguments at configured side-effect methods; `BE-09-02` flags template interpolation and string concatenation passed to configured SQL query methods. Both return `insufficient_evidence` even when no candidates are found: validation, authorization, query parameterization, and reachability cannot be proved by syntax alone. Candidate findings must not be treated as confirmed vulnerabilities. The detector registry marks these as `implemented_candidate_only`. Run `npm test` and inspect the JSON output before interpreting results.

## v2.8 — Behavioral authorization and idempotency tests

The `behavioral-test` command runs **real loopback HTTP tests** against an already running, isolated test backend. It checks two-identity resource access and concurrent duplicate requests with a separate side-effect counter probe. Credentials must be supplied through environment variables; no secrets or response bodies are stored in reports.

```bash
export BGA_OWNER_TOKEN='test-owner-token'
export BGA_OTHER_TENANT_TOKEN='test-outsider-token'
node bin/backend-guard.mjs behavioral-test --manifest examples/behavioral-v28.json --output behavioral-report.json
```

The example URLs are illustrative and **will not work** until replaced with endpoints of a real local test backend. The harness does not reset test data or generate unique idempotency keys. Do not use production services or databases. Passing observations are not proof of all authorization or idempotency requirements; these observations are not yet part of the independently attested Quality Gate.

## v2.9 — Behavioral control-level quality gate

The new `behavioral-gate` command executes local HTTP authorization/idempotency scenarios, binds observations to the manifest SHA-256 and Control IDs, and fails closed when required scenarios are absent.

```bash
npm test
node bin/backend-guard.mjs behavioral-gate \
  --manifest examples/behavioral-v28.json \
  --profile profiles/behavioral-production.json \
  --output behavioral-gate-report.json
```

This example requires a running isolated test service and credentials supplied through environment variables. It will **not** succeed as a standalone smoke test. `observed_pass_limited_scope` does not imply comprehensive control compliance. Exit codes are 0 (observed limited pass), 1 (observed failure), 2 (required evidence missing), 3 (configuration or execution error).

New engineering references: `references/sql-query-correctness-and-cost.md` and `references/behavioral-control-gates.md`. They define explicit query cardinality, NULL, JOIN, indexing, query-plan, side-effect and identity-matrix acceptance criteria.

## v3.0 — SQL Correctness Harness

The `sql-correctness` command evaluates **declared SQL assertions** on PostgreSQL or MySQL using optional `pg` / `mysql2` drivers. It reports limited observed evidence, not blanket compliance.

```bash
npm install
npm test
# Set BGA_SQL_TEST_URL to a dedicated disposable PostgreSQL database.
export BACKEND_GUARD_ALLOW_DB_TESTS=yes
export BGA_SQL_TEST_URL='postgresql://...'
node bin/backend-guard.mjs sql-correctness \
  --manifest examples/sql-correctness-v30.json \
  --output sql-evidence.json
```

Supported cases: `null_semantics`, `join_cardinality`, `query_plan`, `transaction_isolation` (read-only observation only). SQL checks reject common mutating statements but are not a security sandbox; use restricted test credentials. No real database service is included in the unit-test results. See `references/sql-correctness-harness.md` for the exact contract and limitations.

## v3.1 — Transaction Schedule Harness

Run ordered steps across two independent database connections, with an optional observer connection:

```bash
export BACKEND_GUARD_ALLOW_DB_TESTS=yes
export BGA_TRANSACTION_TEST_URL='postgresql://.../disposable_test_database'
node bin/backend-guard.mjs transaction-schedule \
  --manifest examples/transaction-schedule-v31.json \
  --output transaction-evidence.json
```

The example demonstrates two connections and explicit assertions; **it does not reproduce a non-repeatable read**. To verify an actual anomaly, prepare disposable fixtures, interleave reads and writes, and assert the final durable state. Supported step actions are `begin`, `query`, `commit`, `rollback`, and `reconnect`; `expect_error` supports SQLSTATE checks. `observed_pass_limited` does not certify isolation correctness. Read `references/transaction-anomaly-scheduler.md` for the complete executable contract and limitations.

## v3.2 — Parallel PostgreSQL/MySQL transaction verification

A new `parallel-transaction` command executes two transaction sessions plus an independent observer. Operations in the same phase start concurrently; subsequent phases wait for the current phase to settle. This is a barrier, **not a deterministic database lock scheduler**.

```bash
npm install
npm test
BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db
```

The opt-in integration script starts disposable PostgreSQL 16 and MySQL 8.4 containers, bootstraps an isolated test table, runs the engine-specific manifests, and removes volumes on exit. It requires Docker, network access to install dependencies and permission to create containers. Do not run on production credentials.

Individual manifests: `examples/parallel-postgres-v32.json`, `examples/parallel-mysql-v32.json`. Technical contracts: `references/parallel-transaction-verification.md`. The CI workflow is `.github/workflows/real-db-v32.yml` and is provided as configuration; local unit tests do not establish that the workflow has run successfully.

**Verification boundaries:** The shipped real-engine scenario checks read-committed visibility after a committed update. Lost update, phantom, serialization failure and retry recovery still require additional deterministic real-engine scenarios and assertions. No independently signed attestation is produced by this command.

## v3.3: Lock Conflict and Retry Recovery

The `conflict-recovery` command performs a two-connection conflicting UPDATE with a third observer connection. It checks that the contender is pending before the holder releases its row, then verifies the final persisted row state. Expected SQL errors can trigger bounded retries after a transaction rollback.

```bash
npm install
npm test

# Disposable local PostgreSQL/MySQL containers required; Docker must be installed.
BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v33

# Or run against a separately provisioned disposable database:
BACKEND_GUARD_ALLOW_DB_TESTS=yes \
BACKEND_GUARD_PG_URL='postgresql://user:password@127.0.0.1:5432/testdb' \
node bin/backend-guard.mjs conflict-recovery \
  --manifest examples/conflict-postgres-v33.json \
  --output conflict-evidence.json
```

The sample manifest expects the `bga_v33(id INT PRIMARY KEY, value INT NOT NULL)` table. The CI script creates it in disposable containers. A successful case proves only the specified observed conflict and final-state assertions. See `references/lock-conflict-and-retry-recovery.md` for limitations and error classifications.

## v3.4 — database-side lock observation

Use `examples/conflict-postgres-v34.json` or `examples/conflict-mysql-v34.json` with the existing `conflict-recovery` command. The new manifest version verifies exact database-side waiter/blocker identities. Missing telemetry fails closed as `insufficient_evidence`. The previous v3.3 manifest remains available but does **not** prove lock waits. See `references/database-lock-evidence-v34.md` for the five anomaly acceptance contracts and limitations.

To run integration tests with Docker installed and an isolated test database:

```bash
BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v34
```

This integration suite has not been executed in the packaging environment; unit tests do not substitute for a live PostgreSQL/MySQL run.

### v3.5 — Executable transaction anomaly scenarios

The `anomaly-scenarios` command adds five independently seeded scenarios for PostgreSQL/MySQL: lost update, non-repeatable read, phantom read, serialization failure/deadlock, and transaction retry recovery. Each scenario binds to an existing Control ID and requires an independent final-state query. See `references/anomaly-scenarios-v35.md` for exact semantics, limitations and engine differences.

```bash
npm test
BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v35
```

The Docker command is destructive to its disposable database and requires explicit opt-in. The MySQL serializable deadlock victim is nondeterministic; a failure in that scenario is not automatically evidence of an engine bug. Unit tests do not establish that the real database integration has passed.

### v3.6 — Database evidence and real-DB CI

The anomaly runner now supports server-side lock attribution using session IDs and expected commit-stage serialization errors. This is a partial evidence integration, not a completed five-scenario DB proof. Run `npm test` for mocked regression tests; run `BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v36` on a disposable Docker host for real DB execution. CI retains separate JSON reports and logs under `artifacts/real-db-v36/`. See `references/real-database-evidence-v36.md` for unsupported deadlock-victim nondeterminism and asynchronous lock-probe limitations.

## v3.7 — Asynchronous lock evidence and CI provenance

`lib/async-lock-coordinator.mjs` exports `coordinateLockConflict`, `assessDeadlockOutcomes`, `signEvidence`, and `verifyEvidence`. The coordinator starts a waiter statement asynchronously, polls independent database-side blocking evidence, and releases the holder only after the configured minimum number of matching samples. It returns `insufficient_evidence` when observation is missing or incomplete. MySQL deadlock assessment permits either transaction to be the victim but requires one survivor and an independently observed final state.

`npm run test:real-db:v37` invokes the retained real database CI script and signs the aggregate result only when `BGA_CI_ATTESTATION_KEY` and `GITHUB_RUN_ID` are supplied. CI secret must be protected and independently managed. This is an incremental capability: the existing five scenario manifests are **not yet wired** into the new asynchronous coordinator, and the v3.7 CI script does **not** run a dedicated async deadlock test. See `references/async-lock-and-provenance-v37.md`.

## v3.8: Per-event transaction evidence and CI gate

- `lib/event-provenance-v38.mjs` creates and verifies tamper-evident event chains for all five transaction scenarios.
- `coordinated_lock` is a new optional action within `anomaly-scenarios`, combining an asynchronous waiter, repeated database-side lock observations, and holder release.
- `bin/evidence-gate-v38.mjs` signs and independently verifies full scenario reports using a protected CI secret and run ID.
- `.github/workflows/real-db-v38.yml` separates real-database execution from attestation and fail-closed verification.

```bash
npm test
BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v38
# In a separate trusted runner with BGA_CI_ATTESTATION_KEY and GITHUB_RUN_ID:
node bin/evidence-gate-v38.mjs sign artifacts/real-db-v38/postgres.json artifacts/real-db-v38/postgres.attestation.json
node bin/evidence-gate-v38.mjs verify artifacts/real-db-v38/postgres.json artifacts/real-db-v38/postgres.attestation.json
```

**Scope:** Real database integration requires Docker and was not executed merely by running unit tests. The existing five anomaly example schedules are not all lock-coordinated; see `references/event-provenance-v38.md` for limitations.

## v3.9 — Scenario audit and replay

The new `scenario-audit` command binds each observed database failure to the specific scenario and Control IDs, verifies the event hash chain and exact manifest digest, and rejects missing independent final-state observations. The `scenario-replay` command re-runs the five-case schedule and compares observed outcomes, without claiming deterministic lock acquisition or deadlock victim selection.

```bash
npm test
BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v39
node bin/backend-guard.mjs scenario-audit --manifest examples/anomaly-postgres-v39.json --report artifacts/real-db-v39/postgres.json --output artifacts/real-db-v39/postgres.audit.json
node bin/backend-guard.mjs scenario-replay --manifest examples/anomaly-postgres-v39.json --baseline artifacts/real-db-v39/postgres.json --output artifacts/real-db-v39/postgres.replay.json
```

**Evidence boundary:** A passing unit test does not establish that PostgreSQL/MySQL ran. CI execution requires Docker and must produce the engine-specific reports, audit, logs and protected-job attestation. See `references/real-db-acceptance-v39.md`.

## v4.0: Real-DB compatibility and evidence regression

```bash
npm test
BACKEND_GUARD_INTEGRATION_OPT_IN=yes npm run test:real-db:v40
```

The integration command requires Docker, creates fresh disposable PostgreSQL/MySQL instances twice, audits five transaction scenarios on each engine, captures live server version and running image identity, compares evidence against the first run, and fails closed on mismatches. See `references/real-db-compatibility-and-regression-v40.md` for evidence limits and CI signing requirements. **Do not claim real DB verification unless the Docker job has actually passed and its artifacts are available.**
