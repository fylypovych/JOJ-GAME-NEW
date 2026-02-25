# Open Test Checklist

## Goal

Checklist for moving from local/LAN testing to public/open testing.

## Checklist

- [ ] 1. Domain + HTTPS (reverse proxy: Nginx/Caddy)
- [x] 2. Persistent match storage for `boardgame.io` (survives server restarts)
- [x] 3. Admin auth / access protection for `/admin`
- [x] 4. Move image upload API to backend server (`:8000`)
- [x] 5. Runtime config via `.env` (ports, origins, admin token, etc.)
- [x] 6. Process manager / service supervision (`pm2` / `systemd`)
- [x] 7. Basic ops visibility: health-check + server logs
- [x] 8. Rate limits / payload limits / anti-spam protections
- [x] 9. Firewall and port exposure hardening (prefer only `80/443`)
- [x] 10. Tester-facing docs (run, LAN, admin note, health-check)

## Implemented Now (This Step)

- FlatFile DB for match persistence (`database/matches`)
- Backend upload endpoint `/api/upload-card-image` in `server/index.ts`
- Health endpoint `/api/health`
- File logging to `logs/server.log`
- PM2 config example (`ecosystem.config.cjs`)
- Backend request payload limits + rate limits for admin/import/upload routes
- Firewall / port hardening guide (`DEPLOYMENT_HARDENING.md`)
- Admin token protection for admin APIs + `/admin` login flow (`ADMIN_TOKEN`)
- `.env` runtime loading on server + `.env.example`
- Updated `README.md` with local/LAN/server notes

## Next Recommended

1. Add reverse proxy config (Caddyfile or Nginx) with HTTPS
2. Configure admin auth and firewall rules on the real server
3. Add backup/restore routine for `database/` and `logs/`
