#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/ums-app-react"
COMPOSE_FILE="$APP_DIR/compose.yaml"
ACTIVE_RELEASE="$APP_DIR/release.env"
PREVIOUS_RELEASE="$APP_DIR/previous-release.env"
ROLLBACK_COPY="$APP_DIR/rollback-release.env"

if ! sudo test -r "$PREVIOUS_RELEASE"; then
  echo "No previous release is available at $PREVIOUS_RELEASE." >&2
  exit 1
fi
if ! sudo test -r "$ACTIVE_RELEASE"; then
  echo "No active release is recorded at $ACTIVE_RELEASE." >&2
  exit 1
fi

ROLLBACK_TAG="$(sudo sed -n 's/^RELEASE_TAG=//p' "$PREVIOUS_RELEASE")"
if [[ "$ROLLBACK_TAG" == staging-* ]]; then
  PUBLIC_BASE_URL="https://dev.untitledmanagementsoftware.com"
elif [[ "$ROLLBACK_TAG" == production-* ]]; then
  PUBLIC_BASE_URL="https://app.untitledmanagementsoftware.com"
else
  echo "Previous release has an invalid tag: $ROLLBACK_TAG" >&2
  exit 1
fi

compose() {
  local release_file="$1"
  shift
  sudo docker compose \
    --project-directory "$APP_DIR" \
    --env-file "$release_file" \
    -f "$COMPOSE_FILE" \
    "$@"
}

sudo cp "$ACTIVE_RELEASE" "$ROLLBACK_COPY"
compose "$PREVIOUS_RELEASE" pull api web
compose "$PREVIOUS_RELEASE" up -d --remove-orphans api web

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null \
    && curl -fsS "$PUBLIC_BASE_URL/api/health" >/dev/null; then
    sudo cp "$PREVIOUS_RELEASE" "$ACTIVE_RELEASE"
    sudo cp "$ROLLBACK_COPY" "$PREVIOUS_RELEASE"
    sudo rm -f "$ROLLBACK_COPY"
    echo "Rollback completed and passed its health check."
    exit 0
  fi
  sleep 2
done

echo "Rollback health check failed; restoring the originally active release." >&2
compose "$ROLLBACK_COPY" pull api web
compose "$ROLLBACK_COPY" up -d --remove-orphans api web
sudo rm -f "$ROLLBACK_COPY"
exit 1
