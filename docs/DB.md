# Database Guide (PostgreSQL)

This project supports a gradual migration to PostgreSQL.

Current production-ready DB scope:
- shared deck template (`deck`, `legendaryDeck`, `rankTrack`, `deckBackImage`)
- shared ranks
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

## Tables Used for Shared Config

Decks:
- `deck_templates`
- `deck_template_entries`

Ranks:
- `rank_sets`
- `rank_definitions`

## Quick Verification SQL

```sql
SELECT template_key, is_active, updated_at FROM deck_templates;
SELECT deck_target, count(*) FROM deck_template_entries GROUP BY deck_target ORDER BY deck_target;
SELECT rank_set_key, is_active, updated_at FROM rank_sets;
SELECT count(*) FROM rank_definitions;
```

## Troubleshooting

`relation ... does not exist`:
- Import `db/schema/db.sql` first.

`Shared config storage mode is not postgres`:
- Old server build or old endpoint version. Update code and rebuild.
- Newer builds allow JSON -> DB import directly via DB connection form values.

DB data not visible after changing `.env`:
- Restart PM2 with `--update-env`.
