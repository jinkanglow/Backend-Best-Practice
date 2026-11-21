# Database-side Lock Evidence — v3.4

## Execution contract

1. Run only against disposable test databases; require both manifest mutation acknowledgement and BACKEND_GUARD_ALLOW_DB_TESTS=yes.
2. Establish distinct holder and contender sessions and obtain session IDs from the server itself.
3. Begin holder transaction; update exactly one seeded row; leave it uncommitted.
4. Begin contender transaction; start a conflicting UPDATE without awaiting it.
5. Probe for a pending contender; independently query the database's lock wait graph while the holder remains open.
6. Require the database-reported waiter/blocker pair to match the exact sessions. An empty result, inaccessible performance schema, or query failure yields insufficient_evidence.
7. Release holder, await contender, assert affected row count, commit/rollback and check final state through a third session.
8. Cleanup failures are insufficient evidence, never a pass.

## Database inspection

PostgreSQL: pg_stat_activity joined to pg_blocking_pids(waiter pid). The wait_event_type must be Lock. A sample proves a lock wait at the sample instant, not a durable ordering guarantee.

MySQL: performance_schema.data_lock_waits joined to performance_schema.threads via REQUESTING_THREAD_ID and BLOCKING_THREAD_ID. The database user must have SELECT access to these views; unavailable permissions are an evidence gap.

## Five distinct anomaly scenarios — acceptance specification

These scenarios are *specified* here, not claimed to be implemented by the v3.4 row-lock harness. Implement separate scenario runners with dedicated manifests, assertions, and DB-specific expected outcomes before marking them verified.

### Lost update

Seed counter=0. Session A reads 0; B reads 0; A writes 1; B writes 1. Require final 1 to confirm an observed lost update, or final 2 / transaction abort to confirm the configured prevention mechanism. Distinguish read-modify-write in application code from atomic `UPDATE counter=counter+1`. Use explicit barriers and an observer final read.

### Non-repeatable read

A begins and reads row value 10; B updates to 11 and commits; A reads again. Under READ COMMITTED, two distinct values may be observed. Under REPEATABLE READ, visibility and concurrent writer behavior depend on the engine and read mode. Assert both readings and B's commit, not only the final value.

### Phantom read

A queries `WHERE category='pending'` and counts N. B inserts a matching row and commits. A repeats the same predicate. Assert first and second result sets and committed insertion. Avoid conflating snapshot reads with locking reads. Expected outcome is engine/isolation dependent.

### Serialization failure

Construct a write-skew or conflicting serializable schedule; record exact SQLSTATE (PostgreSQL 40001; MySQL 40001 / vendor-specific errors as appropriate). Require observed transaction abort and final invariant preservation. Do not treat a lock timeout as proof of serialization failure.

### Retry recovery

After a retryable failure, explicitly ROLLBACK, create a new transaction, rerun the complete business operation with bounded attempts, and independently assert exactly one durable business effect. Check that failed attempts did not leak writes and that non-retryable failures are not retried.

## Evidence limitations

A positive lock wait sample proves only the sampled blocking relationship. A negative sample may reflect scheduling or insufficient observation frequency. Real integration tests must be run in the user's CI; this repository does not attest to runs that have not occurred.
