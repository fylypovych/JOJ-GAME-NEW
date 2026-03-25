# API Refactor Plan

## Goal

Extract API into a dedicated project layer so the repository has a clear separation between:

```text
client/
server/
api/
  contract/
  client/
```

This refactor is intended to:

- formalize the contract between client and server
- reduce coupling between React/UI code and raw HTTP details
- prepare the codebase for a future standalone Steam client
- make auth, lobby, and profile flows easier to test and evolve

## Scope

The first wave covers only the user-facing online flows that already behave like a stable API:

- auth
- profile
- user lobby

The first wave does not include:

- admin API
- shared config admin tools
- image upload/admin maintenance flows
- boardgame.io internal server implementation details

## Architecture Rules

### `client/`

Contains:

- React app
- UI components
- hooks
- view models
- local browser state

Must not contain:

- raw endpoint payload definitions
- duplicated request/response types that belong to the API contract
- direct scattered `fetch` calls once migration is complete

### `server/`

Contains:

- route handlers
- auth/session implementation
- services
- storage and persistence code
- boardgame.io server integration

Must not contain:

- client-specific state handling
- duplicated API contract types when shared contract types already exist

### `api/contract/`

Contains:

- request DTOs
- response DTOs
- API error shapes
- shared endpoint-oriented types
- optional endpoint constants if useful

Must not contain:

- `fetch`
- React
- Koa context
- DB code
- business logic implementations

### `api/client/`

Contains:

- typed HTTP client wrappers
- CSRF/session transport handling for the web client
- endpoint-specific client modules such as auth/profile/lobby clients

Must not contain:

- React hooks
- UI state
- server route code
- game domain logic unrelated to API transport

## Target Layout

Initial target layout:

```text
client/
  app/
  ui/
  game/

server/
  routes/
  services/
  storage/
  db/

api/
  contract/
    common.ts
    auth.ts
    profile.ts
    lobby.ts
  client/
    http-client.ts
    auth-client.ts
    profile-client.ts
    lobby-client.ts
```

Note: the repo does not need to jump to this layout in one step. The first implementation phase may introduce `api/` while existing code still lives in `src/`.

## Design Principles

1. Contract first, file moves second.
2. Replace implicit contracts with explicit DTOs.
3. Move transport logic out of React hooks.
4. Keep browser-specific auth mechanics isolated in `api/client/`.
5. Do not attempt a full repository reshuffle before the API layer is stable.

## Current Pain Points

The current codebase already exposes a practical API, but it is not yet extracted as a first-class layer.

Observed issues:

- request and response shapes are embedded inside client hooks
- `fetch`, `credentials: 'include'`, and CSRF behavior are handled inside UI-facing code
- route contracts exist in practice but are not centralized
- adding a second client would require reusing or reimplementing browser-oriented transport logic

Primary examples:

- `src/ui/app/useUserAccount.ts`
- `src/ui/app/useLobbySession.ts`
- `server/routes/auth.ts`
- `server/routes/user-lobby.ts`

## Refactor Phases

### Phase 0. Freeze the Target and Conventions

Objective:

- align on the structure `client/server/api/contract/api/client`
- define naming rules and ownership boundaries

Deliverables:

- this document
- team agreement that `api/contract` is the source of truth for request/response shapes

Exit criteria:

- agreed directory structure
- agreed rules for what can and cannot live in each layer

### Phase 1. API Inventory and Contract Audit

Objective:

- inventory current auth/profile/lobby endpoints and capture their real contracts

Tasks:

- list each endpoint, method, request body, response body, and error body
- note which endpoints require cookies
- note which endpoints require CSRF
- distinguish HTTP API from Socket.IO / boardgame.io transport

Endpoints in scope:

- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `POST /api/auth/request-password-reset`
- `POST /api/auth/reset-password`
- `GET /api/profile/me`
- `POST /api/profile/me`
- `GET /api/profile/sessions`
- `POST /api/profile/logout-all`
- `POST /api/profile/logout-session`
- `POST /api/profile/bind-session-match`
- `GET /api/users/profile`
- `POST /api/user-lobby/create-and-join`
- `POST /api/user-lobby/join`

Deliverables:

- complete endpoint inventory
- contract notes for request/response/error shape

Exit criteria:

- every in-scope endpoint is documented and understood before type extraction starts

### Phase 2. Create `api/contract`

Objective:

- create a shared contract layer for the first-wave endpoints

Tasks:

- add `api/contract/common.ts`
- add `api/contract/auth.ts`
- add `api/contract/profile.ts`
- add `api/contract/lobby.ts`

Expected content:

- common API success/error types
- request DTOs
- response DTOs
- reusable shared entities such as session/user profile DTOs

Suggested contract primitives:

- `ApiError`
- `ApiSuccess<T>`
- `CsrfTokenPayload`
- `AuthUserDto`
- `UserSessionDto`
- `LobbySessionDto`

Rules:

- contract types represent the wire format, not internal DB or React state
- contract naming should be endpoint/domain oriented, not route-file oriented

Exit criteria:

- client and server can both import types from `api/contract`

### Phase 3. Create `api/client`

Objective:

- centralize API access into typed client modules

Tasks:

- add `api/client/http-client.ts`
- add `api/client/auth-client.ts`
- add `api/client/profile-client.ts`
- add `api/client/lobby-client.ts`

`http-client.ts` responsibilities:

- base URL handling
- request JSON serialization
- response JSON parsing
- unified error handling
- cookie/session support for browser transport
- CSRF token acquisition and reuse for web flows

