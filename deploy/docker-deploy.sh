#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-}"
RELEASE_TAG="${2:-}"
APP_DIR="/opt/ums-app-react"
COMPOSE_SOURCE="${COMPOSE_SOURCE:-/tmp/ums-compose.yaml}"
COMPOSE_FILE="$APP_DIR/compose.yaml"
ACTIVE_RELEASE="$APP_DIR/release.env"
PREVIOUS_RELEASE="$APP_DIR/previous-release.env"
CANDIDATE_RELEASE="$APP_DIR/candidate-release.env"
API_IMAGE="ghcr.io/elijahl123/ums-app-react-api"
WEB_IMAGE="ghcr.io/elijahl123/ums-app-react-web"

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  echo "Usage: $0 <staging|production> <environment-commit-sha-tag>" >&2
  exit 2
fi

if [[ ! "$RELEASE_TAG" =~ ^(staging|production)-[0-9a-f]{40}$ ]]; then
  echo "Release tag must be staging-<40-character-sha> or production-<40-character-sha>." >&2
  exit 2
fi

if [[ "$RELEASE_TAG" != "$ENVIRONMENT"-* ]]; then
  echo "Release tag $RELEASE_TAG does not match environment $ENVIRONMENT." >&2
  exit 2
fi

if [[ "$ENVIRONMENT" == "staging" ]]; then
  PUBLIC_BASE_URL="https://dev.untitledmanagementsoftware.com"
else
  PUBLIC_BASE_URL="https://app.untitledmanagementsoftware.com"
fi

ENV_FILE="/etc/ums-app-react/${ENVIRONMENT}.env"
if ! sudo test -r "$ENV_FILE"; then
  echo "Runtime environment file is missing or unreadable: $ENV_FILE" >&2
  exit 1
fi

DB_CA_FILE="/dev/null"
if sudo test -f /etc/ums-app-react/do-postgres-ca.crt; then
  DB_CA_FILE="/etc/ums-app-react/do-postgres-ca.crt"
fi

if [[ ! -r "$COMPOSE_SOURCE" ]]; then
  echo "Compose source is missing or unreadable: $COMPOSE_SOURCE" >&2
  exit 1
fi

sudo install -d -m 0755 "$APP_DIR"
sudo install -m 0644 "$COMPOSE_SOURCE" "$COMPOSE_FILE"

write_release_file() {
  local destination="$1"
  local tag="$2"
  local temporary
  temporary="$(mktemp)"
  {
    echo "API_IMAGE=$API_IMAGE"
    echo "WEB_IMAGE=$WEB_IMAGE"
    echo "RELEASE_TAG=$tag"
    echo "UMS_ENV_FILE=$ENV_FILE"
    echo "UMS_DB_CA_FILE=$DB_CA_FILE"
    echo "WEB_PORT=8080"
  } > "$temporary"
  sudo install -m 0600 "$temporary" "$destination"
  rm -f "$temporary"
}

compose() {
  local release_file="$1"
  shift
  sudo docker compose \
    --project-directory "$APP_DIR" \
    --env-file "$release_file" \
    -f "$COMPOSE_FILE" \
    "$@"
}

wait_for_health() {
  local attempts="${1:-30}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS http://127.0.0.1:8080/api/health >/dev/null \
      && curl -fsS "$PUBLIC_BASE_URL/api/health" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  if ! sudo test -r "$PREVIOUS_RELEASE"; then
    echo "[deploy] no previous release is available for automatic rollback" >&2
    return 1
  fi

  echo "[deploy] restoring previous application images"
  compose "$PREVIOUS_RELEASE" pull api web
  compose "$PREVIOUS_RELEASE" up -d --remove-orphans api web
  if ! wait_for_health 30; then
    echo "[deploy] rollback health check failed" >&2
    compose "$PREVIOUS_RELEASE" ps
    compose "$PREVIOUS_RELEASE" logs --tail=100 api web
    return 1
  fi

  sudo cp "$PREVIOUS_RELEASE" "$ACTIVE_RELEASE"
  echo "[deploy] rollback health check passed"
}

if sudo test -r "$ACTIVE_RELEASE"; then
  sudo cp "$ACTIVE_RELEASE" "$PREVIOUS_RELEASE"
fi
write_release_file "$CANDIDATE_RELEASE" "$RELEASE_TAG"

echo "[deploy] pulling $RELEASE_TAG"
compose "$CANDIDATE_RELEASE" pull api web

echo "[deploy] applying forward-only database migrations"
if ! compose "$CANDIDATE_RELEASE" --profile tools run --rm --no-deps migrate; then
  echo "[deploy] migration failed; the active application was not changed" >&2
  exit 1
fi

echo "[deploy] starting $RELEASE_TAG"
compose "$CANDIDATE_RELEASE" up -d --remove-orphans api web

if ! wait_for_health 30; then
  echo "[deploy] candidate health check failed" >&2
  compose "$CANDIDATE_RELEASE" ps
  compose "$CANDIDATE_RELEASE" logs --tail=100 api web
  rollback || true
  exit 1
fi

sudo cp "$CANDIDATE_RELEASE" "$ACTIVE_RELEASE"
sudo rm -f "$CANDIDATE_RELEASE"
echo "[deploy] $RELEASE_TAG is healthy"

# Remove dangling build layers. Tagged release images remain available for rollback.
sudo docker image prune -f --filter "until=168h" >/dev/null
