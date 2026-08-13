# Журнал Журналів (Web)

Вебверсія гри на базі `boardgame.io` з багатокористувацькими кімнатами, UI-варіантами `v1`/`v2`, акаунтами користувачів, адмінкою, редактором колоди/звань, симуляціями, bug-report системою та PostgreSQL storage.

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
- JSON/file mirrors для резервування та перенесення конфігурації; основним джерелом даних залишається PostgreSQL
- публічні маршрути: `/news`, `/games`, `/cards`, `/rules`, `/downloads`, `/profile`, `/statistics`
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
npm run dev:full
```

Перед запуском скопіюйте `.env.example` у `.env`, налаштуйте `DATABASE_URL` і переконайтеся, що PostgreSQL доступний. У Windows використовуйте `copy .env.example .env`, у Linux/macOS — `cp .env.example .env`.

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
npm run check:i18n
npm run check:runtime-data
npm run check:changelog-shas
npm run check:version-sync
npm run check:release
npm run build
npm run preview
```

Додатково:

```bash
npm run version:next
npm run sync:changelog-shas
npm run db:migrate
npm run sync:shared-config-db
```

## Runtime `.env`

Мінімальний `.env.example` вже є в репозиторії:

```env
PORT=8000
FRONTEND_ORIGIN=http://localhost:5173
WEB_PORT=4173
VITE_PREVIEW_ALLOWED_HOSTS=joj.lol,www.joj.lol,localhost,127.0.0.1
STORAGE_MODE=postgres
DATABASE_URL=postgresql://joj_user:password@127.0.0.1:5432/joj_game
ALLOW_IN_MEMORY_USER_STORE=0
NODE_ENV=development
TRUST_PROXY=
```

Актуальні важливі змінні середовища:

- `PORT` - порт backend, за замовчуванням `8000`
- `FRONTEND_ORIGIN` - дозволений frontend origin
- `WEB_PORT` - порт для `vite preview`
- `VITE_PREVIEW_ALLOWED_HOSTS` - allowlist для preview
- `STORAGE_MODE` - зафіксовано як `postgres`; file/in-memory fallback вимкнений
- `DATABASE_URL` - обов'язковий для запуску backend
- `ALLOW_IN_MEMORY_USER_STORE` - має залишатися `0`; in-memory user store не використовується
- `NODE_ENV` - стандартна runtime-змінна Node.js
- `TRUST_PROXY` - довірені reverse proxy; у production за Caddy значення має бути задане

## Storage

Backend працює лише з PostgreSQL. File/in-memory fallback вимкнений і без робочого `DATABASE_URL` сервер не запускається.

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
- за потреби імпортує історичні FlatFile matches у PostgreSQL
- синхронізує дозволені JSON mirrors для backup та перенесення конфігурації

Політика runtime data і file mirrors: [docs/ops/runtime-data-policy.md](docs/ops/runtime-data-policy.md)

## PostgreSQL setup

1. Створіть БД та користувача.
2. Додайте в `.env`:

```env
STORAGE_MODE=postgres
DATABASE_URL=postgresql://joj_user:password@127.0.0.1:5432/joj_game
```

3. Застосуйте міграції:

```bash
npm run db:migrate
```

Сервер та production-інсталятор також автоматично застосовують міграції під час запуску/оновлення. `db/schema/db.sql` залишається базовою схемою для ручного відновлення.

4. Перезапустіть сервіси з оновленим env:

```bash
pm2 restart joj-game-server joj-game-web --update-env
```

5. За потреби синхронізуйте поточні дозволені JSON-конфіги з БД:

- `/admin` -> `База Даних` -> `Імпортувати дані JSON в БД`
- або `npm run sync:shared-config-db`

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

Клієнт підтримує два варіанти оформлення:

- `v1`
- `v2`

Обидва мережеві клієнти використовують спільну актуальну дошку `GameBoardV2WithContext`; відмінності варіантів задаються UI-станом і CSS. Окремих `GameBoardV1` та `LegacyGameBoard` у кодовій базі немає.

Основні файли UI:

- [src/ui/App.tsx](src/ui/App.tsx)
- [src/ui/GameBoardV2.tsx](src/ui/GameBoardV2.tsx)
- [src/ui/board/GameBoardV2WithContext.tsx](src/ui/board/GameBoardV2WithContext.tsx)
- [src/ui/app/networkClients.tsx](src/ui/app/networkClients.tsx)
- [src/ui/styles.css](src/ui/styles.css)

## SEO маршрути

Публічні сторінки, які мають окремі URL:

- `/news` — стартова сторінка; запит до `/` канонізується сюди
- `/games`
- `/cards`
- `/rules`
- `/downloads`
- `/profile`
- `/statistics`

Додатково в `public/` лежать:

- `sitemap.xml`
- `robots.txt`

## Версії та CHANGELOG

Summary релізного коміту — чистий номер `x.y.z.a`, наприклад `0.0.4.27`. `prebuild` синхронізує `package.json` і `package-lock.json` із номером останнього релізного коміту. Старий маркер `v=...` розпізнається лише для сумісності з історією і не використовується для нових комітів.

```bash
npm run version:next
npm run sync:version-from-commit
npm run sync:changelog-shas
npm run check:version-sync
npm run check:changelog-shas
```

`version:next` обчислює наступний номер за Git-історією. `sync:changelog-shas` заповнює фактичні SHA вже створених комітів у `CHANGELOG.md`; SHA найновішого запису з'являється після створення наступного коміту.

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

Повне production-оновлення з адмінки виконує:

1. обов'язковий production backup;
2. безпечний Git stash локальних змін, якщо оператор це дозволив;
3. `git pull --ff-only`;
4. `npm ci --include=dev`;
5. повний `npm run check:release`;
6. `npm run db:migrate`;
7. `npm run sync:shared-config-db`;
8. PM2 restart і health check.

Адмінка показує завершені та активний етапи процесу через endpoint прогресу deployment.

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

Важливо: `/news`, `/games`, `/cards`, `/rules`, `/downloads`, `/profile`, `/statistics` мають залишатися frontend-роутами і не повинні прокситись у backend як API-маски. У backend прокситься `/api/*` та `/socket.io/*`.

## Безпека і runtime policy

Реально застосовуються:

- rate limits на admin/import/upload routes
- admin auth
- payload size limits для JSON / import / image upload
- runtime validation для production env

Admin auth не вимикається конфігураційними прапорцями. Backend-порт не слід відкривати напряму назовні — production працює через reverse proxy.

## Структура проєкту

Код:

- `src/` - frontend UI + клієнтська логіка гри
- `server/` - backend routes / services / runtime bootstrap
- `server/db/` - PostgreSQL helpers / migrations
- `server/storage/shared-config/` - PostgreSQL storage і синхронізація дозволених JSON mirrors
- `db/schema/` - SQL schema
- `db/migrations/` - SQL migrations
- `tests/` - unit/invariant/config/simulation tests
- `docs/` - ops + dev docs

Runtime data:

- `database/` - JSON mirrors і локальні службові конфігурації; production content зберігається у PostgreSQL
- `public/card-assets/` - фізичні зображення карт, що видаються через `/api/card-assets/*`
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
