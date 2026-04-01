# Журнал Журналів (Web)

Вебверсія гри на базі `boardgame.io` з багатокористувацькими кімнатами, кількома UI-варіантами (`v2`, `v3`, `v4`), акаунтами користувачів, адмінкою, редактором колоди/звань, симуляціями, bug-report системою та підтримкою `file`/`postgres` storage.

## Що є в проєкті

- multiplayer rooms через `boardgame.io`
- режими гри: `standard`, `standard_plus`, `simplified`
- UI-варіанти клієнта: `v2`, `v3`, `v4`
- акаунти користувачів, профілі, історія матчів, сесії, password reset
- admin UI `/admin`
- shared deck template + shared ranks
- legendary deck, rank track, deck back image
- аналітика, awards, bug reports
- PostgreSQL backend для shared config, user data, bug reports, match mirror і самих матчів
- file mirrors для сумісності та локальної роботи

## Технології

- frontend: React 18 + Vite + TypeScript
- game server: `boardgame.io`
- backend: Node.js + TypeScript
- database: PostgreSQL
- screenshots у bug report: `html2canvas`

## Швидкий локальний старт

```bash
npm install
copy .env.example .env
npm run dev:full
```

Або окремо:

```bash
npm run dev:web
npm run dev:server
```

Адреси за замовчуванням:

- frontend: `http://localhost:5173`
- server: `http://localhost:8000`
- health check: `http://localhost:8000/api/health`
- admin UI: `http://localhost:5173/admin`

## LAN запуск

1. Дізнайтесь локальну IP-адресу хоста, наприклад через `ipconfig`.
2. Запустіть frontend:

```bash
npm run dev:web -- --host 0.0.0.0
```

3. Запустіть сервер із правильним origin:

```bash
set FRONTEND_ORIGIN=http://192.168.0.25:5173 && npm run dev:server
```

4. Відкрийте застосунок на іншому пристрої:

`http://192.168.0.25:5173`

## Основні npm-скрипти

```bash
npm run dev:full
npm run dev:web
npm run dev:server
npm run typecheck
npm test
npm run test:invariants
npm run test:config
npm run test:simulation
npm run build
npm run preview
```

Додатково:

```bash
npm run setup:git-hooks
npm run set:version -- "v=0.0.1.48"
npm run seed:shared-config
```

## Runtime `.env`

Мінімальний `.env.example` вже є в репозиторії:

```env
PORT=8000
FRONTEND_ORIGIN=http://localhost:5173
WEB_PORT=4173
VITE_PREVIEW_ALLOWED_HOSTS=joj.lol,www.joj.lol,localhost,127.0.0.1
ADMIN_TOKEN=change-me-strong-token
```

Актуальні важливі змінні середовища:

- `PORT` - порт backend, за замовчуванням `8000`
- `FRONTEND_ORIGIN` - дозволений frontend origin
- `WEB_PORT` - порт для `vite preview`
- `VITE_PREVIEW_ALLOWED_HOSTS` - allowlist для preview
- `ADMIN_TOKEN` - обов'язково для production
- `STORAGE_MODE` - `file`, `postgres`, або `db` (`db` нормалізується до `postgres`)
- `DATABASE_URL` - обов'язково, якщо `STORAGE_MODE=postgres`
- `NODE_ENV` - стандартна runtime-змінна Node.js

## Storage режими

### `file`

Локальний режим без залежності від PostgreSQL.

Основні runtime-файли:

- shared deck template: `database/shared-deck-template.json`
- shared ranks: `database/shared-ranks.json`
- bug reports: `database/bug-reports.json`
- bug report images: `database/bug-report-images/`
- boardgame.io match data: `database/matches/`
- server logs: `logs/server.log`

### `postgres`

Поточний production-oriented режим.

У цьому режимі PostgreSQL використовується для:

- shared config
- user accounts / sessions / profile data
- awards / analytics data
- bug reports
- boardgame.io matches
- match state mirror / history

При старті сервер:

- піднімає PostgreSQL pool
- проганяє SQL migrations
- за потреби мігрує FlatFile match storage в PostgreSQL backend
- залишає file mirrors для shared config сумісності / backup-сценаріїв

## PostgreSQL setup

1. Створіть БД та користувача.
2. Додайте в `.env`:

```env
STORAGE_MODE=postgres
DATABASE_URL=postgresql://joj_user:password@127.0.0.1:5432/joj_game
```

3. Імпортуйте схему:

Через CLI:

```bash
psql "$DATABASE_URL" -f db/schema/db.sql
```

Або через `/admin` -> `База Даних` -> `Імпортувати db.sql`

4. Перезапустіть сервіси з оновленим env:

```bash
pm2 restart joj-game-server joj-game-web --update-env
```

5. За потреби імпортуйте поточні JSON-конфіги в БД:

- `/admin` -> `База Даних` -> `Імпортувати дані JSON в БД`
- або `npm run seed:shared-config`

## Admin

Admin UI доступний за адресою `/admin`.

Що є в адмінці:

- matches / state
- deck / ranks editor
- simulation
- analytics
- awards
- users
- bug reports
- database tools
- GitHub update/build/restart flow
- runtime/system settings

Захист:

- admin API працює через admin auth
- production startup без admin auth блокується runtime policy
- `ADMIN_TOKEN` повинен бути заданий у production

