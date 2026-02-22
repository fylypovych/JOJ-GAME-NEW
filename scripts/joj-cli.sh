#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${JOJ_PROJECT_DIR:-/opt/joj-game}"
CONFIG_FILE="${PROJECT_DIR}/ecosystem.config.cjs"

usage() {
  cat <<'EOF'
Usage:
  joj start
  joj stop
  joj restart
  joj status
  joj logs [server|web]
  joj health

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
    pm2 start "$CONFIG_FILE" || pm2 restart "$CONFIG_FILE" --update-env
    ;;
  stop)
    pm2 stop joj-game-server joj-game-web
    ;;
  restart)
    require_config
    cd "$PROJECT_DIR"
    pm2 restart "$CONFIG_FILE" --update-env
    ;;
  status)
    pm2 status
    ;;
  logs)
    case "$arg2" in
      server) pm2 logs joj-game-server ;;
      web) pm2 logs joj-game-web ;;
      *) pm2 logs ;;
    esac
    ;;
  health)
    curl http://127.0.0.1:8000/api/health
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
