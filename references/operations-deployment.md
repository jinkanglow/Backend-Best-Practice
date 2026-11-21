# Deployment and operations

## Normative engineering controls

### 1. Use reproducible builds, pinned dependencies and provenance checks

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 2. Validate configuration and required secrets at startup

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 3. Deploy with health checks, canaries and rollback criteria

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 4. Protect production changes with least privilege and approvals

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 5. Test backup restore and document RPO/RTO evidence

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.


## Concrete execution contract

Read `references/operational-reliability.md` for executable invariants, negative tests, decision boundaries and proof requirements. The controls above are normative requirements, not proof that a detector exists.
