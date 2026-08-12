#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${PROJECT_DIR}/logs"
LOG_FILE="${LOG_DIR}/admin-deploy-health.log"
mkdir -p "$LOG_DIR"
exec >>"$LOG_FILE" 2>&1

printf '[%s] Restarting JOJ services after web deployment\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
bash "${PROJECT_DIR}/scripts/joj-cli.sh" restart

for attempt in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:8000/api/health >/dev/null; then
    printf '[%s] Health check passed after attempt %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$attempt"
    exit 0
  fi
  sleep 2
done

printf '[%s] Health check failed after PM2 restart\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
exit 1
