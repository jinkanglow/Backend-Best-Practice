#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "${BACKEND_GUARD_INTEGRATION_OPT_IN:-}" == yes ]] || { echo 'Explicit disposable database opt-in required' >&2; exit 2; }
# Preserve existing five-case real database integration and its exit status.
bash ci/real-db-v36.sh
mkdir -p artifacts/real-db-v37
node -e "const fs=require('fs');const p='artifacts/real-db-v36/run-status.json';const x=JSON.parse(fs.readFileSync(p));if(!x.real_db_executed||x.postgres_exit!==0||x.mysql_exit!==0)process.exit(2);fs.writeFileSync('artifacts/real-db-v37/run-status.json',JSON.stringify({...x,schema_version:'3.7',source:'real-db-v36'},null,2)+'\\n')"
# CI runner must inject an independently controlled key; no fallback or test key.
if [[ -n "${BGA_CI_ATTESTATION_KEY:-}" && -n "${GITHUB_RUN_ID:-}" ]]; then
 node bin/evidence-attest-v37.mjs sign artifacts/real-db-v37/run-status.json artifacts/real-db-v37/run-status.attestation.json
 node bin/evidence-attest-v37.mjs verify artifacts/real-db-v37/run-status.json artifacts/real-db-v37/run-status.attestation.json
else
 echo 'Independent CI attestation unavailable: missing protected key/run ID' >&2
 exit 2
fi
