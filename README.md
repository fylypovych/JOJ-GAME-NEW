# Журнал Журналів (Web)

Вебверсія гри на базі `boardgame.io` з багатокористувацькими кімнатами, двома актуальними UI-варіантами (`v1`, `v2`), акаунтами користувачів, адмінкою, редактором колоди/звань, симуляціями, bug-report системою та підтримкою `file`/`postgres` storage.

## Що є в проєкті

- multiplayer rooms через `boardgame.io`
- режими гри: `standard`, `standard_plus`, `simplified`
- UI-варіанти клієнта: `v1`, `v2`
- акаунти користувачів, профілі, історія матчів, сесії, password reset
- admin UI `/admin`
- shared deck template + shared ranks
- legendary deck, rank track, deck back image
- аналітика, awards, bug reports
- PostgreSQL backend для shared config, user data, bug reports, match mirror і самих матчів
- file mirrors для сумісності та локальної роботи
- SEO-friendly публічні маршрути: `/games`, `/cards`, `/rules`, `/profile`, `/statistics`
- `sitemap.xml` і `robots.txt` для індексації

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
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:invariants
npm run test:config
npm run test:simulation
npm run coverage
npm run check:shared-config
npm run check:assets
npm run check:runtime-data
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
```

Актуальні важливі змінні середовища:

- `PORT` - порт backend, за замовчуванням `8000`
- `FRONTEND_ORIGIN` - дозволений frontend origin
- `WEB_PORT` - порт для `vite preview`
- `VITE_PREVIEW_ALLOWED_HOSTS` - allowlist для preview
- `STORAGE_MODE` - `file`, `postgres`, або `db` (`db` нормалізується до `postgres`)
- `DATABASE_URL` - обов'язково, якщо `STORAGE_MODE=postgres`
- `NODE_ENV` - стандартна runtime-змінна Node.js

## Storage режими

### `file`

Локальний режим без залежності від PostgreSQL.

Основні runtime-файли:

- shared deck template: `database/shared-deck-template.json`
- shared ranks: `database/shared-ranks.json`
- simulation baselines: `database/simulation-baselines.json`
- game UI config: `database/game-ui-config.json`
- bug report UI config: `database/bug-report-ui-config.json`
- admin DB UI config: `database/admin-db-ui-config.json`
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

Політика runtime data і file mirrors: [docs/ops/runtime-data-policy.md](docs/ops/runtime-data-policy.md)

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
- адмін-доступ має працювати через administrator session + CSRF

Детальніше: [docs/ops/runtime-config-policy.md](docs/ops/runtime-config-policy.md)
Архітектурний зріз: [docs/dev/architecture.md](docs/dev/architecture.md)

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

Клієнт підтримує два актуальні UI-шари:

- `v1`
- `v2`

`v2` є основним сучасним інтерфейсом з immersive layout-логікою для активної гри.

`LegacyGameBoard` залишено в кодовій базі як legacy-реалізацію для старих внутрішніх секцій і поступового рефакторингу, але перемикач дизайну працює через `v1` / `v2`.

Основні файли UI:

- [src/ui/App.tsx](src/ui/App.tsx)
- [src/ui/GameBoardV1.tsx](src/ui/GameBoardV1.tsx)
- [src/ui/GameBoardV2.tsx](src/ui/GameBoardV2.tsx)
- [src/ui/LegacyGameBoard.tsx](src/ui/LegacyGameBoard.tsx)
- [src/ui/styles.css](src/ui/styles.css)

## SEO маршрути

Публічні сторінки, які мають окремі URL:

- `/games`
- `/cards`
- `/rules`
- `/profile`
- `/statistics`

Додатково в `public/` лежать:

- `sitemap.xml`
- `robots.txt`

## Version sync із commit message

Якщо commit message містить маркер виду `v=0.0.1.48`, git hook синхронізує `package.json` і `package-lock.json`.

Приклади:

- `v=0.0.1.48`
- `fix lobby auth, v=0.0.1.49`

Перший запуск hooks:

```bash
npm run setup:git-hooks
```

Автоматична синхронізація під час білду:

```bash
npm run build
```

`prebuild` автоматично підтягує `package.json` і `package-lock.json` під версію з останнього `HEAD` commit message, якщо в ньому є маркер `v=...`.

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

Для нової production VM на Ubuntu Server 24.04 використовуйте інтерактивний інсталятор:

```bash
sudo bash scripts/install-ubuntu.sh
```

Він встановлює Node.js/PostgreSQL/Caddy/PM2, налаштовує БД, HTTPS, першого адміністратора, firewall та щоденні backup. Детальна інструкція: [docs/ops/ubuntu-installer.md](docs/ops/ubuntu-installer.md).

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

  @api path /api/* /socket.io/*
  reverse_proxy @api 127.0.0.1:8000

  reverse_proxy 127.0.0.1:4173
}
```

Важливо: `/games`, `/cards`, `/rules`, `/profile`, `/statistics` мають залишатися frontend-роутами і не повинні прокситись у backend як API-маски.

## Безпека і runtime policy

Реально застосовуються:

- rate limits на admin/import/upload routes
- admin auth
- payload size limits для JSON / import / image upload
- runtime validation для production env

Небезпечні режими припустимі лише локально:

- вимкнена/зламана admin session auth
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
- `public/card-assets/` - картки та інші зображення
- `logs/` - серверні логи

## Корисні документи

- [docs/DB.md](docs/DB.md)
- [docs/GAME_INVARIANTS.md](docs/GAME_INVARIANTS.md)
- [docs/ops/runtime-config-policy.md](docs/ops/runtime-config-policy.md)
- [docs/ops/release-checklist.md](docs/ops/release-checklist.md)
- [docs/ops/db-cutover-checklist.md](docs/ops/db-cutover-checklist.md)
- [docs/ops/open-test-checklist.md](docs/ops/open-test-checklist.md)
- [docs/ops/deployment-hardening.md](docs/ops/deployment-hardening.md)

## Формат релізних комітів

Релізний коміт складається з двох окремих частин:

- **Summary** — лише номер версії, наприклад `0.0.3.99`.
- **Description** — маркований перелік реалізованих можливостей і важливих виправлень.

```text
0.0.3.99

- Покращено редактор карт.
- Додано пошук і фільтрацію.
- Додано захист незбережених змін.
```

Чистий номер у Summary зберігає сумісність із production-оновленням. Description відображається в деталях коміту на GitHub і має пояснювати результат для користувача, а не внутрішні кроки розробки.

Кожен сегмент версії `x.y.z.a` використовує значення від `0` до `99`. Перенесення виконується справа наліво:

```text
0.0.3.98 → 0.0.3.99 → 0.0.4.0
0.0.99.99 → 0.1.0.0
0.99.99.99 → 1.0.0.0
```

Історичні переповнені номери нормалізуються автоматично: `0.0.3.100` читається як `0.0.4.0`, а `0.0.3.101` — як `0.0.4.1`.

Наступний коректний номер за Git-історією можна отримати командою:

```bash
npm run version:next
```

Автоматичні коміти production-контенту (колоди, зображення та конфігурація гри) можуть використовувати власний змістовний опис без номера релізу.
