# HTTP and API contracts

## Normative engineering controls

### 1. Validate content type, size, shape and semantic constraints before side effects

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 2. Use consistent errors with stable machine-readable codes and correlation identifiers

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 3. Document authentication, authorization, pagination, limits and retry semantics

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 4. Support conditional requests and optimistic concurrency where appropriate

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 5. Version incompatible public contract changes and test consumer compatibility

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.


## Concrete execution contract

Read `references/api-runtime-contracts.md` for executable invariants, negative tests, decision boundaries and proof requirements. The controls above are normative requirements, not proof that a detector exists.
