# Database Guide (PostgreSQL)

This project supports a gradual migration to PostgreSQL.

Current production-ready DB scope:
- shared deck template (`deck`, `legendaryDeck`, `rankTrack`, `deckBackImage`, `modules`, `catalog`, `extraCatalog`)
- shared ranks
- user authentication and profiles
- admin DB tools (schema import/export, backup export/restore, JSON -> DB sync)

Still file-based:
- `boardgame.io` match storage (`database/matches`)

## Files and Paths

- DB schema file (tracked): `db/schema/db.sql`
- Runtime JSON fallback/mirror:
  - `database/shared-deck-template.json`
  - `database/shared-ranks.json`

## Enable PostgreSQL-backed Shared Config

Set in `.env`:

```env
STORAGE_MODE=postgres
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/joj_game
ADMIN_TOKEN=your-secret-token
FRONTEND_ORIGIN=http://your-domain.com
TRUST_PROXY=true
NODE_ENV=production
```

Restart PM2 with env refresh:

```bash
pm2 restart joj-game-server joj-game-web --update-env
```

## One-time Setup

1. Create DB + user in PostgreSQL.
2. Import schema:
   - Admin UI: `/admin` -> `База Даних` -> `Імпортувати db.sql`
   - CLI: `psql "$DATABASE_URL" -f db/schema/db.sql`
3. Import current JSON deck/ranks into DB:
   - `/admin` -> `База Даних` -> `Імпортувати дані JSON в БД`

4. Verify that DB matches local JSON:
   - PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/db-cutover-check.ps1`
   - Linux / Ubuntu: `bash ./scripts/db-cutover-check.sh`

## Admin DB Tab Capabilities

- Test DB connection (using `psql`)
- Import / export `db.sql`
- Export backup (`pg_dump`)
- Restore backup (`psql` apply uploaded `.sql`)
- Import current JSON deck/ranks into DB tables
- Manage users (create, update, role assignment, password reset)

## Tables Used for Shared Config

Decks:
- `deck_templates`
- `deck_template_entries`

Ranks:
- `rank_sets`
- `rank_definitions`

Users:
- `users`
- `user_sessions`

## Quick Verification SQL

```sql
SELECT template_key, is_active, updated_at FROM deck_templates;
SELECT deck_target, count(*) FROM deck_template_entries GROUP BY deck_target ORDER BY deck_target;
SELECT rank_set_key, is_active, updated_at FROM rank_sets;
SELECT count(*) FROM rank_definitions;
SELECT id, username, role, created_at FROM users;
```

## Troubleshooting

`relation ... does not exist`:
- Import `db/schema/db.sql` first.

`Shared config storage mode is not postgres`:
- Old server build or old endpoint version. Update code and rebuild.
- Newer builds allow JSON -> DB import directly via DB connection form values.

`Server cannot start in production without ADMIN_TOKEN`:
- Set `ADMIN_TOKEN` in `.env`.

`Server cannot start in production without DATABASE_URL`:
- Set `DATABASE_URL` in `.env`.

`Server cannot start in production without FRONTEND_ORIGIN`:
- Set `FRONTEND_ORIGIN` in `.env`.

DB data not visible after changing `.env`:
- Restart PM2 with `--update-env`.
