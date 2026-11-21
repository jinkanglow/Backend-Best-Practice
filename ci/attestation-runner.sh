#!/usr/bin/env bash
set -euo pipefail
# Run only on a protected runner. The private key must be injected by a secret manager.
: "${BACKEND_GUARD_ED25519_PRIVATE_KEY:?Missing protected runner key}"
: "${BACKEND_GUARD_RUNNER_ID:?Missing runner ID}"
: "${BACKEND_GUARD_RUN_ID:?Missing run ID}"
: "${BACKEND_GUARD_IMAGE_DIGEST:?Missing pinned image digest}"
node bin/backend-guard.mjs attest-v21 --input integration-result.json --key-env BACKEND_GUARD_ED25519_PRIVATE_KEY --runner-id "$BACKEND_GUARD_RUNNER_ID" --run-id "$BACKEND_GUARD_RUN_ID" --image-digest "$BACKEND_GUARD_IMAGE_DIGEST" --output attestation.json
