#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${BACKEND_GUARD_INTEGRATION_OPT_IN:-}" != yes ]]; then echo 'Set BACKEND_GUARD_INTEGRATION_OPT_IN=yes' >&2; exit 2; fi
command -v docker >/dev/null || { echo 'Docker required' >&2; exit 2; }
export BACKEND_GUARD_ALLOW_DB_TESTS=yes
export BACKEND_GUARD_PG_URL='postgresql://guard:guard_local_only@127.0.0.1:55432/guard_test'
export BACKEND_GUARD_MYSQL_URL='mysql://guard:guard_local_only@127.0.0.1:53306/guard_test'
cleanup(){ docker compose -f infra/compose.integration.yml down -v --remove-orphans; }
trap cleanup EXIT
docker compose -f infra/compose.integration.yml up -d --wait
docker compose -f infra/compose.integration.yml exec -T postgres psql -U guard -d guard_test -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS bga_v32 (id INT PRIMARY KEY, value INT NOT NULL)'
docker compose -f infra/compose.integration.yml exec -T mysql mysql -u guard -pguard_local_only guard_test -e 'CREATE TABLE IF NOT EXISTS bga_v32 (id INT PRIMARY KEY, value INT NOT NULL) ENGINE=InnoDB'
node bin/backend-guard.mjs parallel-transaction --manifest examples/parallel-postgres-v32.json --output /tmp/bga-pg-v32.json
node bin/backend-guard.mjs parallel-transaction --manifest examples/parallel-mysql-v32.json --output /tmp/bga-mysql-v32.json
