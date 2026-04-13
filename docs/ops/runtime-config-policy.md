## Runtime Config Policy

This project treats runtime environment settings as part of deployment safety, not as ad-hoc local tweaks.

### Required Production Rules

- `ADMIN_TOKEN` must be set in production.
- `DATABASE_URL` must be set in production (required for user auth/profiles).
- `FRONTEND_ORIGIN` must be set in production.
- `NODE_ENV` must be set to `production` in production.
- `TRUST_PROXY` should be set to `true` when running behind a reverse proxy.
- `STORAGE_MODE` must be one of `file`, `postgres`, or `db` (`db` is normalized to `postgres`).
- Starting without admin auth in production is blocked.
- Legacy admin auth overrides `DISABLE_ADMIN_AUTH` and `ALLOW_INSECURE_ADMIN` are no longer supported and are ignored.

### Recommended Operational Rules

- Prefer `.env` over editing `ecosystem.config.cjs` or `vite.config.ts` directly.
- After changing `.env`, restart with:
  - `pm2 restart joj-game-server joj-game-web --update-env`
- Keep `joj-game-server` private behind a reverse proxy.
- Use `FRONTEND_ORIGIN` explicitly for LAN/public testing instead of relying on defaults.
- Set `TRUST_PROXY=true` when using a reverse proxy to preserve client IPs for rate limiting.

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
- empty `DATABASE_URL`
- empty `FRONTEND_ORIGIN`
- exposing server ports directly without a reverse proxy
- `TRUST_PROXY=false` when behind a reverse proxy

### Removed Legacy Flags

- `DISABLE_ADMIN_AUTH`
- `ALLOW_INSECURE_ADMIN`

If these flags are still present in old `.env` or PM2 configs, remove them. They no longer affect runtime behavior.

If any of these are enabled outside local development, treat it as a deployment misconfiguration.
