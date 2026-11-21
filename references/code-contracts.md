# Maintainable code and module boundaries

## Module contract
Each exported function declares input, output, errors, side effects and ownership. Name functions for the observable operation. Keep parsing/validation separate from persistence and transport. Do not introduce abstractions unless at least two actual call sites or a tested variation justify them.

## Error contract
Never swallow exceptions. At each boundary choose: recover with a tested fallback, translate into a typed domain error, or propagate with context. Preserve cause. Redact secrets. Never turn a database timeout into a successful business response.

## Testability
Inject clock, randomness, remote clients and database sessions at module boundaries. Assert outcomes rather than private implementation. Every bug fix requires a regression test; every permission check needs a denial case.

## Review rejection criteria
Reject hidden mutable global state, unbounded functions with unrelated side effects, ambiguous boolean parameters, implicit retries of non-idempotent writes, and unhandled rejected promises. These are review rules, not fully automated findings.
