# Runtime Data Policy

Документ фіксує, що є source of truth, а що є mirror/derived runtime data.

## `database/*.json`

Дозволені top-level runtime mirrors:

- `shared-deck-template.json`
- `shared-ranks.json`
- `simulation-baselines.json`
- `game-ui-config.json`
- `bug-report-ui-config.json`
- `admin-db-ui-config.json`
- `download-materials.json`

Правила:

- імена файлів мають бути `kebab-case.json`
- не додавайте довільні runtime dump-файли у `database/`
- нові mirror-файли треба спочатку описати в цьому документі та в `scripts/check-runtime-data.ts`

## `database/matches/`

- директорія вважається volatile mirror storage
- у git допустимий лише `.gitkeep` і вже наявні legacy hash-named snapshots
- нові файли мають бути лише sha256-like filenames або бути поза git

## `public/card-assets/`

- canonical naming: `kebab-case.ext`
- дозволені розширення: `png`, `jpg`, `jpeg`, `gif`, `svg`, `webp`
- нові non-canonical назви блокуються `scripts/check-asset-inventory.ts`
- legacy винятки зафіксовані в самому скрипті й не повинні розростатися

## Shared config consistency

`scripts/check-shared-config.ts` перевіряє:

- schema kind для shared template/ranks
- валідність import/export payload
- відсутність duplicate ids
- наявність базового non-empty config

## CI policy

GitHub Actions тепер перевіряє:

- `lint`
- `format:check`
- `typecheck`
- `test`
- `coverage`
- `check:shared-config`
- `check:assets`
- `check:runtime-data`
- `build`
