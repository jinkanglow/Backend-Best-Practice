# Real database evidence contract — v3.6

A successful scheduler step is not evidence of a lock conflict. Lock attribution requires independently observed waiter/blocker session IDs from the database server.

## Lock evidence

- `require_session_identity: true` retrieves PostgreSQL `pg_backend_pid()` or MySQL `CONNECTION_ID()` for transaction A and B.
- `lock_probe` requires `session`, `waiter`, and `blocker` with distinct A/B roles; it queries PostgreSQL `pg_blocking_pids` or MySQL `performance_schema.data_lock_waits` through an independent observer.
- A missing or inaccessible lock observation returns `insufficient_evidence`, not pass. A point-in-time probe may miss a short-lived wait; add synchronization before relying on it.
- A probe issued as a sequential step cannot execute while the runner is blocked awaiting a conflicting query. Concurrent probes require a future asynchronous scheduler protocol. **The shipped five example manifests do not yet invoke `lock_probe` and cannot claim database-confirmed lock attribution.**

## Error location and nondeterminism

- Expected SQL error codes may be a list, for example `['40001','40P01']`, but only codes explicitly specified in a step are accepted.
- `commit` and `rollback` steps can specify `expect_error`. This allows PostgreSQL serialization failures at COMMIT to be represented without misclassifying the error as unexpected.
- MySQL deadlock victim selection is not deterministic. The current scenario runner does not yet accept a symmetric either-victim assertion; a fixed-victim manifest can fail on a valid alternative outcome. Treat this as incomplete, not verified portability.
- Retry success is not proof of idempotency or crash recovery; a separate final-state assertion is required.

## CI artifacts

`npm run test:real-db:v36` requires Docker and `BACKEND_GUARD_INTEGRATION_OPT_IN=yes`. The script starts disposable PostgreSQL and MySQL, runs both scenario manifests, and saves each JSON report and stdout/stderr log separately under `artifacts/real-db-v36/`. A run-status file records both exit codes. CI uploads this directory even when tests fail.

CI workflow presence does not establish that a real database run has happened. Preserve job URL, commit SHA, engine versions, container image digests, timestamps and artifact checksums for independently verifiable provenance in a future version. Reports are not cryptographically attested.
