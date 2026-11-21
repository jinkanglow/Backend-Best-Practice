# Migration evidence gate

Control BE-05-04 requires an explicit rollback or forward-fix procedure and review before destructive changes. A pattern scanner can only raise candidates. It cannot prove whether a DDL statement is destructive in a given schema, whether a release is backward compatible, or whether an approval is authentic.

## Required independent evidence

- The exact migration artifact digest and its ordered execution plan.
- Database engine and version, schema snapshot and estimated affected rows.
- Lock and rewrite risk assessment using the actual engine and representative data.
- Old/new application compatibility check during the rollout window.
- Named reviewer approval from a protected external system, not a field in the test manifest.
- Recovery drill or documented forward-fix with observed recovery time.

## Gate behavior

A detected candidate returns `insufficient_evidence`; it must not be converted into a confirmed vulnerability or a passing migration merely because an operator sets `approved=true`. A clean pattern scan is only `pass_within_declared_scope`. SQL execution and protected approval integration remain separate work.
