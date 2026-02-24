# Release Checklist

## Pre-deploy

- `git status` is clean (or expected changes only)
- `npm install` completed successfully
- `npx --no-install tsc -b` passes
- `npm run build` passes

## Admin Smoke Test

- Open `/admin`
- `Settings` tab loads and `Git status` check works
- `Deck` tab opens and card preview renders
- Image upload works (card image and deck-back image)
- Crop editor opens, crop preview updates, cropped upload succeeds
- `Ranks` tab loads, edit/save/import/export basic flow works
- `Simulation` tab runs and report renders
- Match snapshot panel loads for an active match

## Game Smoke Test

- Lobby list loads
- Create room works
- Join room works
- Start game works
- Board renders for all participants
- Basic card play / end turn flow works

## Deploy/Runtime

- Server process starts (`joj start`)
- `/api/health` responds
- Static frontend loads from deployed URL
- PM2 services remain stable for a few minutes
