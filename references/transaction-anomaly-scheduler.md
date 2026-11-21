# Transaction anomaly scheduler — executable contract

## Scope

Run ordered SQL steps on independent connections A and B, optionally observer. Each step has a stable ID, session, action and an explicit assertion. The scheduler never infers that an anomaly was reproduced from the scenario's `kind` or `expected.outcome` label. Evidence is only the executed steps, observed row hashes, error codes and explicit checks.

## Manifest fields

- `schema_version: "3.1"`; `engine: postgres | mysql`.
- `connection_env`: name of an environment variable containing a dedicated disposable database URL. Never include credentials in the manifest.
- `test_database_acknowledged: true`, `allow_mutation_on_test_database: true` and `BACKEND_GUARD_ALLOW_DB_TESTS=yes` are all required.
- `cases[].kind`: `lost_update`, `non_repeatable_read`, `phantom_read`, `serialization_failure`, `retry_recovery` are scenario *labels*, not independently verified classifications.
- `cases[].isolation`: `read_committed`, `repeatable_read`, `serializable`.
- `cases[].control_ids`: existing control IDs. Binding is not control certification.
- `cases[].steps`: ordered steps, each `{id, session: "a"|"b"|"observer", action: "begin"|"query"|"commit"|"rollback"|"reconnect"}`.
- `query` steps require SQL and optional positional `params`. `assert` supports `row_count`, `first_row`, `rows_sha256`; `expect_error` checks an exact driver error code, such as PostgreSQL `40001`.
- `cases[].expected.assertion_step` must reference an executed step with a check. `expected.outcome` is descriptive metadata.

## Transaction correctness acceptance

1. Lost update: seed a known row, execute two independent read-modify-write operations with a deliberately controlled interleaving, and verify the final value via a third connection. A single row read is not sufficient.
2. Non-repeatable read: read the same row twice in A while B commits an update between reads; assert both observed values and the selected isolation level.
3. Phantom read: execute the same predicate query twice in A while B commits a qualifying insert; compare exact result sets or counts.
4. Serialization failure: construct a conflicting concurrent schedule; assert the exact SQLSTATE, the transaction that aborted, and the durable final state.
5. Retry recovery: after an observed retriable failure, start a new transaction, rerun the whole business operation, and assert the durable invariant. Retrying only a failed SQL statement is insufficient.

## Safety and limitations

This v3.1 scheduler executes **sequentially awaited steps**. It can interleave open transactions but cannot orchestrate truly simultaneous blocking operations or guarantee deadlock/serialization conflicts. A step waiting for a lock can hang unless the database/user supplies statement and lock timeouts. It does not provision test data or isolate a database automatically. The SQL filter is a guardrail, not a SQL parser or a database permission boundary. Use least-privileged disposable databases and enforce external process timeouts. Reconnect simulates loss of a client connection; it is not a database server crash.

`observed_pass_limited` means configured assertions passed, not that the labeled anomaly was reproduced. `insufficient_evidence` means execution failed or the required assertion could not be completed. No real PostgreSQL/MySQL service verification is claimed until a separate integration run has executed against both engines.
