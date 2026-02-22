# Журнал Журналів (Web)

`boardgame.io`-based web version of the game with multiplayer rooms, admin panel, deck/ranks editor, and simulation tools.

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

## Admin

- Admin UI: `/admin`
- Admin API supports token auth via `ADMIN_TOKEN` (see `.env.example`)
- `/admin` now has a token login form and stores token locally in browser storage

### `.env` (Server Runtime Config)

Server reads `.env` automatically on startup (if file exists).

Available keys:
- `PORT` (default `8000`)
- `FRONTEND_ORIGIN` (default `http://localhost:5173`)
- `ADMIN_TOKEN` (empty = auth disabled; set this for LAN/public testing)

To enable admin protection (recommended):

```bash
copy .env.example .env
# then set ADMIN_TOKEN in .env
```

## Persistence

- Shared deck template: `database/shared-deck-template.json`
- Shared ranks: `database/shared-ranks.json`
- Match storage (boardgame.io FlatFile DB): `database/matches/`
- Server logs: `logs/server.log`

## Ops / Deployment Helpers

- PM2 process config: `ecosystem.config.cjs`
- Firewall / port hardening notes: `DEPLOYMENT_HARDENING.md`

### PM2 (Example)

```bash
npm run build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 status
```

Notes:
- Update `FRONTEND_ORIGIN` in `ecosystem.config.cjs` before open testing.
- `joj-game-web` uses `vite preview` on `:4173` (place behind reverse proxy).
- `joj-game-server` runs on `:8000` (keep private; proxy through `80/443`).

## Backend Protections (Implemented)

- Basic rate limits on admin/import/upload routes
- Admin token protection for admin routes and admin write operations
- Request payload size limits:
  - normal JSON API: ~2 MB
  - deck import JSON: ~8 MB
  - image upload JSON body (data URL): ~16 MB

## Open Test Checklist

See `OPEN_TEST_CHECKLIST.md`.
