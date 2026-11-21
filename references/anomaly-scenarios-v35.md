# v3.5 — Transaction anomaly scenario execution contract

## Execution

`backend-guard anomaly-scenarios --manifest examples/anomaly-postgres-v35.json --output evidence.json`

Requires `BACKEND_GUARD_ALLOW_DB_TESTS=yes`, the manifest's connection URL environment variable, and an isolated disposable database. All five cases use explicit setup and cleanup, separate A/B sessions, and an independent observer session for final-state verification. `parallel` groups use concurrent promises but do not guarantee database lock acquisition order. A database error with an unexpected code is `insufficient_evidence`; a mismatched expected value or affected-row assertion is `observed_fail`.

## Five distinct cases

- **lost_update**: two transactions read the same original value, then each writes an absolute value derived from the stale read. Final value demonstrates a lost increment in this intentionally unsafe pattern. This is a demonstration of an anomaly, not a proof that the database violates its documented isolation guarantees.
- **non_repeatable_read**: A reads row, B commits update, A reads again under READ COMMITTED; both observed snapshots must be asserted.
- **phantom_read**: A reads predicate, B inserts matching row and commits, A re-reads predicate; both result sets must be asserted.
- **serialization_failure**: PostgreSQL SERIALIZABLE read/write dependency cycle is expected to abort one transaction with SQLSTATE 40001. MySQL SERIALIZABLE instead uses locking reads and may report a deadlock (ER_LOCK_DEADLOCK), with victim selection not guaranteed; the example is **experimental**, and a mismatch is not evidence of engine defect.
- **retry_recovery**: contender hits a configured lock wait timeout, explicitly rolls back, and starts a fresh transaction after the holder commits. Independent observer checks final state. This verifies transaction retry, not process-crash recovery.

## Evidence and limits

Each scenario records Control IDs, the exact manifest SHA-256, hashed SQL text, step outcomes, database error codes, independent final rows, cleanup outcome, and one of `observed_pass_limited`, `observed_fail`, or `insufficient_evidence`. A `pass` means **the expected anomaly was observed**, not that the application prevents it. The manifest's Control ID is a traceability link, not a certification of compliance.

The scenario runner does not yet record database-internal lock graph samples for each anomaly. Lock wait attribution is available in the separate v3.4 conflict-recovery harness. No actual PostgreSQL/MySQL integration run is claimed unless the Docker CI job executes successfully and retains its evidence output. Isolation and SQLSTATE behavior may differ by engine and version.