Endpoint client responsibilities:

- expose semantic methods such as `login`, `logout`, `getMe`, `updateProfile`, `createAndJoinMatch`
- return typed payloads based on `api/contract`

Exit criteria:

- the project has a reusable API client layer that can be consumed independently from React

### Phase 4. Migrate Web Client Code to `api/client`

Objective:

- remove raw API transport logic from UI hooks

Primary migration targets:

- `src/ui/app/useUserAccount.ts`
- `src/ui/app/useLobbySession.ts`

Tasks:

- replace direct `fetch` usage with `api/client/*`
- keep hooks focused on UI state and orchestration
- stop defining ad hoc payload shapes in hook-local code where shared DTOs exist

Expected outcome:

- React hooks become consumers of the API client rather than owners of HTTP details

Exit criteria:

- user auth/profile/lobby flows work through `api/client`
- no scattered raw endpoint calls remain for migrated flows

### Phase 5. Align Server Routes with `api/contract`

Objective:

- make route handlers explicitly conform to the shared contract layer

Primary migration targets:

- `server/routes/auth.ts`
- `server/routes/user-lobby.ts`

Tasks:

- type request parsing against contract DTOs
- type successful responses against contract DTOs
- normalize error body shape where feasible
- remove silent drift between frontend assumptions and server responses

Important note:

- this phase is about route-level contract alignment, not rewriting server business logic

Exit criteria:

- route handlers clearly implement the shared contract

### Phase 6. Add Contract and Integration Tests

Objective:

- ensure API extraction reduces drift instead of just relocating it

Tasks:

- add tests for `api/client` request/response handling
- add integration tests for auth/profile/lobby routes
- validate success and error shapes
- validate CSRF/session expectations
- validate create/join/bind match flow

Recommended test categories:

- contract shape tests
- route integration tests
- web client smoke tests for migrated flows

Exit criteria:

- contract changes break tests before they break runtime behavior

### Phase 7. Prepare Desktop-Friendly Auth Transport

Objective:

- make future standalone clients possible without dragging browser-only assumptions everywhere

Current constraint:

- user auth currently depends on session cookies and CSRF cookies/headers

Tasks:

- isolate browser-specific session behavior in `api/client`
- define a transport boundary between auth semantics and browser delivery mechanics
- evaluate a future desktop mode such as token-based auth or desktop session transport

Note:

- this phase does not require immediate auth redesign
- it only requires that current browser behavior no longer leaks throughout the client code

Exit criteria:

- future desktop client work can build on the contract layer without depending on React hooks or browser-only plumbing

### Phase 8. Physical Move from `src/` to `client/`

Objective:

- finish the repository-level structure after API extraction has stabilized

Tasks:

- move frontend code from `src/` into `client/`
- update TS config, imports, and Vite paths
- keep the move mostly mechanical

Important note:

- this phase should happen after Phases 2-6, not before

Exit criteria:

- repository layout reflects the agreed architecture with minimal behavioral change

## Implementation Order

Recommended sequence:

1. document contracts
2. create `api/contract`
3. create `api/client`
4. migrate `useUserAccount`
5. migrate `useLobbySession`
6. align `server/routes/auth.ts`
7. align `server/routes/user-lobby.ts`
8. add contract and integration tests
9. move `src/` to `client/`

## Suggested Backlog

### Iteration 1. Contract Foundation

- create `api/contract/common.ts`
- create `api/contract/auth.ts`
- create `api/contract/profile.ts`
- create `api/contract/lobby.ts`
- define common API success/error shapes

### Iteration 2. Client Transport Layer

- create `api/client/http-client.ts`
- implement browser transport with cookies and CSRF handling
- create typed auth/profile/lobby clients

### Iteration 3. Web Client Migration

- refactor `useUserAccount.ts`
- refactor `useLobbySession.ts`
- remove duplicated request/response assumptions from hooks

### Iteration 4. Server Alignment

- update auth routes to use shared contract types
- update user-lobby routes to use shared contract types
- normalize error responses where practical

### Iteration 5. Testing and Stabilization

- add contract tests
- add route integration coverage
- validate no regressions in auth/profile/lobby flows

### Iteration 6. Repository Restructure

- move `src/` to `client/`
- update imports/configs
- keep behavior unchanged

## Risks

- turning `api/` into a mixed dump of contracts, route code, and random utilities
- trying to migrate admin APIs in the same wave and over-expanding the refactor
- moving directories too early and producing a large noisy diff before the contract stabilizes
- over-modeling internal game state as API DTOs instead of limiting the contract to wire-level concerns

## Non-Goals

- rewriting the whole backend
- replacing boardgame.io
- redesigning every endpoint before extracting the contract
- introducing external/public SDK packaging

## Definition of Done

The refactor is complete when:

- `api/contract` is the source of truth for auth/profile/lobby DTOs
- `api/client` is the source of truth for web API calls
- `client/` does not depend on scattered raw `fetch` calls for migrated flows
- `server/` implements the shared contract explicitly
- tests cover the extracted contract and the critical auth/lobby flows
- the repository structure can evolve to `client/server/api` without architectural ambiguity

## Decision Record

Approved target structure:

```text
client/
server/
api/
  contract/
  client/
```

Approved naming decision:

- use `api/client`, not `sdk`

Rationale:

- clearer for the current team
- avoids implying a public third-party SDK
- better reflects an internal typed API access layer
