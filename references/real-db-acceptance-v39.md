# v3.9 Real Database Acceptance Contract

## Control ID → Scenario → Execution → Evidence → Gate

Each of the five scenario kinds must have a distinct manifest case, nonempty Control IDs from the existing catalog, an execution event chain, an independent final-state assertion, and successful cleanup. A passing test proves only the scheduled observations. It does not prove application-level prevention of the anomaly.

## Failure taxonomy

- `FINAL_STATE_MISMATCH`: independent observer read contradicts exact expected rows; fail.
- `EXPECTED_ERROR_MISSING`: expected database error did not occur; fail.
- `UNEXPECTED_DATABASE_ERROR`: SQLSTATE or driver code did not match the expected error; insufficient evidence.
- `EXECUTION_ERROR`: driver, connection, or scheduling failure; insufficient evidence.
- `LOCK_PROBE_UNAVAILABLE`: server-side lock evidence unavailable; insufficient evidence.
- `LOCK_CONFLICT_NOT_VERIFIED`: coordinated lock sampling did not meet its evidence threshold; insufficient evidence.
- `FINAL_STATE_NOT_OBSERVED`: no independent observer result; insufficient evidence.
- `CLEANUP_INCOMPLETE`: fixture state could not be restored; insufficient evidence.

A verified chain establishes integrity of recorded events only. It does not establish authenticity of the database, independence of the executor, or that a lock was held unless server-side observation explicitly supports that claim.

## Replay semantics

`scenario-replay` executes the same five-case manifest against a separately configured disposable database and compares observed case status, final-state observation, lock-wait observation, and finding codes. Parallel SQL scheduling and deadlock-victim selection are nondeterministic; matching results do not prove identical interleaving. Replay plans record operation order, parallel boundaries, SQL hashes, fixture hashes, and Control IDs. Never treat the plan as a transcript of actual database lock acquisition.

## Real DB requirements

Use the opt-in Docker integration job, persist original report, audit, runner logs, and run status even on failure. Verify PostgreSQL and MySQL separately; do not infer one engine's behavior from the other. CI attestation runs in a separate protected job after validating the five-case audit and hash chains. HMAC integrity is conditional on independent secret custody. Database integration is **not validated** unless the job actually executes and artifacts are inspected.

## Explicit limits

No automatic proof of crash recovery, durable WAL/binlog persistence, deterministic deadlock victim, production readiness, or comprehensive transaction isolation. Tests intentionally reproducing lost updates demonstrate a vulnerability mechanism rather than a prevention control.
