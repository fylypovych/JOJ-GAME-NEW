# DB Cutover Checklist (Shared Config)

Use this when switching or validating PostgreSQL-backed shared config (`STORAGE_MODE=postgres`).

## Scope

- Applies to shared deck/ranks config and user authentication/profiles.
- Match storage is still file-based: `database/matches/`.

## Preconditions

- PostgreSQL is reachable.
- `psql` is installed on the server running the app/admin tools.
- `.env` has:

```env
STORAGE_MODE=postgres
DATABASE_URL=postgresql://user:password@host:5432/joj_game
FRONTEND_ORIGIN=https://your-domain.com
NODE_ENV=production
```

## Cutover Steps (One-time or Re-cutover)

1. Import schema:
   - Admin UI: `/admin` -> `База Даних` -> `Імпортувати db.sql`
   - or CLI: `psql "$DATABASE_URL" -f db/schema/db.sql`
2. Run forced sync JSON -> DB:
   - `/admin` -> `База Даних` -> `Імпортувати дані JSON в БД`
3. Restart with env refresh:
   - `pm2 restart joj-game-server joj-game-web --update-env`
4. Validate DB content:
   - `SELECT template_key, is_active FROM deck_templates;`
   - `SELECT deck_target, count(*) FROM deck_template_entries GROUP BY deck_target ORDER BY deck_target;`
   - `SELECT rank_set_key, is_active FROM rank_sets;`
   - `SELECT count(*) FROM rank_definitions;`
   - `SELECT id, username, role FROM users;`
   - or run one command from repo root:
     - `powershell -ExecutionPolicy Bypass -File scripts/db-cutover-check.ps1`
5. Validate app behavior:
   - Open `/admin` -> Deck/Ranks and confirm expected data is loaded.
   - Edit one card title in admin, save, refresh, and verify persisted value remains.
   - Test user registration and login.
   - Create a user via admin and verify it persists after restart.

## Ongoing Ops Policy

- Source of truth after cutover: PostgreSQL.
- Do not manually edit `database/shared-deck-template.json` / `database/shared-ranks.json` in normal operation.
- If JSON was changed manually (or restored from backup), run forced sync JSON -> DB again.
- User authentication and profiles are stored in PostgreSQL after cutover.

## Failure / Rollback

1. Set `STORAGE_MODE=file` in `.env`.
2. Restart with env refresh:
   - `pm2 restart joj-game-server joj-game-web --update-env`
3. Investigate DB connectivity/schema, then re-run cutover steps.
