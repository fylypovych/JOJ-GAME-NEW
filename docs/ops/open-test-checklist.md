# Open Test Checklist

## Goal

Checklist for moving from local/LAN testing to public/open testing.

## Checklist

- [x] 1. Domain + HTTPS (reverse proxy: Nginx/Caddy)
- [x] 2. Persistent match storage for `boardgame.io` (survives server restarts)
- [x] 3. Admin auth / access protection for `/admin`
- [x] 4. Move image upload API to backend server (`:8000`)
- [x] 5. Runtime config via `.env` (ports, origins, admin token, etc.)
- [x] 6. Process manager / service supervision (`pm2` / `systemd`)
- [x] 7. Basic ops visibility: health-check + server logs
- [x] 8. Rate limits / payload limits / anti-spam protections
- [x] 9. Firewall and port exposure hardening (prefer only `80/443`)
- [x] 10. Tester-facing docs (run, LAN, admin note, health-check)
- [x] 11. PostgreSQL support for shared config and user auth
- [x] 12. User authentication and profile management
- [x] 13. Card gallery (`/cards` or `/gallery`)
- [x] 14. Awards system (`/awards`)
- [x] 15. Statistics page (`/statistics`)

## Implemented Now (This Step)

- FlatFile DB for match persistence (`database/matches`)
- PostgreSQL support for shared deck/ranks config and user authentication
- Backend upload endpoint `/api/upload-card-image` in `server/index.ts`
- Health endpoint `/api/health`
- File logging to `logs/server.log`
- PM2 config example (`ecosystem.config.cjs`)
- Backend request payload limits + rate limits for admin/import/upload routes
- Firewall / port hardening guide (`DEPLOYMENT_HARDENING.md`)
- Admin token protection for admin APIs + `/admin` login flow (`ADMIN_TOKEN`)
- `.env` runtime loading on server + `.env.example`
- Updated `README.md` with local/LAN/server notes
- User authentication with PostgreSQL backend
- User profile management
- Card gallery with category filtering
- Awards system for tracking achievements
- Statistics page for game analytics
- Runtime policy enforcement (ADMIN_TOKEN, DATABASE_URL, FRONTEND_ORIGIN required in production)

## Next Recommended

1. Configure reverse proxy with HTTPS (Caddyfile or Nginx)
2. Configure PostgreSQL for production use
3. Set up automated backup/restore routine for PostgreSQL database
4. Set up automated backup/restore routine for `database/matches` and `logs/`
5. Configure monitoring and alerting for PM2 services
6. Set up SSL/TLS certificate renewal automation
