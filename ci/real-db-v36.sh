#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "${BACKEND_GUARD_INTEGRATION_OPT_IN:-}" == yes ]] || { echo 'Disposable DB opt-in required' >&2; exit 2; }
command -v docker >/dev/null || { echo 'Docker required; real DB tests not executed' >&2; exit 2; }
export BACKEND_GUARD_ALLOW_DB_TESTS=yes
export BACKEND_GUARD_PG_URL='postgresql://guard:guard_local_only@127.0.0.1:55432/guard_test'
export BACKEND_GUARD_MYSQL_URL='mysql://guard:guard_local_only@127.0.0.1:53306/guard_test'
mkdir -p artifacts/real-db-v36
cleanup(){ docker compose -f infra/compose.integration.yml down -v --remove-orphans || true; }
trap cleanup EXIT
docker compose -f infra/compose.integration.yml up -d --wait
docker compose -f infra/compose.integration.yml exec -T postgres psql -U guard -d guard_test -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS bga_v35 (id INT PRIMARY KEY, value INT NOT NULL)'
docker compose -f infra/compose.integration.yml exec -T mysql mysql -u guard -pguard_local_only guard_test -e 'CREATE TABLE IF NOT EXISTS bga_v35 (id INT PRIMARY KEY, value INT NOT NULL) ENGINE=InnoDB'
set +e
node bin/backend-guard.mjs anomaly-scenarios --manifest examples/anomaly-postgres-v36.json --output artifacts/real-db-v36/postgres.json > artifacts/real-db-v36/postgres.log 2>&1
pg_status=$?
node bin/backend-guard.mjs anomaly-scenarios --manifest examples/anomaly-mysql-v36.json --output artifacts/real-db-v36/mysql.json > artifacts/real-db-v36/mysql.log 2>&1
my_status=$?
set -e
printf '{"postgres_exit":%d,"mysql_exit":%d,"real_db_executed":true}\n' "$pg_status" "$my_status" > artifacts/real-db-v36/run-status.json
[[ "$pg_status" == 0 && "$my_status" == 0 ]] || { echo 'Real DB scenario failures; inspect artifacts/real-db-v36' >&2; exit 1; }
