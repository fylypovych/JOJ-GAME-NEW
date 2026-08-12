#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PROJECT_DIR="${JOJ_PROJECT_DIR:-/opt/joj-game}"
BACKUP_DIR="${JOJ_BACKUP_DIR:-${PROJECT_DIR}/backup}"
RETENTION_DAYS="${JOJ_BACKUP_RETENTION_DAYS:-7}"
ENV_FILE="${PROJECT_DIR}/.env"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Cannot read ${ENV_FILE}" >&2
  exit 1
fi
if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 )); then
  echo "JOJ_BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 1
fi

read_env_value() {
  local key="$1" line value
  line="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then value="${value:1:${#value}-2}"; fi
  if [[ "$value" == \'*\' && "$value" == *\' ]]; then value="${value:1:${#value}-2}"; fi
  printf '%s' "$value"
}

DATABASE_URL="$(read_env_value DATABASE_URL)"
if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is missing in ${ENV_FILE}" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="$(mktemp -d "${BACKUP_DIR}/.joj-backup-${timestamp}.XXXXXX")"
archive_path="${BACKUP_DIR}/joj-backup-${timestamp}.tar.gz"
cleanup() { rm -rf -- "$work_dir"; }
trap cleanup EXIT

PGDATABASE="$DATABASE_URL" pg_dump --format=custom --file="${work_dir}/database.dump"

runtime_paths=()
for candidate in database public/card-assets public/profile-image; do
  if [[ -e "${PROJECT_DIR}/${candidate}" ]]; then runtime_paths+=("$candidate"); fi
done
if (( ${#runtime_paths[@]} > 0 )); then
  tar -C "$PROJECT_DIR" -czf "${work_dir}/runtime-files.tar.gz" "${runtime_paths[@]}"
fi

cat >"${work_dir}/manifest.txt" <<EOF
created_utc=${timestamp}
project_dir=${PROJECT_DIR}
database_format=postgres-custom
git_commit=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || printf 'unknown')
EOF

tar -C "$work_dir" -czf "$archive_path" .
sha256sum "$archive_path" >"${archive_path}.sha256"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'joj-backup-*.tar.gz*' -mtime "+${RETENTION_DAYS}" -delete

echo "Backup created: ${archive_path}"
echo "Reminder: copy this backup to storage outside the VM."
