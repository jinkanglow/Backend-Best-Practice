# Evidence trust boundaries

- Each run includes a SHA-256 digest to detect accidental or unsophisticated modification. This is not independent verification.
- `assure-v2 --sign-key-env KEY_NAME` creates an HMAC-SHA256 signature over the execution payload. `verify-signature` checks that signature.
- HMAC provides integrity/authenticity **only if** the signing key is controlled by a separate trusted runner/verifier and inaccessible to the test author. If the author controls the key, it is self-attestation.
- HMAC does not prove that the runner was honest, that the database was isolated, or that assertions covered the full control.
- Production assurance requires a separately operated CI runner, restricted credentials, immutable evidence storage, and independent review of test specifications.
- Do not store database credentials or HMAC keys in manifests, reports or committed files.
