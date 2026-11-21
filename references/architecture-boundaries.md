# Architecture and boundaries

## Normative engineering controls

### 1. Separate transport DTOs from application commands and domain state

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 2. Domain modules must not import framework, database or cloud SDK modules

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 3. Define module ownership, public APIs and permitted dependency directions

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 4. Cross-module writes require explicit transaction or messaging contract

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 5. Avoid premature microservice extraction; document coupling and deployment cost

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.


## Concrete execution contract

Read `references/architecture-fitness.md` for executable invariants, negative tests, decision boundaries and proof requirements. The controls above are normative requirements, not proof that a detector exists.
