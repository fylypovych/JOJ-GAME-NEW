## Runtime Config Policy

This project treats runtime environment settings as part of deployment safety, not as ad-hoc local tweaks.

### Required Production Rules

- `ADMIN_TOKEN` must be set in production.
- Starting without admin auth in production is blocked by default.
- `ALLOW_INSECURE_ADMIN=1` is the only explicit override for temporary unsafe environments.
- `STORAGE_MODE` must be one of `file`, `postgres`, or `db` (`db` is normalized to `postgres`).
- `DATABASE_URL` is required whenever `STORAGE_MODE=postgres`.

### Recommended Operational Rules

- Prefer `.env` over editing `ecosystem.config.cjs` or `vite.config.ts` directly.
- After changing `.env`, restart with:
  - `pm2 restart joj-game-server joj-game-web --update-env`
- Keep `joj-game-server` private behind a reverse proxy.
- Use `FRONTEND_ORIGIN` explicitly for LAN/public testing instead of relying on defaults.

### CI / Verification Gates

- `npm run typecheck`
- `npm test`
- `npm run test:invariants`
- `npm run test:config`
- `npm run test:simulation`
- `npm run build`

### Unsafe Modes

These are acceptable only for local development or tightly controlled temporary test environments:

- empty `ADMIN_TOKEN`
- `ALLOW_INSECURE_ADMIN=1`
- exposing server ports directly without a reverse proxy

If any of these are enabled outside local development, treat it as a deployment misconfiguration.
