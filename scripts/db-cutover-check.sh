#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL_ARG=""
PSQL_PATH="${PSQL_PATH:-psql}"
SKIP_JSON_COMPARE=0

usage() {
  cat <<'EOF'
Usage:
  ./scripts/db-cutover-check.sh [--database-url URL] [--psql-path PATH] [--skip-json-compare]

Checks that the active shared deck template and active rank set in PostgreSQL
match the local JSON files in:
  - database/shared-deck-template.json
  - database/shared-ranks.json

Environment fallback:
  - DATABASE_URL from env or .env
  - STORAGE_MODE from env or .env
  - PSQL_PATH from env
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --database-url)
      DATABASE_URL_ARG="${2:-}"
      shift 2
      ;;
    --psql-path)
      PSQL_PATH="${2:-}"
      shift 2
      ;;
    --skip-json-compare)
      SKIP_JSON_COMPARE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_PATH="${REPO_ROOT}/.env"

read_dotenv_value() {
  local file_path="$1"
  local key="$2"
  [[ -f "$file_path" ]] || return 0
  python3 - "$file_path" "$key" <<'PY'
import sys
path, key = sys.argv[1], sys.argv[2]
with open(path, 'r', encoding='utf-8') as fh:
    for raw in fh:
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        if k.strip() != key:
            continue
        value = v.strip()
        if len(value) >= 2 and ((value[0] == value[-1] == '"') or (value[0] == value[-1] == "'")):
            value = value[1:-1]
        print(value)
        break
PY
}

DATABASE_URL="${DATABASE_URL_ARG:-${DATABASE_URL:-}}"
if [[ -z "${DATABASE_URL}" ]]; then
  DATABASE_URL="$(read_dotenv_value "${ENV_PATH}" "DATABASE_URL")"
fi
if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL is required. Pass --database-url or set DATABASE_URL in env/.env." >&2
  exit 1
fi

STORAGE_MODE_VALUE="${STORAGE_MODE:-}"
if [[ -z "${STORAGE_MODE_VALUE}" ]]; then
  STORAGE_MODE_VALUE="$(read_dotenv_value "${ENV_PATH}" "STORAGE_MODE")"
fi
if [[ -n "${STORAGE_MODE_VALUE}" ]]; then
  case "${STORAGE_MODE_VALUE,,}" in
    postgres|db) ;;
    *)
      echo "Warning: STORAGE_MODE is '${STORAGE_MODE_VALUE}' (expected postgres/db for cutover checks)." >&2
      ;;
  esac
fi

if ! command -v "${PSQL_PATH}" >/dev/null 2>&1; then
  echo "psql command not found: ${PSQL_PATH}" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for JSON counting and .env parsing." >&2
  exit 1
fi

invoke_psql_scalar() {
  local sql="$1"
  local output
  if ! output="$("${PSQL_PATH}" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --dbname "${DATABASE_URL}" --command "${sql}" 2>&1)"; then
    echo "psql failed for query [${sql}]: ${output}" >&2
    exit 1
  fi
  printf '%s\n' "${output}" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | awk 'NF { print; exit }'
}

active_template_count="$(invoke_psql_scalar "SELECT count(*) FROM deck_templates WHERE is_active = true;")"
active_rank_set_count="$(invoke_psql_scalar "SELECT count(*) FROM rank_sets WHERE is_active = true;")"
template_key="$(invoke_psql_scalar "SELECT template_key FROM deck_templates WHERE is_active = true ORDER BY updated_at DESC LIMIT 1;")"
rank_set_key="$(invoke_psql_scalar "SELECT rank_set_key FROM rank_sets WHERE is_active = true ORDER BY updated_at DESC LIMIT 1;")"

