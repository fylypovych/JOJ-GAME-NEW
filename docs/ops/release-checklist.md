# Release Checklist

## Pre-deploy

- `git status` is clean (or expected changes only)
- `npm ci` completed successfully
- `npm run check:release` passes
- `npm audit --omit=dev` reports no production vulnerabilities
- `.env` is configured with required production variables:
  - `DATABASE_URL` is set
  - `FRONTEND_ORIGIN` is set
  - `NODE_ENV=production`
  - `TRUST_PROXY=true` (if using reverse proxy)

## Admin Smoke Test

- Open `/admin`
- Login with admin credentials works
- `Settings` tab loads and `Git status` check works
- `Deck` tab opens and card preview renders
- Image upload works (card image and deck-back image)
- Crop editor opens, crop preview updates, cropped upload succeeds
- `Ranks` tab loads, edit/save/import/export basic flow works
- `Simulation` tab runs and report renders
- Match snapshot panel loads for an active match
- `Database` tab loads and DB connection test works (if `STORAGE_MODE=postgres`)
- User management works (create, update, role assignment, password reset)
- Content studio saves and publishes news, downloads, and rules

## Game Smoke Test

- Lobby list loads
- Create room works
- Join room works
- Start game works
- Board renders for all participants
- Basic card play / end turn flow works
- Gallery (`/cards` or `/gallery`) loads and displays cards
- News, downloads, and editable rules pages render in light and dark themes
- Awards (`/awards`) loads (if implemented)
- Profile (`/profile`) loads and displays user info

## Deploy/Runtime

- Server process starts (`joj start`)
- `/api/health` responds
- Static frontend loads from deployed URL
- PM2 services remain stable for a few minutes
- No startup errors related to missing environment variables

## DB Mode Cutover (If `STORAGE_MODE=postgres`)

- Run `docs/ops/db-cutover-checklist.md`
- Confirm forced sync JSON -> DB was executed
- Confirm deck/ranks admin edits persist after restart
- Confirm user authentication works
- Confirm user profiles persist after restart
