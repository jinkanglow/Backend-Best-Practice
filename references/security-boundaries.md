# Security and secrets

## Normative engineering controls

### 1. Threat-model external inputs, deserialization, SSRF and injection sinks

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 2. Use parameterized queries; avoid dynamic SQL identifiers without allowlists

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 3. Protect credentials with secret management and least-privilege access

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 4. Set security headers, CORS, CSRF and cookie controls as applicable

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.

### 5. Redact sensitive values in logs, traces, errors and diagnostics

**Evidence required:** code location or config artifact, applicability reason, positive and negative test where relevant, execution command, observed result.

**Failure mode:** describe the concrete incorrect behavior, its impact and the boundary crossed.

**Decision:** PASS only with suitable executed evidence; FAIL on observed violation; UNKNOWN if unavailable; NOT_APPLICABLE only with a documented reason.


## Concrete execution contract

Read `references/security-authorization.md` for executable invariants, negative tests, decision boundaries and proof requirements. The controls above are normative requirements, not proof that a detector exists.
