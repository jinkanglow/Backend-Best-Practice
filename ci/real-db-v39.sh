#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "${BACKEND_GUARD_INTEGRATION_OPT_IN:-}" == yes ]] || { echo 'Explicit disposable DB opt-in required' >&2; exit 2; }
command -v docker >/dev/null || { echo 'Docker required: no real DB test executed' >&2; exit 2; }
export BACKEND_GUARD_ALLOW_DB_TESTS=yes
export BACKEND_GUARD_PG_URL='postgresql://guard:guard_local_only@127.0.0.1:55432/guard_test'
export BACKEND_GUARD_MYSQL_URL='mysql://guard:guard_local_only@127.0.0.1:53306/guard_test'
mkdir -p artifacts/real-db-v39
cleanup(){ docker compose -f infra/compose.integration.yml down -v --remove-orphans || true; }
trap cleanup EXIT
docker compose -f infra/compose.integration.yml up -d --wait
docker compose -f infra/compose.integration.yml exec -T postgres psql -U guard -d guard_test -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS bga_v35 (id INT PRIMARY KEY, value INT NOT NULL)'
docker compose -f infra/compose.integration.yml exec -T mysql mysql -u guard -pguard_local_only guard_test -e 'CREATE TABLE IF NOT EXISTS bga_v35 (id INT PRIMARY KEY, value INT NOT NULL) ENGINE=InnoDB'
if [[ "${BGA_V40_PROVENANCE_DIR:-}" != "" ]]; then
  mkdir -p "$BGA_V40_PROVENANCE_DIR"
  for engine in postgres mysql; do
    if [[ "$engine" == postgres ]]; then
      version=$(docker compose -f infra/compose.integration.yml exec -T postgres psql -U guard -d guard_test -Atqc 'SHOW server_version')
      image_id=$(docker inspect --format '{{.Image}}' "$(docker compose -f infra/compose.integration.yml ps -q postgres)")
    else
      version=$(docker compose -f infra/compose.integration.yml exec -T mysql mysql -N -s -u guard -pguard_local_only guard_test -e 'SELECT VERSION()' 2>/dev/null)
      image_id=$(docker inspect --format '{{.Image}}' "$(docker compose -f infra/compose.integration.yml ps -q mysql)")
    fi
    BGA_PROBE_ENGINE="$engine" BGA_PROBE_VERSION="$version" BGA_PROBE_IMAGE="$image_id" BGA_PROBE_OUTPUT="$BGA_V40_PROVENANCE_DIR/environment-${engine}.json" node --input-type=module -e 'import{writeFileSync}from"node:fs";writeFileSync(process.env.BGA_PROBE_OUTPUT,JSON.stringify({engine:process.env.BGA_PROBE_ENGINE,server_version:process.env.BGA_PROBE_VERSION,image_digest:process.env.BGA_PROBE_IMAGE,source:"live_database_probe",image_digest_kind:"container_image_config"},null,2)+"\n")'
  done
fi
result=0
for engine in postgres mysql; do
  manifest="examples/anomaly-${engine}-v39.json"
  report="artifacts/real-db-v39/${engine}.json"
  if ! node bin/backend-guard.mjs anomaly-scenarios --manifest "$manifest" --output "$report" > "artifacts/real-db-v39/${engine}.log" 2>&1; then result=1; fi
  if [[ -f "$report" ]]; then
    if ! node bin/backend-guard.mjs scenario-audit --manifest "$manifest" --report "$report" --output "artifacts/real-db-v39/${engine}.audit.json"; then result=1; fi
  else result=1; fi
done
printf '{"schema_version":"3.9","real_db_executed":true,"exit_code":%d}\n' "$result" > artifacts/real-db-v39/run-status.json
exit "$result"
