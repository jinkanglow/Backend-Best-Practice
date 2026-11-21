# HTTP and API invariants

## Request pipeline
Authenticate identity → authorize action on resolved resource → validate schema and limits → execute use case → map typed errors → emit sanitized telemetry. Authentication without resource-level authorization is insufficient.

## Contract matrix
- Missing credentials: 401 when authentication is required.
- Authenticated but forbidden: 403, or a deliberate 404 non-disclosure policy documented per resource.
- Invalid input: deterministic 4xx response, field errors without leaking internal details.
- Duplicate write: same idempotency key and same payload returns recorded outcome; same key and different payload must be rejected per API contract.
- Partial downstream outage: bounded deadline and explicit failure; no success response if required write was not committed.

## Executable verification
Use loopback integration tests with actual framework boot, seeded identities, owned and foreign resources, malformed payloads, oversized bodies, timeouts and repeated writes. Assert persistent state, not only HTTP status.
