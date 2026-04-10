# Architecture Snapshot

Актуальна структура проєкту після server/UI cleanup.

## Runtime layers

- `src/game/*`
  - доменна логіка гри, shared config schema, simulation, runtime move handlers
- `src/ui/app/*`
  - app shell, routing, user/lobby/profile flows, shared browser transport
  - `AdminPageContainer.tsx` винесено з `App.tsx` як окремий orchestration layer для admin route
  - `section-helpers.ts` + `sections-gallery-rules.tsx` винесені з `sections.tsx` для декомпозиції user tab screens
- `src/ui/board/*`
  - єдиний board UI runtime
  - `GameBoardV2` є основною реалізацією
  - `GameBoardV1` лишився compatibility wrapper з `uiTheme="v1"`
- `src/ui/admin/*`
  - admin UI
  - hooks зведені через `src/ui/admin/hooks/index.ts`
  - публічний entrypoint для admin UI: `src/ui/admin/index.ts`
- `server/*`
  - Koa/boardgame.io bootstrap, HTTP routes, storage adapters, runtime policy, background sync
  - `services/admin-git-ops.ts`: окремий admin git/deploy route layer
  - `services/http-security.ts`: CSP/CORS middleware factory
  - `services/service-health.ts`: health/readiness payload rules
  - `services/user-store-auth.ts`: auth/session/profile bounded context, відокремлений від match/awards/admin
- `db/migrations/*`
  - production-oriented SQL migrations
- `database/*`
  - file mirrors і локальні runtime конфіги

## Board UI contract

- `src/ui/board/index.ts` є canonical entrypoint для board components.
- `src/ui/app/networkClients.tsx` більше не імпортує `GameBoardV1/V2` напряму з top-level файлів.
- `GameBoardV1` не є окремою реалізацією; це thin compatibility shell над `GameBoardV2`.

## Admin UI contract

- `src/ui/AdminPage.tsx` імпортує tabs/types/hooks через `src/ui/admin/index.ts`.
- Admin hooks розділені логічно:
  - content/config: template, ranks, assets, bug-report/game-ui config
  - users/analytics: users, awards, analytics
  - ops: page actions, git actions, simulation
- Табові label/description maps винесені в `src/ui/admin/page-text-maps.ts`.

## Data ownership

- PostgreSQL:
  - primary runtime store для users, bug reports, awards, analytics, uploaded asset metadata
  - primary source of truth для shared config (fallback на file store не допускається)
- `database/*.json`:
  - file mirrors, local-dev fallbacks, import/export inputs
- `public/card-assets/*`:
  - static binary assets
  - metadata про uploads живе окремо в backend storage

Див. також:

- [runtime-data-policy.md](/c:/prj/JOJ-GAME-NEW/docs/ops/runtime-data-policy.md)
- [api-refactor-plan.md](/c:/prj/JOJ-GAME-NEW/docs/dev/api-refactor-plan.md)

## Next delivery slice

- `security-hardening` (done):
  - destructive `reset --hard/clean -fd` прибрано з admin update/deploy flow
  - file-based GitHub credential persistence вимкнено (тільки SSH/env token status)
- `route-contract` (done):
  - `health/ready` приведені до `routeOk/routeError`
- `ui-decomposition`:
  - дорозрізати `App.tsx`, `AdminPage.tsx`, `sections.tsx` до thin orchestration shells
