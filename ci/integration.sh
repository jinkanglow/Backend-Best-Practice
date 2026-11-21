#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${BACKEND_GUARD_INTEGRATION_OPT_IN:-}" != "yes" ]]; then echo 'Set BACKEND_GUARD_INTEGRATION_OPT_IN=yes to run destructive local DB tests' >&2; exit 2; fi
command -v docker >/dev/null || { echo 'Docker required' >&2; exit 2; }
export BACKEND_GUARD_ALLOW_DB_TESTS=yes
export BACKEND_GUARD_PG_URL='postgresql://guard:guard_local_only@127.0.0.1:55432/guard_test'
export BACKEND_GUARD_MYSQL_URL='mysql://guard:guard_local_only@127.0.0.1:53306/guard_test'
docker compose -f infra/compose.integration.yml up -d --wait
cleanup(){ docker compose -f infra/compose.integration.yml down -v --remove-orphans; }
trap cleanup EXIT
node bin/backend-guard.mjs assure-v2 --root . --manifest examples/integration-v21.json --output integration-result.json
