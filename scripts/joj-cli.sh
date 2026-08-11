#!/usr/bin/env bash
set -euo pipefail

if [[ -r /etc/default/joj-game ]]; then
  # Contains installer-owned, non-secret service paths only.
  source /etc/default/joj-game
fi
PROJECT_DIR="${JOJ_PROJECT_DIR:-/opt/joj-game}"
CONFIG_FILE="${PROJECT_DIR}/ecosystem.config.cjs"
APP_USER="${JOJ_APP_USER:-joj}"
PM2_BIN="${JOJ_PM2_BIN:-/usr/local/bin/pm2}"

run_pm2() {
  if [[ "$(id -u)" -eq 0 ]]; then
    runuser -u "$APP_USER" -- env HOME="$(getent passwd "$APP_USER" | cut -d: -f6)" "$PM2_BIN" "$@"
  else
    "$PM2_BIN" "$@"
  fi
}

run_project_update() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run updates as root: sudo joj update" >&2
    exit 1
  fi
  exec bash "${PROJECT_DIR}/scripts/install-ubuntu.sh" --update --yes
}

usage() {
  cat <<'EOF'
Usage:
  joj start
  joj stop
  joj restart
  joj update
  joj status
  joj logs [server|web]
  joj health
  joj backup

Compatibility shortcut (if installed by install script):
  start joj
EOF
}

require_config() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "Config not found: $CONFIG_FILE" >&2
    exit 1
  fi
}

cmd="${1:-}"
arg2="${2:-}"

case "$cmd" in
  start)
    require_config
    cd "$PROJECT_DIR"
    run_pm2 start "$CONFIG_FILE" || run_pm2 restart "$CONFIG_FILE" --update-env
    ;;
  stop)
    run_pm2 stop joj-game-server joj-game-web
    ;;
  restart)
    require_config
    cd "$PROJECT_DIR"
    run_pm2 restart "$CONFIG_FILE" --update-env
    ;;
  update)
    require_config
    run_project_update
    ;;
  status)
    run_pm2 status
    ;;
  logs)
    case "$arg2" in
      server) run_pm2 logs joj-game-server ;;
      web) run_pm2 logs joj-game-web ;;
      *) run_pm2 logs ;;
    esac
    ;;
  health)
    curl http://127.0.0.1:8000/api/health
    ;;
  backup)
    if [[ "$(id -u)" -ne 0 ]]; then
      echo "Run backup as root: sudo joj backup" >&2
      exit 1
    fi
    JOJ_PROJECT_DIR="$PROJECT_DIR" \
      JOJ_BACKUP_DIR="${JOJ_BACKUP_DIR:-${PROJECT_DIR}/backup}" \
      JOJ_BACKUP_RETENTION_DAYS="${JOJ_BACKUP_RETENTION_DAYS:-14}" \
      "${PROJECT_DIR}/scripts/backup-production.sh"
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage
    exit 1
    ;;
esac
