#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/ums-app-react"
ENV_FILE="/etc/ums-app-react/production.env"
BRANCH="main"

cd "$APP_DIR"

sudo systemctl stop ums-app-react

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

npm ci

set -a
source "$ENV_FILE"
set +a

npm run migrate
npm run build

sudo systemctl start ums-app-react

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then
    echo "[deploy] health check passed"
    exit 0
  fi

  sleep 1
done

echo "[deploy] health check failed"
sudo journalctl -u ums-app-react -n 100 --no-pager
exit 1