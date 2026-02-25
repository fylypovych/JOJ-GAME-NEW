# Deployment Hardening (Open Test)

## Goal

Expose the game for open testing without directly exposing internal dev/service ports.

## Port Exposure Rule

- Publicly expose only `80` and `443`.
- Do not expose `5173`, `4173`, or `8000` to the internet.
- Put a reverse proxy (Nginx/Caddy) in front of the web app and game server.

## Recommended Topology

- Reverse proxy (`80/443`) -> frontend (`127.0.0.1:4173`)
- Reverse proxy (`80/443`) -> API/game server (`127.0.0.1:8000`)
- Admin access protected separately (token/auth; checklist item 3)

## Firewall (Windows Server)

1. Allow inbound `80` and `443`.
2. Allow admin access port(s) only from trusted IPs (RDP/SSH/VPN).
3. Block public inbound access to `8000`, `4173`, `5173`.

Example PowerShell (adjust to your environment):

```powershell
New-NetFirewallRule -DisplayName "JOJ HTTP" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80
New-NetFirewallRule -DisplayName "JOJ HTTPS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443
New-NetFirewallRule -DisplayName "JOJ Block Boardgame Server Public" -Direction Inbound -Action Block -Protocol TCP -LocalPort 8000
New-NetFirewallRule -DisplayName "JOJ Block Vite Preview Public" -Direction Inbound -Action Block -Protocol TCP -LocalPort 4173
New-NetFirewallRule -DisplayName "JOJ Block Vite Dev Public" -Direction Inbound -Action Block -Protocol TCP -LocalPort 5173
```

## Firewall (Linux / UFW)

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 8000/tcp
sudo ufw deny 4173/tcp
sudo ufw deny 5173/tcp
```

## Reverse Proxy Notes

- Proxy `/api` and boardgame.io endpoints to `127.0.0.1:8000`.
- Proxy frontend routes to `127.0.0.1:4173`.
- Enable HTTPS and HTTP->HTTPS redirect.
- Preserve client IP via `X-Forwarded-For` (backend rate limiting uses it when present).

## Validation Checklist

- `https://your-domain/` opens the game UI.
- `https://your-domain/api/health` returns `ok: true`.
- Direct access to `http://your-domain:8000` is blocked.
- Direct access to `http://your-domain:4173` is blocked.
- PM2 processes restart automatically after crash/reboot.
