# Architecture Regression Gate — Operational Contract

## Purpose
Prevent **new** strongly connected dependency components, without treating a clean cycle report as proof of architectural correctness.

## Inputs
- Baseline and current reports produced by the same scanner and comparable source scope.
- Resolved dependency edges (`from`, `to`) and unresolved edges.
- A nonnegative integer `max_new_cycles` budget (default zero).

## Decision
1. `fail` (exit 1): newly observed SCCs exceed the allowed budget.
2. `insufficient_evidence` (exit 2): analysis budget exhausted or unresolved dependencies when strict.
3. `pass_no_new_cycles` (exit 0): no new SCCs above budget on an observed graph. This is **not** a security or architecture compliance certificate.
4. `pass_with_incomplete_graph` (exit 0): only when the operator explicitly selects `--allow-partial`; never treat this as a production proof.

## Required reviewer checks
- Compare report scope and commit provenance before accepting a baseline. The CLI does **not** authenticate baseline provenance.
- Reject baselines from a different repository or tsconfig without manual review.
- Track new unresolved imports separately; a disappearing graph edge may be an analyzer regression, not an architectural improvement.
- For a new SCC, inspect the complete module chain and determine which dependency to invert, extract or remove.
- Never suppress a cycle without an owner, reason, expiry and regression test.

## Example
`backend-guard architecture-baseline --report current.json --baseline baseline.json --output architecture-diff.json`
