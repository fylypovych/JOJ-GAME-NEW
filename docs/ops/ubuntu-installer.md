# Ubuntu 24.04 Production Installer

The production installer provisions JOJ Game on a clean Ubuntu Server 24.04 LTS host. It installs Node.js 24, PostgreSQL, Caddy, PM2 and UFW; builds and tests the application; creates the database and initial administrator; configures HTTPS; and enables a daily local backup timer.

## VM baseline

- Ubuntu Server 24.04 LTS (amd64)
- 2 vCPU
- 8 GB RAM
- 60 GB local SSD
- DNS `A`/`AAAA` records pointed at the VM before Caddy requests certificates

Only ports `22`, `80` and `443` are opened. PostgreSQL, Vite preview and the game backend remain private on the host.

## Interactive installation

Clone the repository and run the installer from the checkout:

```bash
sudo mkdir -p /opt/joj-game
sudo git clone <repository-url> /opt/joj-game
sudo bash /opt/joj-game/scripts/install-ubuntu.sh
```

The installer asks for the domain, PostgreSQL connection and initial administrator. Password input is hidden. When run from another checkout, the first installation is copied to `/opt/joj-game`; an existing target checkout is never overwritten automatically.

## Unattended installation

Start from [deploy/install-ubuntu.conf.example](../../deploy/install-ubuntu.conf.example). Keep secrets in separate root-readable files instead of command arguments:

```bash
sudo install -m 600 /dev/null /root/joj-db-password
sudo install -m 600 /dev/null /root/joj-admin-password
sudo editor /root/joj-db-password
sudo editor /root/joj-admin-password
sudo install -m 600 deploy/install-ubuntu.conf.example /root/joj-install.conf
sudo editor /root/joj-install.conf

sudo bash scripts/install-ubuntu.sh \
  --config /root/joj-install.conf \
  --non-interactive \
  --yes
```

`DB_MODE=local` creates or updates the local login role and creates the database if missing. `DB_MODE=remote` requires an existing database and a user that can create the application schema.

## Idempotency and existing data

The installer can be rerun after a failed step. It preserves an existing target checkout, creates schema objects with the repository's idempotent SQL, skips initial administrator creation when an active administrator already exists, and updates PM2/Caddy configuration.

It does update the configured local PostgreSQL role password and rewrites `.env` and `/etc/caddy/Caddyfile` from the answers supplied on each run. Back up an existing production host before changing those values.

## Operations

```bash
sudo joj status
sudo joj health
sudo joj logs server
sudo joj logs web
sudo joj restart
sudo joj backup
```

Daily backups run around 03:15 through `joj-backup.timer` and are retained locally for 14 days by default. Each archive includes a PostgreSQL custom-format dump, runtime JSON/files and card assets.

Local backups do not protect against VM deletion. Configure a separate job or storage agent to copy `/var/backups/joj-game` to storage outside the VM.

## Verification

After installation:

```bash
sudo systemctl status caddy postgresql joj-backup.timer
sudo joj status
sudo joj health
sudo ufw status
curl -I https://your-domain.example
curl https://your-domain.example/api/health
```

If the final health check fails, inspect `sudo joj logs server` and `/var/log/joj-installer.log`.