db_deck_count="$(invoke_psql_scalar "SELECT count(*) FROM deck_template_entries e JOIN deck_templates t ON t.id = e.deck_template_id WHERE t.is_active = true AND e.deck_target = 'deck';")"
db_legendary_count="$(invoke_psql_scalar "SELECT count(*) FROM deck_template_entries e JOIN deck_templates t ON t.id = e.deck_template_id WHERE t.is_active = true AND e.deck_target = 'legendaryDeck';")"
db_rank_track_count="$(invoke_psql_scalar "SELECT count(*) FROM deck_template_entries e JOIN deck_templates t ON t.id = e.deck_template_id WHERE t.is_active = true AND e.deck_target = 'rankTrack';")"
db_rank_definitions_count="$(invoke_psql_scalar "SELECT count(*) FROM rank_definitions d JOIN rank_sets r ON r.id = d.rank_set_id WHERE r.is_active = true;")"

declare -a errors=()

if [[ "${active_template_count}" != "1" ]]; then
  errors+=("Expected exactly 1 active deck template, got ${active_template_count}.")
fi
if [[ "${active_rank_set_count}" != "1" ]]; then
  errors+=("Expected exactly 1 active rank set, got ${active_rank_set_count}.")
fi

expected_deck_count=""
expected_legendary_count=""
expected_rank_track_count=""
expected_rank_definitions_count=""

if [[ "${SKIP_JSON_COMPARE}" -eq 0 ]]; then
  deck_path="${REPO_ROOT}/database/shared-deck-template.json"
  ranks_path="${REPO_ROOT}/database/shared-ranks.json"

  [[ -f "${deck_path}" ]] || errors+=("Missing file: ${deck_path}")
  [[ -f "${ranks_path}" ]] || errors+=("Missing file: ${ranks_path}")

  if [[ -f "${deck_path}" && -f "${ranks_path}" ]]; then
    mapfile -t expected_counts < <(python3 - "${deck_path}" "${ranks_path}" <<'PY'
import json
import sys
deck_path, ranks_path = sys.argv[1], sys.argv[2]
with open(deck_path, 'r', encoding='utf-8') as fh:
    deck = json.load(fh)
with open(ranks_path, 'r', encoding='utf-8') as fh:
    ranks = json.load(fh)

def count(primary, fallback):
    if isinstance(deck.get(primary), list):
        return len(deck[primary])
    if isinstance(deck.get(fallback), list):
        return len(deck[fallback])
    return 0

print(count('deck', 'deckIds'))
print(count('legendaryDeck', 'legendaryDeckIds'))
print(count('rankTrack', 'rankTrackIds'))
print(len(ranks) if isinstance(ranks, list) else 0)
PY
)

    expected_deck_count="${expected_counts[0]:-0}"
    expected_legendary_count="${expected_counts[1]:-0}"
    expected_rank_track_count="${expected_counts[2]:-0}"
    expected_rank_definitions_count="${expected_counts[3]:-0}"

    [[ "${db_deck_count}" == "${expected_deck_count}" ]] || errors+=("deck count mismatch: db=${db_deck_count} json=${expected_deck_count}")
    [[ "${db_legendary_count}" == "${expected_legendary_count}" ]] || errors+=("legendaryDeck count mismatch: db=${db_legendary_count} json=${expected_legendary_count}")
    [[ "${db_rank_track_count}" == "${expected_rank_track_count}" ]] || errors+=("rankTrack count mismatch: db=${db_rank_track_count} json=${expected_rank_track_count}")
    [[ "${db_rank_definitions_count}" == "${expected_rank_definitions_count}" ]] || errors+=("rank definitions mismatch: db=${db_rank_definitions_count} json=${expected_rank_definitions_count}")
  fi
fi

echo "DB cutover check:"
echo "  active template key: ${template_key}"
echo "  active rank set key: ${rank_set_key}"
echo "  db entries: deck=${db_deck_count} legendaryDeck=${db_legendary_count} rankTrack=${db_rank_track_count} rankDefinitions=${db_rank_definitions_count}"
if [[ "${SKIP_JSON_COMPARE}" -eq 0 ]]; then
  echo "  json expected: deck=${expected_deck_count} legendaryDeck=${expected_legendary_count} rankTrack=${expected_rank_track_count} rankDefinitions=${expected_rank_definitions_count}"
fi

if [[ "${#errors[@]}" -gt 0 ]]; then
  echo "DB cutover check failed:" >&2
  for error in "${errors[@]}"; do
    echo "- ${error}" >&2
  done
  exit 1
fi

echo "DB cutover check passed."