Детальніше: [docs/ops/runtime-config-policy.md](docs/ops/runtime-config-policy.md)

## Bug reports

У клієнті є bug-report widget:

- текстовий опис проблеми
- автоскріншот сторінки гри
- локальне збереження чернетки
- кастомне admin-configured зображення для FAB-кнопки
- admin review у вкладці bug reports

Публічні API:

- `GET /api/bug-reports/ui-config`
- `GET /api/bug-reports/ui-image`
- `POST /api/bug-reports`

Admin API:

- `GET /api/admin/bug-reports`
- `GET /api/admin/bug-reports/detail`
- `GET /api/admin/bug-reports/image`
- `POST /api/admin/bug-reports/status`
- `GET/POST /api/admin/bug-reports/ui-config`

## User accounts

Реалізовано:

- registration / login
- profile editing
- sessions management
- logout current / all sessions
- password reset flow
- match binding до користувача
- user stats / awards / history

Основні backend-роути:

- `server/routes/auth.ts`
- `server/routes/user-lobby.ts`
- `server/routes/admin.ts`

## UI варіанти

Клієнт підтримує кілька UI-шарів:

- `v2`
- `v3`
- `v4`

`v4` зараз є найбільш кастомізованим і має окрему immersive layout-логіку для активної гри.

Основні файли UI:

- [src/ui/App.tsx](src/ui/App.tsx)
- [src/ui/BoardV2.tsx](src/ui/BoardV2.tsx)
- [src/ui/BoardV3.tsx](src/ui/BoardV3.tsx)
- [src/ui/BoardV4.tsx](src/ui/BoardV4.tsx)
- [src/ui/styles.css](src/ui/styles.css)

## Version sync із commit message

Якщо commit message містить маркер виду `v=0.0.1.48`, git hook синхронізує `package.json` і `package-lock.json`.

Приклади:

- `v=0.0.1.48`
- `fix lobby auth, v=0.0.1.49`

Перший запуск hooks:

```bash
npm run setup:git-hooks
```

Явна синхронізація:

```bash
npm run set:version -- "v=0.0.1.48"
```

## Build і preview

```bash
npm run build
npm run preview
```

`vite preview` використовує `WEB_PORT` з `.env`, за замовчуванням `4173`.

## PM2 / deployment

Є готовий PM2 config:

- [ecosystem.config.cjs](ecosystem.config.cjs)

Базовий сценарій:

```bash
npm run build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 status
```

Після зміни `.env`:

```bash
pm2 restart joj-game-server joj-game-web --update-env
```

Нотатки:

- `joj-game-web` працює через `vite preview`
- `joj-game-server` краще не експонувати напряму назовні
- для production краще ставити reverse proxy перед `4173` і `8000`

## Admin deploy flow

В адмінці є сценарії:

- перевірка git status
- конфігурація GitHub HTTPS credentials
- `git pull`
- `npm ci` / fallback `npm install`
- `npm run typecheck`
- `npm run build`
- `pm2 restart ... --update-env`

Є окремі admin endpoints для:

- update
- deploy
- publish
- restart

## Orange Pi / Armbian

Швидка інсталяція:

```bash
bash scripts/install-orangepi.sh
```

Скрипт:

- ставить Node.js 22 + PM2
- створює `.env`, якщо його нема
- запускає install / build
- стартує PM2
- відкриває LAN-порти в `ufw`

Після інсталяції є helper-команди:

```bash
joj start
joj update
joj restart
joj status
joj logs
joj health
```

## Local HTTPS через Caddy

Приклад для LAN:

```caddy
joj.lol, www.joj.lol {
  tls internal
  encode gzip

  @api path /api/* /games/* /socket.io/*
  reverse_proxy @api 127.0.0.1:8000

  reverse_proxy 127.0.0.1:4173
}
```

## Безпека і runtime policy

Реально застосовуються:

- rate limits на admin/import/upload routes
- admin auth
- payload size limits для JSON / import / image upload
- runtime validation для production env

Небезпечні режими припустимі лише локально:

- порожній `ADMIN_TOKEN`
- пряме публічне відкриття server port без reverse proxy

## Структура проєкту

Код:

- `src/` - frontend UI + клієнтська логіка гри
- `server/` - backend routes / services / runtime bootstrap
- `server/db/` - PostgreSQL helpers / migrations
- `server/storage/shared-config/` - adapters для `file` / `postgres`
- `db/schema/` - SQL schema
- `db/migrations/` - SQL migrations
- `tests/` - unit/invariant/config/simulation tests
- `docs/` - ops + dev docs

Runtime data:

- `database/` - JSON mirrors, bug reports, match data, local mutable state
- `public/cards/` - картки та інші зображення
- `logs/` - серверні логи

## Корисні документи

- [docs/DB.md](docs/DB.md)
- [docs/GAME_INVARIANTS.md](docs/GAME_INVARIANTS.md)
- [docs/ops/runtime-config-policy.md](docs/ops/runtime-config-policy.md)
- [docs/ops/release-checklist.md](docs/ops/release-checklist.md)
- [docs/ops/db-cutover-checklist.md](docs/ops/db-cutover-checklist.md)
- [docs/ops/open-test-checklist.md](docs/ops/open-test-checklist.md)
- [docs/ops/deployment-hardening.md](docs/ops/deployment-hardening.md)
