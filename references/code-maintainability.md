# Code maintainability

## Normative engineering controls

### 1. Use names that reveal domain meaning and eliminate misleading abstractions

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 2. Keep functions cohesive; avoid arbitrary line-count limits

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 3. Separate commands from queries where it clarifies side effects

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 4. Keep error handling explicit and preserve cause/context

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 5. Refactor behind behavioral tests; avoid speculative abstractions

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.


## Concrete execution contract

Read `references/code-contracts.md` for executable invariants, negative tests, decision boundaries and proof requirements. The controls above are normative requirements, not proof that a detector exists.
