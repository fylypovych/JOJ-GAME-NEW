# Журнал Журналів (Web)

`boardgame.io`-based web version of the game with multiplayer rooms, admin panel, deck/ranks editor, simulation tools, and PostgreSQL-ready admin DB tooling.

## Run (Local)

```bash
npm install
copy .env.example .env
npm run dev:web
npm run dev:server
```

- Frontend (Vite): `http://localhost:5173`
- Game server (boardgame.io): `http://localhost:8000`
- Health check: `http://localhost:8000/api/health`

## Run (LAN Test)

1. Find your local IP (`ipconfig` on Windows), for example `192.168.0.25`.
2. Start frontend for LAN:

```bash
npm run dev:web -- --host 0.0.0.0
```

3. Start server with allowed frontend origin:

```bash
set FRONTEND_ORIGIN=http://192.168.0.25:5173 && npm run dev:server
```

4. Open on another device in the same network:

`http://192.168.0.25:5173`

## Version Sync From Commit Message

If a commit message contains a marker like `v=0.0.0.26`, the local `commit-msg` hook first tries to sync `package.json` and `package-lock.json` automatically, then validates that the staged versions match that marker.

Examples:

- `v=0.0.0.26`
- `auth fixes, v=0.0.0.27`

If hooks are not configured yet, run:

```bash
npm run setup:git-hooks
```

Hooks are configured explicitly; `npm install` does not modify your git hooks automatically.

Normal flow:

```bash
git commit -m "v=0.0.0.95"
```

If `package.json` / `package-lock.json` are clean, the hook updates and stages them automatically.

If those files already contain unstaged manual edits, auto-sync is blocked on purpose. In that case sync version explicitly:

```bash
npm run set:version -- "v=0.0.0.94"
```

Then commit normally:

```bash
git commit -m "v=0.0.0.94"
```

## Admin

- Admin UI: `/admin`
- Admin API supports token auth via `ADMIN_TOKEN` (see `.env.example`)
- `/admin` now has a token login form and stores token locally in browser storage
- Admin has dedicated tabs for:
  - matches / state / deck / ranks / simulation
  - `База Даних` (DB connection test, schema import/export, backup export/restore)
  - `Налаштування` (server URL, GitHub update/build/restart, system actions)

### `.env` (Server Runtime Config)

Server reads `.env` automatically on startup (if file exists).

Available keys:
- `PORT` (default `8000`)
- `FRONTEND_ORIGIN` (default `http://localhost:5173`)
- `WEB_PORT` (default `4173`, Vite preview port)
- `VITE_PREVIEW_ALLOWED_HOSTS` (comma-separated host allowlist for `vite preview`)
- `ADMIN_TOKEN` (empty = auth disabled; set this for LAN/public testing)
- `STORAGE_MODE` (`file` or `postgres`; `db` alias is also accepted by server)
- `DATABASE_URL` (required when `STORAGE_MODE=postgres`)

To enable admin protection (recommended):

```bash
copy .env.example .env
# then set ADMIN_TOKEN in .env
```

## Persistence

- Shared deck template: `database/shared-deck-template.json`
- Shared ranks: `database/shared-ranks.json`
- Both shared JSON configs support versioned documents and backward-compatible legacy imports.
- Match storage (boardgame.io FlatFile DB): `database/matches/`
- Server logs: `logs/server.log`

### PostgreSQL (Current Scope)

Implemented:
- Shared deck template (`deck`, `legendaryDeck`, `rankTrack`, `deckBackImage`)
- Shared ranks
- Admin DB tools in `/admin` -> `База Даних`

Still file-based (for now):
- `boardgame.io` match storage (`database/matches`)

When `STORAGE_MODE=postgres`, shared config is stored in PostgreSQL and also mirrored to local JSON files for compatibility/backup.

## PostgreSQL Setup (Shared Config Storage)

1. Install / run PostgreSQL and create database/user.
2. Set server env:

```env
STORAGE_MODE=postgres
DATABASE_URL=postgresql://joj_user:password@127.0.0.1:5432/joj_game
```

3. Import schema (`db/schema/db.sql`) once:

Option A (Admin UI):
- `/admin` -> `База Даних` -> `Імпортувати db.sql`

Option B (CLI):

```bash
psql "$DATABASE_URL" -f db/schema/db.sql
```

4. Restart services with env refresh:

```bash
pm2 restart joj-game-server joj-game-web --update-env
```

5. Seed current JSON config into DB (one-click):
- `/admin` -> `База Даних` -> `Імпортувати дані JSON в БД`

This imports current server-side JSON deck/ranks into PostgreSQL tables:
- `deck_templates`
- `deck_template_entries`
- `rank_sets`
- `rank_definitions`

