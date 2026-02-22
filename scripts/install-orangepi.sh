#!/usr/bin/env bash
set -euo pipefail

# One-shot install/update helper for Orange Pi / Debian (Armbian).
# Run from project root: `bash scripts/install-orangepi.sh`

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "[1/8] Installing OS packages..."
apt update
apt install -y curl git unzip ufw

echo "[2/8] Installing Node.js 22 (NodeSource)..."
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
else
  echo "Node.js already installed: $(node -v)"
fi

echo "[3/8] Installing PM2..."
npm install -g pm2

echo "[3.1/8] Installing JOJ helper command..."
install -m 0755 "${PROJECT_DIR}/scripts/joj-cli.sh" /usr/local/bin/joj
if [[ ! -e /usr/local/bin/start ]]; then
cat >/usr/local/bin/start <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "joj" ]]; then
  shift
  exec /usr/local/bin/joj start "$@"
fi
echo "Unsupported command. Use: start joj  (or: joj start)" >&2
exit 1
EOF
chmod 0755 /usr/local/bin/start
else
  echo "/usr/local/bin/start already exists, skipping wrapper. Use: joj start"
fi

echo "[4/8] Preparing .env..."
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo "IMPORTANT: edit .env and set ADMIN_TOKEN / FRONTEND_ORIGIN before exposing publicly."
else
  echo ".env already exists, keeping it."
fi

echo "[5/8] Installing npm dependencies..."
npm install

echo "[6/8] Building app (TypeScript + Vite)..."
# On ARM boards `npm run build` can look "silent"; split commands for clearer logs.
npx tsc -b
npx vite build

echo "[7/8] Starting services with PM2..."
pm2 start ecosystem.config.cjs || pm2 restart ecosystem.config.cjs --update-env
pm2 save

echo "[8/8] Opening LAN firewall ports (SSH, 4173, 8000)..."
ufw allow OpenSSH || true
ufw allow 4173/tcp || true
ufw allow 8000/tcp || true

echo
echo "Install complete."
echo "Health check: curl http://127.0.0.1:8000/api/health"
echo "LAN frontend:  http://<orange-pi-lan-ip>:4173"
echo "Helper commands: joj start | joj restart | joj status | joj logs | start joj"
echo "For HTTPS via Caddy: see DEPLOYMENT_HARDENING.md and README.md"
