#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# JOJ Game production installer for Ubuntu Server 24.04 LTS.
# Typical first run:
#   git clone <repository> /opt/joj-game
#   sudo bash /opt/joj-game/scripts/install-ubuntu.sh

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE=""
NON_INTERACTIVE=0
ASSUME_YES=0
INSTALL_MODE="install"
LOG_FILE="/var/log/joj-installer.log"

ENV_APP_USER_OVERRIDE="${APP_USER:-}"
ENV_PROJECT_DIR_OVERRIDE="${PROJECT_DIR:-}"

APP_USER="${APP_USER:-joj}"
PROJECT_DIR="${PROJECT_DIR:-/opt/joj-game}"
DOMAIN="${DOMAIN:-}"
DOMAIN_WWW="${DOMAIN_WWW:-}"
ACME_EMAIL="${ACME_EMAIL:-}"
DB_MODE="${DB_MODE:-local}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-joj_game}"
DB_USER="${DB_USER:-joj_user}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_PASSWORD_FILE="${DB_PASSWORD_FILE:-}"
DB_SSLMODE="${DB_SSLMODE:-disable}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_DISPLAY_NAME="${ADMIN_DISPLAY_NAME:-Administrator}"
ADMIN_LANG="${ADMIN_LANG:-uk}"
ADMIN_PASSWORD_FILE="${ADMIN_PASSWORD_FILE:-}"
SKIP_ADMIN="${SKIP_ADMIN:-0}"
ENABLE_UFW="${ENABLE_UFW:-1}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

usage() {
  cat <<'EOF'
Usage: sudo bash scripts/install-ubuntu.sh [options]

Options:
  --update            Update an existing installation without reprovisioning it
  --config FILE       Load KEY=VALUE settings from a root-owned file
  --non-interactive   Fail instead of prompting for missing values
  --yes               Accept the final installation confirmation
  -h, --help          Show this help

Supported config keys:
  APP_USER PROJECT_DIR DOMAIN DOMAIN_WWW ACME_EMAIL
  DB_MODE DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD DB_PASSWORD_FILE DB_SSLMODE
  ADMIN_USERNAME ADMIN_EMAIL ADMIN_DISPLAY_NAME ADMIN_LANG ADMIN_PASSWORD_FILE
  SKIP_ADMIN ENABLE_UFW BACKUP_RETENTION_DAYS

For unattended installs, put the admin password in a chmod-600 file and set
ADMIN_PASSWORD_FILE. Avoid storing ADMIN passwords directly in the config.

Update mode reads the existing .env and /etc/default/joj-game, creates a backup,
pulls the current Git branch, installs dependencies, runs migrations/tests/build,
restarts PM2 and performs a health check. It does not reconfigure PostgreSQL,
Caddy, UFW, the administrator, TLS, or backup timers.
EOF
}

log() { printf '[joj-install] %s\n' "$*"; }
die() { printf '[joj-install] ERROR: %s\n' "$*" >&2; exit 1; }

on_error() {
  local exit_code=$?
  printf '[joj-install] Failed at line %s (exit %s). See %s\n' "${BASH_LINENO[0]:-unknown}" "$exit_code" "$LOG_FILE" >&2
  exit "$exit_code"
}
trap on_error ERR

allowed_config_key() {
  case "$1" in
    APP_USER|PROJECT_DIR|DOMAIN|DOMAIN_WWW|ACME_EMAIL|DB_MODE|DB_HOST|DB_PORT|DB_NAME|DB_USER|DB_PASSWORD|DB_PASSWORD_FILE|DB_SSLMODE|ADMIN_USERNAME|ADMIN_EMAIL|ADMIN_DISPLAY_NAME|ADMIN_LANG|ADMIN_PASSWORD_FILE|SKIP_ADMIN|ENABLE_UFW|BACKUP_RETENTION_DAYS) return 0 ;;
    *) return 1 ;;
  esac
}

