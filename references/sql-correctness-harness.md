# SQL Correctness Harness — execution contract

## Objective
Verify a declared, finite set of SQL observations against a dedicated database. A passed assertion is **not** a proof of all database correctness properties.

## Input contract
- `schema_version=3.0`; `engine=postgres|mysql`.
- `connection_env` names an environment variable; never put credentials in the manifest.
- `test_database_acknowledged=true` and `BACKEND_GUARD_ALLOW_DB_TESTS=yes` are required. These flags authorize testing; they do **not** establish isolation.
- Every case has unique `id`, `kind`, `control_ids`, `sql`, and `expected` assertions.
- `null_semantics`: compare ordered `rows` or `row_count`; use explicit `ORDER BY` for deterministic ordering.
- `join_cardinality`: assert `row_count`, optionally `distinct_column` and `distinct_count`; duplicates can be intentional, so expected values must be business-defined.
- `query_plan`: assert plan fragments or estimated rows. Plans are optimizer estimates and can change with statistics and version; this is not a latency benchmark.
- `transaction_isolation`: select a supported isolation level and execute read-only query assertions. This **does not** test concurrency anomalies or prove isolation guarantees.

## Safety
- Runs in read-only transactions and rolls back each case.
- SQL screening is heuristic; a malicious SQL function or stored procedure may still cause side effects. Run only against an isolated disposable database with restricted read-only credentials.
- No schema creation or fixture mutation is performed by this command. Prepare deterministic fixtures separately.
- Query plan uses EXPLAIN without ANALYZE, so statements are not intentionally executed for timing measurements.
- Test DB credentials and environment provenance are not embedded in the output.

## Evidence semantics
- `observed_pass_limited`: all requested assertions matched; scope remains limited.
- `fail`: at least one assertion did not match; exit 1.
- `insufficient_evidence`: execution error; exit 2.
- Manifest and SQL SHA-256 hashes bind evidence to submitted inputs but do not authenticate the runner.
- To use in a production gate, verify signed runner attestation and ensure fixture provenance independently.

## Required next tests
- Real PostgreSQL and MySQL service integration using ephemeral databases.
- Two-session concurrency schedules for non-repeatable reads, phantoms, lost updates, and serialization retries.
- Engine-specific plan schema and optimizer-version compatibility fixtures.
- Plan regressions measured on fixed representative datasets with warmed/cold cache controls.
