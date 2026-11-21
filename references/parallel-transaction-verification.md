# Parallel transaction verification — execution contract

## Input contract

Use `schema_version: 3.2`, a disposable database, `BACKEND_GUARD_ALLOW_DB_TESTS=yes`, a connection URL held in an environment variable, and explicit mutation acknowledgment. Only parameterized DML/query statements are accepted in the schedule. DDL is a separate, explicit bootstrap step.

## Barrier semantics

Each `phases[].steps` array is started concurrently via `Promise.all`; the next phase starts only when all operations in the current phase settle. At most one operation per session per phase. This establishes **start concurrency**, not deterministic lock acquisition order. Avoid assertions dependent on OS scheduling unless a database lock, timeout or other explicit coordination makes the order observable.

## Database differences

PostgreSQL uses `SET LOCAL lock_timeout` after `BEGIN`. MySQL uses `innodb_lock_wait_timeout` in seconds, rounded upward; its granularity differs. MySQL and PostgreSQL may return different error codes and isolation outcomes. Never reuse a database-specific expected outcome without validation.

## Isolation scenario requirements

- Non-repeatable read: first read, committed concurrent update, second read. Assert actual values and expected isolation level.
- Lost update: compare two read-modify-write transactions and verify the durable final value. A conflict/error alone does not prove application retry recovery.
- Phantom: compare predicate row counts after a concurrent committed insert. Use a controlled predicate and explicit isolation level.
- Serialization failure: assert the engine-specific error and verify rollback/connection state.
- Retry recovery: create a new transaction, retry a safe operation with bounded attempts and verify exactly one durable business effect. This release does not automate this full recovery protocol.

## Evidence & exit codes

`0` means all explicitly configured assertions passed within the observed scope; `1` means an explicit assertion failed; `2` means unexpected database errors, cleanup failures or missing assertions prevented reliable evaluation. Reports include manifest hash and SQL hashes, but are not independently signed. Keep credentials and sensitive row values out of reports.

## Operational limitations

The harness does not terminate hanging database calls at the JavaScript layer. Database lock timeout applies only to lock waits, not arbitrary network failures. Run inside a CI job with an external timeout and disposable container volumes. `ci/real-db-v32.sh` provisions and destroys both database containers; it has not been executed unless the host has Docker.
