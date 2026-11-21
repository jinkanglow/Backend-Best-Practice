# Lock Conflict and Retry Recovery — executable acceptance contract

## Preconditions

- Run only on a disposable database, with explicit environment opt-in and an isolated test table.
- Two independent transaction connections and one observer connection are required.
- Seed a single known row. Confirm it exists before running a conflict case; a zero-row UPDATE is not a lock-conflict test.
- Specify expected row count and value after all transactions have completed. Every test must clean up even after an assertion failure.

## Execution protocol

1. Holder begins a transaction at a declared isolation level and updates exactly one row without committing.
2. Contender begins its own transaction and issues a conflicting UPDATE.
3. The runner waits a bounded probe interval. If contender completes before holder release, mark the coordination assertion failed.
4. Holder commits or rolls back as configured. Await contender with a bounded timeout.
5. If contender fails with a configured retryable database code, roll back the failed transaction before attempting a fresh transaction. Retry at most `max_retries` times.
6. Observer checks final row count and value independently. Cleanup is mandatory and cleanup failures invalidate evidence.

## Error semantics

- `observed_fail`: expected pending state, affected-row count, retry outcome, or final state assertion differs from observation.
- `insufficient_evidence`: connection failure, unexpected database error, query timeout, or cleanup failure.
- `observed_pass_limited`: all declared assertions passed for this one test case only.
- SQLSTATE `40001` (serialization failure) and `40P01` (deadlock) are PostgreSQL error examples; MySQL may expose numeric driver codes `1213` and `1205`. Only explicitly configured error codes are retryable.

## Evidence limits

- A pending query does not identify the internal lock wait event. Database-side lock tables and activity views are required for lock attribution.
- A single-row test cannot establish the absence of lost updates, phantoms, or anomalies under all transaction schedules.
- This harness does not simulate process crashes, committed-but-unacknowledged writes, or multi-node failover.
- `max_retries` must be bounded. Backoff and retry idempotency must be validated separately for non-database side effects.
