# Database invariants, transactions and migration

## Write path
State the invariant in one sentence. Prefer a unique/check/foreign-key constraint when expressible. Place related writes in one transaction; never perform an irreversible external call while relying on DB rollback to undo it.

## Concurrent update test
Seed a single row; start two transactions with a barrier; perform conflicting operations; commit both; assert the invariant. Document actual isolation level and lock/wait behavior. An isolated happy-path transaction test does not prove concurrency safety.

## Migration protocol
Expand schema without breaking old readers/writers → deploy compatible code → backfill in bounded, resumable batches → verify row counts and checksums → contract only after old deployments are gone. Check lock duration, index strategy, rollback plan and replication lag on the actual database engine.

## Failures
Inject failure before commit, after commit before acknowledgment, during backfill and after partial retry. Verify no duplicate effects and a deterministic recovery route.
