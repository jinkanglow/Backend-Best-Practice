# v3.7 Async Lock Evidence and Provenance Contract

## Observable conflict

A waiting SQL promise is not proof of lock acquisition or blocking. Identify two distinct server sessions, start a waiter statement asynchronously, then poll `pg_blocking_pids` or `performance_schema.data_lock_waits` using a third independent connection. Require repeated matching waiter/blocker pairs before releasing the holder. Samples must include session identities and the database source. Sampling interval and maximum samples must be bounded.

## Required runtime limits

Set server-side `lock_timeout` / `innodb_lock_wait_timeout` and statement timeouts. The coordinator does not cancel an unresolved database statement and is not a substitute for driver cancellation or forced connection teardown. Never reuse unresolved connections. Test only disposable databases.

## Deadlock acceptance

MySQL deadlock victims are not fixed: either A or B may receive `1213` / `ER_LOCK_DEADLOCK`. Exactly one victim and one committed survivor must be observed, followed by an independent final-state assertion. This helper evaluates supplied outcomes; the existing five-case manifests have NOT been migrated to it automatically.

## Evidence provenance

HMAC-SHA256 authenticates the evidence hash and CI run ID only when the signing secret is controlled by an independent runner. Protect the secret from untrusted pull requests and contributors; rotate it and restrict who can trigger signing. A signed summary does not prove that individual SQL events were authentic or that five scenarios passed. The v3.7 CI script currently signs the aggregate run-status file, not each scenario event. Missing secret must fail closed.

## Current limits

Unit tests cover orchestration with mock connections. Real PostgreSQL/MySQL execution is not established by local unit tests. Existing v3.6 scenario runner is retained without automatic migration to continuous lock sampling. Complete per-event database-to-CI attestation and end-to-end deterministic deadlock tests remain open.
