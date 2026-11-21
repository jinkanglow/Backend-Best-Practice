# Change execution protocol

## Entry criteria
Record the user-visible behavior, owner, affected endpoint/event, data stores, consumers, compatibility window and failure budget. If any of these are unknown, inspect the repository; never invent them.

## Patch procedure
1. Locate the actual entrypoint and all callers, including scheduled jobs and consumers.
2. Write a failing test for the reported defect, then a negative test for the nearest boundary.
3. Record the invariant and its authoritative enforcement point (database constraint, authorization policy, service transaction or API validator).
4. Make the smallest change preserving existing public contracts.
5. Execute typecheck, targeted tests, integration tests and migration dry-run when relevant.
6. Report exact command, exit code, observation and unsupported assumptions.

## Stop conditions
Stop before destructive migrations, irreversible messages, live credential access, production mutations, unknown ownership or unreviewed privilege expansion.

## Completion artifact
Return `changed_files`, `behavioral_contract`, `invariants`, `test_commands`, `observations`, `rollback`, `residual_risks` and `unverified`.
