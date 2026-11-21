# Security boundary assurance

## Trust boundaries
Treat headers, JWT claims, URLs, filenames, object keys, webhooks and queue payloads as untrusted until verified at the consuming boundary. Validate signature, audience, issuer, expiry and key rotation according to configured identity provider.

## Resource authorization
Every read/write resolves the resource tenant and owner from trusted storage, then checks permission for the authenticated principal. Test cross-tenant identifiers, role downgrade, missing claims, revoked sessions and direct object access. Do not infer authorization from route middleware alone.

## External request restrictions
Validate scheme and allowlist, resolve and reject private/loopback/link-local destinations where inappropriate, protect redirects and DNS rebinding, and set timeouts/response size limits. These checks require runtime/network-level tests; static hostname checks are not sufficient.

## Sensitive evidence
Never include tokens, raw connection strings or personal data in logs or attestation. Use scoped test credentials and redact before hashing or exporting results.
