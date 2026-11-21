# v4.0 Real-DB Acceptance and Cross-Run Regression

## Non-negotiable acceptance contract

A successful `npm test` run verifies JavaScript harness behavior, not PostgreSQL or MySQL correctness. A real-database acceptance claim requires the CI artifact containing two independently provisioned database runs, both five-case manifests, audited event-chain reports, independent final-state observations, database server version collected with SQL, container image config digest from the running container, comparison results and separately attested evidence. A database tag alone is not a digest.

The comparison is **outcome-equivalence**, not deterministic replay of lock acquisition. A different deadlock victim may be acceptable to the underlying scenario only if its manifest explicitly accepts both victims and the final state and error classification are verified. No generic exemption may silently turn a failed scenario green.

## Quality gate

1. Use disposable DBs only; explicit opt-in and rollback/cleanup required.
2. Execute all five cases on PostgreSQL and MySQL, preserving each engine's error SQLSTATE and failure phase.
3. Preserve raw events, independently observed final state, and evidence chain. Fail closed on absent evidence.
4. Repeat in a newly provisioned database and compare control IDs, outcome statuses, evidence completeness, server version and container image config digest.
5. Sign only after the comparison passes, in a separate CI job with protected key.
6. Store failed logs and reports as artifacts; do not claim a passing baseline when the runner aborts.

## Important limits

The v4.0 baseline checks observed outcome stability across two runs. It does not prove the original scenario manifest correctly detects all five anomalies, and it cannot prove production transaction safety. CI workflow configuration is not evidence that CI has run. If Docker is absent, report `not_executed` rather than `pass`. PostgreSQL serialization errors may arise at statement or COMMIT; MySQL deadlock victim selection is not stable. Both require engine-specific scenario assertions.
