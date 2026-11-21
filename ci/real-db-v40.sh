#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "${BACKEND_GUARD_INTEGRATION_OPT_IN:-}" == yes ]] || { echo 'Explicit disposable DB opt-in required' >&2; exit 2; }
command -v docker >/dev/null || { echo 'Docker unavailable: no database evidence produced' >&2; exit 2; }
command -v node >/dev/null || exit 2
mkdir -p artifacts/real-db-v40
# Preserve artifacts from both runs. The v3.9 script provisions and tears down fresh DBs per run.
for run in 1 2; do
  mkdir -p "artifacts/real-db-v40/run-${run}"
  if BGA_V40_PROVENANCE_DIR="$(pwd)/artifacts/real-db-v40/run-${run}" bash ci/real-db-v39.sh >"artifacts/real-db-v40/run-${run}/runner.log" 2>&1; then
    cp artifacts/real-db-v39/{postgres,mysql}.json "artifacts/real-db-v40/run-${run}/"
    cp artifacts/real-db-v39/{postgres,mysql}.audit.json "artifacts/real-db-v40/run-${run}/"
  else
    cp -a artifacts/real-db-v39/. "artifacts/real-db-v40/run-${run}/" 2>/dev/null || true
    echo "Real DB run ${run} failed; evidence preserved, no passing baseline created" >&2
    exit 1
  fi
done
# DB server versions are collected by live database queries during execution in a separate
# integration runner. No version/digest is fabricated from configuration or image tags.
# The baseline gate intentionally refuses to run without live environment provenance.
[[ -f artifacts/real-db-v40/run-1/environment-postgres.json && -f artifacts/real-db-v40/run-1/environment-mysql.json ]] || {
  echo 'Missing live database environment provenance; cannot certify cross-run baseline' >&2; exit 2;
}
for engine in postgres mysql; do
  manifest="examples/anomaly-${engine}-v39.json"
  env="artifacts/real-db-v40/run-1/environment-${engine}.json"
  env2="artifacts/real-db-v40/run-2/environment-${engine}.json"
  node bin/evidence-regression-v40.mjs create "$manifest" "artifacts/real-db-v40/run-1/${engine}.json" "$env" "artifacts/real-db-v40/${engine}.baseline.json"
  node bin/evidence-regression-v40.mjs compare "$manifest" "artifacts/real-db-v40/run-2/${engine}.json" "$env2" "artifacts/real-db-v40/${engine}.baseline.json" "artifacts/real-db-v40/${engine}.comparison.json"
done