## DB Admin Operations (`/admin` -> `База Даних`)

- DB connection test (`psql SELECT 1`)
- Import schema (`db.sql`) into target PostgreSQL
- Export schema (`db.sql`) download
- Export SQL backup (`pg_dump`)
- Restore SQL backup (upload `.sql` and apply via `psql`)
- Import current JSON deck/ranks into DB (forced sync)

Notes:
- DB connection form values are stored locally in browser storage (UI convenience).
- Schema import / backup restore / backup export use DB connection form values.
- JSON -> DB config import also uses DB connection form values (does not require server to already run in `postgres` mode).

## Ops / Deployment Helpers

- PM2 process config: `ecosystem.config.cjs`
- DB setup / migration notes: `docs/DB.md`
- DB cutover / sync runbook: `docs/ops/db-cutover-checklist.md`
- Firewall / port hardening notes: `docs/ops/deployment-hardening.md`
- Runtime env / deploy safety policy: `docs/ops/runtime-config-policy.md`
- Release checklist: `docs/ops/release-checklist.md`

### PM2 (Example)

```bash
npm run build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 status
```

Notes:
- Set `FRONTEND_ORIGIN` / `WEB_PORT` / `VITE_PREVIEW_ALLOWED_HOSTS` in `.env` (preferred) before LAN/public testing.
- After changing `.env` (for example `STORAGE_MODE` / `DATABASE_URL`), restart with:
  - `pm2 restart joj-game-server joj-game-web --update-env`
- `joj-game-web` uses `vite preview` on `:4173` (place behind reverse proxy).
- `joj-game-server` runs on `:8000` (keep private; proxy through `80/443`).
- Avoid editing `ecosystem.config.cjs` or `vite.config.ts` directly on the server; use `.env` instead to keep Git working tree clean.

## Admin Deploy (GitHub -> Build -> Restart)

`/admin` -> `Налаштування` -> `Оновити + зібрати + рестарт` performs:

- `git pull --ff-only`
- `npm ci --include=dev` (fallback: `npm install --include=dev`)
- `npm run typecheck`
- `npm run build`
- `pm2 restart ecosystem.config.cjs --update-env`

The admin UI includes delayed/retry status refresh after restart to avoid false "update check failed" messages during process restart.

## Orange Pi / Armbian Quick Install

Run on the Orange Pi (as root) after cloning the repo:

```bash
bash scripts/install-orangepi.sh
```

What it does:
- installs base packages + Node.js 22 + PM2
- installs helper command `joj` (and `start joj` compatibility wrapper if free)
- creates `.env` from `.env.example` (if missing)
- runs `npm install`
- runs `npx tsc -b` and `npx vite build`
- starts PM2 processes from `ecosystem.config.cjs`
- opens LAN ports `4173` and `8000` in `ufw`

Helper commands after install:

```bash
joj start
joj update
joj restart
joj status
joj logs
joj health
start joj   # compatibility shortcut
```

`joj update` runs:

```bash
git pull --ff-only
npm run build
pm2 restart joj-game-server joj-game-web --update-env
```

## Local HTTPS (LAN) with Caddy + hosts file

For local HTTPS before public DNS is ready, use Caddy internal CA:

```caddy
joj.lol, www.joj.lol {
  tls internal
  encode gzip

  @api path /api/* /games/* /socket.io/*
  reverse_proxy @api 127.0.0.1:8000

  reverse_proxy 127.0.0.1:4173
}
```

Requirements:
- Windows `hosts` entries for `joj.lol` and `www.joj.lol` -> Orange Pi LAN IP
- import Caddy local root certificate (`root.crt`) into Windows Trusted Root store
- browser `Server URL` in app admin settings set to `https://joj.lol`

## Backend Protections (Implemented)

- Basic rate limits on admin/import/upload routes
- Admin token protection for admin routes and admin write operations
- Request payload size limits:
  - normal JSON API: ~2 MB
  - deck import JSON: ~8 MB
  - image upload JSON body (data URL): ~16 MB

## Open Test Checklist

See `docs/ops/open-test-checklist.md`.

## Project Structure (High-level)

Source code:
- `src/` - frontend UI + game client logic
- `server/` - backend routes/services/storage adapters
- `server/db/` - DB command helpers (`psql` wrappers)
- `server/storage/shared-config/` - shared config persistence (`file` / `postgres`)
- `db/schema/` - tracked SQL schema
- `docs/` - operational + development docs

Runtime data (server-generated / mutable):
- `database/` - JSON shared config mirrors + boardgame.io match FlatFile data
- `public/cards/` - uploaded/generated card assets
- `logs/` - server logs
