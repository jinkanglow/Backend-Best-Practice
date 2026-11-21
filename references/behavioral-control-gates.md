# Behavioral Control Gates — Exact Acceptance Contract

## Authorization (BE-03-02)
Provision an isolated resource owned by identity A. Verify A can access it. Verify B (same tenant, different owner) and C (different tenant) are denied where policy requires. Test GET and every mutating verb separately. Verify unauthorized writes do not change persistent state. Require explicit token environment variables; never put credentials in manifests or reports.

## Idempotency (BE-06-02)
Generate a unique operation ID and idempotency key per test run. Capture an independent state baseline. Submit duplicate requests concurrently. Assert exactly one committed side effect and a documented response policy. Then test a retry after the first response is lost, a restart between commit and acknowledgment, and a repeated key with a different payload. Record transaction boundaries and database uniqueness constraints.

## Current implemented scope
`behavioral-gate` evaluates the existing two-identity authorization test and single-process concurrent idempotency probe. It does NOT provision isolated resources, verify unauthorized mutations, terminate a process, inject network faults, or establish exactly-once semantics across distributed components. These must remain UNKNOWN unless separate executed tests supply evidence.

## Gate outcomes
- `fail` (exit 1): any observed test failure.
- `insufficient_evidence` (exit 2): required Control ID lacks a test, when strict.
- `observed_pass_limited_scope` (exit 0): supplied scenarios passed, not full control compliance.

Evidence must be bound to the exact manifest hash. Local hashes detect accidental changes but are not independent attestations. A protected runner and independently managed signing key are required for stronger provenance.