load_config() {
  local file="$1" raw key value
  [[ -r "$file" ]] || die "Cannot read config file: $file"
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    raw="${raw%$'\r'}"
    [[ -z "${raw//[[:space:]]/}" || "$raw" =~ ^[[:space:]]*# ]] && continue
    [[ "$raw" == *=* ]] || die "Invalid config line (expected KEY=VALUE): $raw"
    key="${raw%%=*}"; key="${key//[[:space:]]/}"
    value="${raw#*=}"
    value="${value#\"}"; value="${value%\"}"
    value="${value#\'}"; value="${value%\'}"
    allowed_config_key "$key" || die "Unsupported config key: $key"
    printf -v "$key" '%s' "$value"
  done <"$file"
}

while (($#)); do
  case "$1" in
    --update) INSTALL_MODE="update"; shift ;;
    --config) [[ $# -ge 2 ]] || die '--config requires a file'; CONFIG_FILE="$2"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

load_installed_runtime_defaults() {
  local runtime_file="/etc/default/joj-game" raw key value
  [[ -r "$runtime_file" ]] || return 0
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    raw="${raw%$'\r'}"
    [[ -z "${raw//[[:space:]]/}" || "$raw" =~ ^[[:space:]]*# || "$raw" != *=* ]] && continue
    key="${raw%%=*}"
    value="${raw#*=}"
    case "$key" in
      JOJ_PROJECT_DIR) PROJECT_DIR="$value" ;;
      JOJ_APP_USER) APP_USER="$value" ;;
      JOJ_PM2_BIN) PM2_BIN="$value" ;;
      JOJ_BACKUP_RETENTION_DAYS) BACKUP_RETENTION_DAYS="$value" ;;
    esac
  done <"$runtime_file"
}

if [[ "$INSTALL_MODE" == update ]]; then
  load_installed_runtime_defaults
  [[ -z "$ENV_APP_USER_OVERRIDE" ]] || APP_USER="$ENV_APP_USER_OVERRIDE"
  [[ -z "$ENV_PROJECT_DIR_OVERRIDE" ]] || PROJECT_DIR="$ENV_PROJECT_DIR_OVERRIDE"
fi
[[ -z "$CONFIG_FILE" ]] || load_config "$CONFIG_FILE"

prompt_value() {
  local variable="$1" label="$2" default_value="${3:-}" current_value effective_default
  current_value="${!variable:-}"
  if (( NON_INTERACTIVE )); then
    effective_default="${current_value:-$default_value}"
    [[ -n "$effective_default" ]] || die "$variable is required in non-interactive mode"
    printf -v "$variable" '%s' "$effective_default"
    return
  fi
  effective_default="${current_value:-$default_value}"
  read -r -p "$label${effective_default:+ [$effective_default]}: " current_value
  printf -v "$variable" '%s' "${current_value:-$effective_default}"
}

prompt_optional() {
  local variable="$1" label="$2" current_value
  current_value="${!variable:-}"
  [[ -n "$current_value" || "$NON_INTERACTIVE" -eq 1 ]] && return
  read -r -p "$label (optional): " current_value
  printf -v "$variable" '%s' "$current_value"
}

read_admin_password() {
  local first second
  if [[ "$SKIP_ADMIN" == 1 ]]; then ADMIN_PASSWORD=''; return; fi
  if [[ -n "$ADMIN_PASSWORD_FILE" ]]; then
    [[ -f "$ADMIN_PASSWORD_FILE" && -r "$ADMIN_PASSWORD_FILE" ]] || die "Cannot read ADMIN_PASSWORD_FILE"
    ADMIN_PASSWORD="$(<"$ADMIN_PASSWORD_FILE")"
    ADMIN_PASSWORD="${ADMIN_PASSWORD%$'\n'}"
  elif (( NON_INTERACTIVE )); then
    die 'ADMIN_PASSWORD_FILE is required in non-interactive mode unless SKIP_ADMIN=1'
  else
    read -r -s -p 'Administrator password (minimum 8 characters): ' first; printf '\n'
    read -r -s -p 'Repeat administrator password: ' second; printf '\n'
    [[ "$first" == "$second" ]] || die 'Administrator passwords do not match'
    ADMIN_PASSWORD="$first"
  fi
  (( ${#ADMIN_PASSWORD} >= 8 )) || die 'Administrator password must be at least 8 characters'
}

validate_name() {
  local value="$1" label="$2"
  [[ "$value" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "$label must contain only letters, digits and underscore, and cannot start with a digit"
}

validate_host() {
  local value="$1" label="$2"
  [[ -n "$value" && "$value" =~ ^[A-Za-z0-9.:-]+$ ]] || die "$label contains unsupported characters"
}

urlencode() {
  node -e "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>process.stdout.write(encodeURIComponent(s)))"
}

run_as_app() {
  runuser -u "$APP_USER" -- env HOME="${APP_HOME:-/home/${APP_USER}}" "$@"
}

run_update_mode() {
  [[ -d "${PROJECT_DIR}/.git" ]] || die "Existing Git checkout not found at ${PROJECT_DIR}"
  [[ -f "${PROJECT_DIR}/package.json" ]] || die "package.json not found at ${PROJECT_DIR}"
  [[ -f "${PROJECT_DIR}/.env" ]] || die "Existing ${PROJECT_DIR}/.env is required for update mode"
  [[ -f "${PROJECT_DIR}/ecosystem.config.cjs" ]] || die "ecosystem.config.cjs not found at ${PROJECT_DIR}"
  id "$APP_USER" >/dev/null 2>&1 || die "Application user does not exist: ${APP_USER}"
  APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
  [[ -n "$APP_HOME" ]] || die "Cannot resolve home directory for ${APP_USER}"
  PM2_BIN="${PM2_BIN:-/usr/local/bin/pm2}"
  [[ -x "$PM2_BIN" ]] || die "PM2 is not executable at ${PM2_BIN}"
  command -v git >/dev/null 2>&1 || die 'git is required for update mode'
  command -v npm >/dev/null 2>&1 || die 'npm is required for update mode'
  [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( BACKUP_RETENTION_DAYS >= 1 )) \
    || die 'BACKUP_RETENTION_DAYS must be a positive integer'
  BACKUP_DIR="${PROJECT_DIR}/backup"

  cat <<EOF

JOJ Game update summary
  Project:  ${PROJECT_DIR}
  App user: ${APP_USER}
  PM2:      ${PM2_BIN}
  Config:   preserve existing .env and system configuration
  Content:  preserve PostgreSQL production content
  Backups:  ${BACKUP_DIR} (local only, ignored by Git)
EOF
  if (( ! ASSUME_YES )); then
    (( NON_INTERACTIVE )) && die 'Use --yes for non-interactive update'
    read -r -p 'Continue with update? [y/N]: ' answer
    [[ "$answer" =~ ^[Yy]$ ]] || { log 'Cancelled.'; exit 0; }
  fi

  install -d -m 0700 -o root -g root "$BACKUP_DIR"
  if [[ -f /etc/default/joj-game ]]; then
    if grep -q '^JOJ_BACKUP_DIR=' /etc/default/joj-game; then
      sed -i "s|^JOJ_BACKUP_DIR=.*$|JOJ_BACKUP_DIR=${BACKUP_DIR}|" /etc/default/joj-game
    else
      printf 'JOJ_BACKUP_DIR=%s\n' "$BACKUP_DIR" >>/etc/default/joj-game
    fi
  fi

  touch "$LOG_FILE"; chmod 600 "$LOG_FILE"
  exec > >(tee -a "$LOG_FILE") 2>&1

  log 'Update mode: preserving OS, database, administrator, Caddy, TLS, firewall and timers.'
  if [[ -x "${PROJECT_DIR}/scripts/backup-production.sh" ]]; then
    log 'Creating a pre-update production backup...'
    JOJ_PROJECT_DIR="$PROJECT_DIR" JOJ_BACKUP_DIR="$BACKUP_DIR" JOJ_BACKUP_RETENTION_DAYS="$BACKUP_RETENTION_DAYS" \
      "${PROJECT_DIR}/scripts/backup-production.sh"
  else
    die 'Backup script is missing; update aborted before changing files'
  fi

  log 'Fetching and fast-forwarding the current Git branch...'
  run_as_app git -C "$PROJECT_DIR" fetch --prune origin
  run_as_app git -C "$PROJECT_DIR" pull --ff-only

  log 'Installing locked dependencies...'
  run_as_app bash -lc 'cd "$1" && npm ci --include=dev' bash "$PROJECT_DIR"

  log 'Running the complete release checks...'
  run_as_app bash -lc 'cd "$1" && npm run check:release' bash "$PROJECT_DIR"

  log 'Applying database migrations without reseeding production content...'
  run_as_app bash -lc 'cd "$1" && npm run db:migrate && npm run sync:shared-config-db' bash "$PROJECT_DIR"

  log 'Restarting JOJ services...'
  install -m 0755 "${PROJECT_DIR}/scripts/joj-cli.sh" /usr/local/bin/joj
  run_as_app bash -lc 'cd "$1" && ("$2" start ecosystem.config.cjs --update-env || "$2" restart ecosystem.config.cjs --update-env)' bash "$PROJECT_DIR" "$PM2_BIN"
  run_as_app "$PM2_BIN" save

  log 'Running health check...'
  local health_ok=0
  for _ in {1..20}; do
    if curl --fail --silent --show-error http://127.0.0.1:8000/api/health >/dev/null; then
      health_ok=1
      break
    fi
    sleep 2
  done
  (( health_ok == 1 )) || die 'Backend health check failed; run sudo joj logs server'
  run_as_app "$PM2_BIN" status

  cat <<EOF

Update completed successfully.
  Project: ${PROJECT_DIR}
  Health:  http://127.0.0.1:8000/api/health
  Backup:  ${BACKUP_DIR}
EOF
}

[[ "$(id -u)" -eq 0 ]] || die 'Run this installer as root (sudo).'
[[ -f "${SOURCE_DIR}/package.json" ]] || die "package.json not found in ${SOURCE_DIR}"
[[ -r /etc/os-release ]] || die 'Cannot identify the operating system.'
source /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 24.04 ]] || die 'This installer supports Ubuntu Server 24.04 LTS only.'
validate_name "$APP_USER" 'APP_USER'
[[ "$PROJECT_DIR" == /* && "$PROJECT_DIR" != / ]] || die 'PROJECT_DIR must be an absolute, non-root path'
[[ "$PROJECT_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]] || die 'PROJECT_DIR contains unsupported characters'

if [[ "$INSTALL_MODE" == update ]]; then
  run_update_mode
  exit 0
fi

prompt_value DOMAIN 'Public domain (for example joj.lol)'
prompt_optional DOMAIN_WWW 'Additional www domain (for example www.joj.lol)'
prompt_optional ACME_EMAIL 'Email for HTTPS certificate notifications'
validate_host "$DOMAIN" 'DOMAIN'
[[ -z "$DOMAIN_WWW" ]] || validate_host "$DOMAIN_WWW" 'DOMAIN_WWW'
if [[ "$DB_MODE" != local && "$DB_MODE" != remote ]]; then die 'DB_MODE must be local or remote'; fi
if (( ! NON_INTERACTIVE )); then
  read -r -p "Database mode [${DB_MODE}]: " answer
  DB_MODE="${answer:-$DB_MODE}"
fi
[[ "$DB_MODE" == local || "$DB_MODE" == remote ]] || die 'Database mode must be local or remote'
prompt_value DB_HOST 'PostgreSQL host' "$([[ "$DB_MODE" == local ]] && printf '127.0.0.1' || printf '')"
prompt_value DB_PORT 'PostgreSQL port' '5432'
prompt_value DB_NAME 'PostgreSQL database' 'joj_game'
prompt_value DB_USER 'PostgreSQL user' 'joj_user'
prompt_value DB_SSLMODE 'PostgreSQL SSL mode (disable/prefer/require/verify-ca/verify-full)' 'disable'
validate_host "$DB_HOST" 'DB_HOST'
validate_name "$DB_NAME" 'DB_NAME'
validate_name "$DB_USER" 'DB_USER'
[[ "$DB_PORT" =~ ^[0-9]+$ ]] && (( DB_PORT >= 1 && DB_PORT <= 65535 )) || die 'DB_PORT is invalid'
[[ "$DB_SSLMODE" =~ ^(disable|prefer|require|verify-ca|verify-full)$ ]] || die 'DB_SSLMODE is invalid'
[[ "$ENABLE_UFW" == 0 || "$ENABLE_UFW" == 1 ]] || die 'ENABLE_UFW must be 0 or 1'
[[ "$SKIP_ADMIN" == 0 || "$SKIP_ADMIN" == 1 ]] || die 'SKIP_ADMIN must be 0 or 1'
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( BACKUP_RETENTION_DAYS >= 1 )) || die 'BACKUP_RETENTION_DAYS must be a positive integer'

if [[ -z "$DB_PASSWORD" && -n "$DB_PASSWORD_FILE" ]]; then
  [[ -f "$DB_PASSWORD_FILE" && -r "$DB_PASSWORD_FILE" ]] || die 'Cannot read DB_PASSWORD_FILE'
  DB_PASSWORD="$(<"$DB_PASSWORD_FILE")"
  DB_PASSWORD="${DB_PASSWORD%$'\n'}"
fi
if [[ -z "$DB_PASSWORD" && "$NON_INTERACTIVE" -eq 0 ]]; then
  if [[ "$DB_MODE" == local ]]; then
    read -r -s -p 'PostgreSQL password (leave blank to generate): ' DB_PASSWORD; printf '\n'
  else
    read -r -s -p 'PostgreSQL password: ' DB_PASSWORD; printf '\n'
  fi
fi
if [[ -z "$DB_PASSWORD" ]]; then
  if [[ "$DB_MODE" == local ]]; then
    DB_PASSWORD="$(dd if=/dev/urandom bs=24 count=1 status=none | base64)"
  else
    die 'DB_PASSWORD_FILE is required for a remote database in non-interactive mode'
  fi
fi
[[ -n "$DB_PASSWORD" ]] || die 'Database password cannot be empty'

if [[ "$SKIP_ADMIN" != 1 ]]; then
  prompt_value ADMIN_USERNAME 'Administrator username' 'admin'
  prompt_optional ADMIN_EMAIL 'Administrator email'
  prompt_value ADMIN_DISPLAY_NAME 'Administrator display name' 'Administrator'
  [[ "$ADMIN_LANG" == uk || "$ADMIN_LANG" == en ]] || die 'ADMIN_LANG must be uk or en'
  [[ "$ADMIN_USERNAME" =~ ^[A-Za-z0-9_-]{3,24}$ ]] || die 'ADMIN_USERNAME must be 3-24 letters, digits, underscore or hyphen'
fi
read_admin_password

cat <<EOF

JOJ Game installation summary
  Source:       ${SOURCE_DIR}
  Install path: ${PROJECT_DIR}
  App user:     ${APP_USER}
  Domain:       ${DOMAIN}${DOMAIN_WWW:+, ${DOMAIN_WWW}}
  Database:     ${DB_MODE} ${DB_HOST}:${DB_PORT}/${DB_NAME}
  Admin:        $([[ "$SKIP_ADMIN" == 1 ]] && printf 'skip' || printf '%s' "$ADMIN_USERNAME")
  Firewall:     $([[ "$ENABLE_UFW" == 1 ]] && printf 'enable' || printf 'unchanged')
EOF
if (( ! ASSUME_YES )); then
  (( NON_INTERACTIVE )) && die 'Use --yes for non-interactive installation'
  read -r -p 'Continue? [y/N]: ' answer
  [[ "$answer" =~ ^[Yy]$ ]] || { log 'Cancelled.'; exit 0; }
fi

touch "$LOG_FILE"; chmod 600 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

log 'Checking operating system...'
log "Detected Ubuntu ${VERSION_ID}."

log 'Installing OS packages...'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg git rsync ufw postgresql postgresql-client caddy build-essential

log 'Installing Node.js 24 LTS...'
if ! command -v node >/dev/null 2>&1 || [[ "$(node --version)" != v24.* ]]; then
  key_tmp="$(mktemp)"
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$key_tmp"
  gpg --dearmor --yes --output /usr/share/keyrings/nodesource.gpg "$key_tmp"
  chmod 0644 /usr/share/keyrings/nodesource.gpg
  rm -f "$key_tmp"
  printf 'deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main\n' >/etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi
[[ "$(node --version)" == v24.* ]] || die 'Node.js 24 installation failed'
(
  umask 022
  npm install --global --prefix /usr/local pm2
)
PM2_ENTRY="/usr/local/lib/node_modules/pm2/bin/pm2"
[[ -x "$PM2_ENTRY" ]] || die "PM2 entry point not found at ${PM2_ENTRY}"
ln -sfn "$PM2_ENTRY" /usr/local/bin/pm2
PM2_BIN=/usr/local/bin/pm2

log 'Preparing application user and files...'
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$APP_USER"
fi
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
[[ -n "$APP_HOME" ]] || die "Cannot resolve home directory for ${APP_USER}"
if [[ "$SOURCE_DIR" != "$PROJECT_DIR" && ! -f "${PROJECT_DIR}/package.json" ]]; then
  mkdir -p "$PROJECT_DIR"
  rsync -a --exclude node_modules --exclude dist --exclude coverage --exclude .env --exclude logs --exclude backup --exclude database/matches "${SOURCE_DIR}/" "${PROJECT_DIR}/"
elif [[ "$SOURCE_DIR" != "$PROJECT_DIR" ]]; then
  log "Existing installation found at ${PROJECT_DIR}; keeping its checkout."
fi
[[ -f "${PROJECT_DIR}/package.json" ]] || die "No application checkout at ${PROJECT_DIR}"
mkdir -p "${PROJECT_DIR}/logs" "${PROJECT_DIR}/backup"
chmod 0755 "${PROJECT_DIR}/scripts/joj-cli.sh" "${PROJECT_DIR}/scripts/backup-production.sh"
chown -R "$APP_USER:$APP_USER" "$PROJECT_DIR"
chown root:root "${PROJECT_DIR}/backup"
chmod 700 "${PROJECT_DIR}/backup"

log 'Configuring PostgreSQL...'
if [[ "$DB_MODE" == local ]]; then
  systemctl enable --now postgresql
  escaped_password="${DB_PASSWORD//\'/\'\'}"
  role_exists="$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'")"
  if [[ "$role_exists" == 1 ]]; then
    printf "ALTER ROLE \"%s\" WITH LOGIN PASSWORD '%s';\n" "$DB_USER" "$escaped_password" | runuser -u postgres -- psql --set ON_ERROR_STOP=1
  else
    printf "CREATE ROLE \"%s\" WITH LOGIN PASSWORD '%s';\n" "$DB_USER" "$escaped_password" | runuser -u postgres -- psql --set ON_ERROR_STOP=1
  fi
  database_exists="$(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'")"
  [[ "$database_exists" == 1 ]] || runuser -u postgres -- createdb --owner="$DB_USER" "$DB_NAME"
fi

encoded_user="$(printf '%s' "$DB_USER" | urlencode)"
encoded_password="$(printf '%s' "$DB_PASSWORD" | urlencode)"
url_host="$DB_HOST"
[[ "$url_host" != *:* ]] || url_host="[${url_host}]"
database_url="postgresql://${encoded_user}:${encoded_password}@${url_host}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"
env_tmp="$(mktemp "${PROJECT_DIR}/.env.tmp.XXXXXX")"
cat >"$env_tmp" <<EOF
# Generated by scripts/install-ubuntu.sh
NODE_ENV=production
STORAGE_MODE=postgres
DATABASE_URL=${database_url}
FRONTEND_ORIGIN=https://${DOMAIN}
TRUST_PROXY=true
PORT=8000
WEB_PORT=4173
VITE_PREVIEW_ALLOWED_HOSTS=${DOMAIN}${DOMAIN_WWW:+,${DOMAIN_WWW}},localhost,127.0.0.1
ALLOW_IN_MEMORY_USER_STORE=0
EOF
chown "$APP_USER:$APP_USER" "$env_tmp"; chmod 600 "$env_tmp"
mv -f "$env_tmp" "${PROJECT_DIR}/.env"

log 'Testing database and applying schema...'
PGPASSWORD="$DB_PASSWORD" PGSSLMODE="$DB_SSLMODE" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" --set ON_ERROR_STOP=1 --file="${PROJECT_DIR}/db/schema/db.sql"

log 'Installing dependencies and building...'
run_as_app bash -lc 'cd "$1" && npm ci && npm run check:release' bash "$PROJECT_DIR"
run_as_app bash -lc 'cd "$1" && npm run db:migrate' bash "$PROJECT_DIR"
run_as_app bash -lc 'cd "$1" && npm run sync:shared-config-db' bash "$PROJECT_DIR"

if [[ "$SKIP_ADMIN" != 1 ]]; then
  log 'Creating the initial administrator if needed...'
  admin_args=(--username "$ADMIN_USERNAME" --display-name "$ADMIN_DISPLAY_NAME" --lang "$ADMIN_LANG" --if-no-admin --password-stdin)
  [[ -z "$ADMIN_EMAIL" ]] || admin_args+=(--email "$ADMIN_EMAIL")
  printf '%s' "$ADMIN_PASSWORD" | run_as_app bash -lc 'cd "$1"; shift; exec npm run admin:create -- "$@"' bash "$PROJECT_DIR" "${admin_args[@]}"
  unset ADMIN_PASSWORD
fi

log 'Configuring Caddy HTTPS reverse proxy...'
{
  if [[ -n "$ACME_EMAIL" ]]; then printf '{\n  email %s\n}\n\n' "$ACME_EMAIL"; fi
  cat <<EOF
${DOMAIN} {
  encode zstd gzip
  @backend path /api/* /socket.io/*
  reverse_proxy @backend 127.0.0.1:8000
  reverse_proxy 127.0.0.1:4173
  header {
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    -Server
  }
}
EOF
  if [[ -n "$DOMAIN_WWW" ]]; then
    cat <<EOF

${DOMAIN_WWW} {
  redir https://${DOMAIN}{uri} permanent
}
EOF
  fi
} >/etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

log 'Starting JOJ services with PM2...'
install -m 0755 "${PROJECT_DIR}/scripts/joj-cli.sh" /usr/local/bin/joj
cat >/etc/default/joj-game <<EOF
JOJ_PROJECT_DIR=${PROJECT_DIR}
JOJ_APP_USER=${APP_USER}
JOJ_BACKUP_DIR=${PROJECT_DIR}/backup
JOJ_BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS}
JOJ_PM2_BIN=${PM2_BIN}
EOF
chmod 644 /etc/default/joj-game
run_as_app bash -lc 'cd "$1" && ("$2" start ecosystem.config.cjs --update-env || "$2" restart ecosystem.config.cjs --update-env)' bash "$PROJECT_DIR" "$PM2_BIN"
run_as_app "$PM2_BIN" save
env PATH="$PATH" "$PM2_BIN" startup systemd -u "$APP_USER" --hp "$APP_HOME"

log 'Installing the daily backup timer...'
cat >/etc/systemd/system/joj-backup.service <<EOF
[Unit]
Description=JOJ Game PostgreSQL and runtime backup

[Service]
Type=oneshot
EnvironmentFile=-/etc/default/joj-game
ExecStart=${PROJECT_DIR}/scripts/backup-production.sh
EOF
cat >/etc/systemd/system/joj-backup.timer <<'EOF'
[Unit]
Description=Daily JOJ Game backup

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now joj-backup.timer

if [[ "$ENABLE_UFW" == 1 ]]; then
  log 'Configuring firewall...'
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

log 'Running health checks...'
health_ok=0
for _ in {1..20}; do
  if curl --fail --silent --show-error http://127.0.0.1:8000/api/health >/dev/null; then health_ok=1; break; fi
  sleep 2
done
(( health_ok == 1 )) || die 'Backend health check failed; run sudo joj logs server'
run_as_app "$PM2_BIN" status
JOJ_PROJECT_DIR="$PROJECT_DIR" JOJ_BACKUP_DIR="${PROJECT_DIR}/backup" JOJ_BACKUP_RETENTION_DAYS="$BACKUP_RETENTION_DAYS" "${PROJECT_DIR}/scripts/backup-production.sh"

cat <<EOF

Installation completed successfully.
  Site:       https://${DOMAIN}
  Admin:      https://${DOMAIN}/admin
  Health:     https://${DOMAIN}/api/health
  Project:    ${PROJECT_DIR}
  Backups:    ${PROJECT_DIR}/backup

Useful commands:
  sudo joj status
  sudo joj health
  sudo joj logs server
  sudo joj restart
  sudo joj backup

Important: ${PROJECT_DIR}/backup is local-only and ignored by Git. Copy it to storage outside this VM.
EOF
