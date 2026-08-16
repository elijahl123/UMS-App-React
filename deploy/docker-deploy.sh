#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-}"
RELEASE_TAG="${2:-}"
APP_DIR="/opt/ums-app-react"
COMPOSE_SOURCE="${COMPOSE_SOURCE:-/tmp/ums-compose.yaml}"
COMPOSE_FILE="$APP_DIR/compose.yaml"
NGINX_UPLOAD_LIMIT_SOURCE="${NGINX_UPLOAD_LIMIT_SOURCE:-/tmp/ums-nginx-upload-limit.conf}"
NGINX_UPLOAD_LIMIT_CONFIG="/etc/nginx/conf.d/ums-note-images.conf"
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
  PUBLIC_HOST="dev.untitledmanagementsoftware.com"
else
  PUBLIC_BASE_URL="https://app.untitledmanagementsoftware.com"
  PUBLIC_HOST="app.untitledmanagementsoftware.com"
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

if [[ ! -r "$NGINX_UPLOAD_LIMIT_SOURCE" ]]; then
  echo "Nginx upload-limit source is missing or unreadable: $NGINX_UPLOAD_LIMIT_SOURCE" >&2
  exit 1
fi

configure_host_nginx_upload_limit() {
  local work_directory
  local global_backup=""
  local global_existed=false
  local host_pattern="${PUBLIC_HOST//./\\.}"
  local matched_site=false
  local enabled_site target_file backup_file rewritten_file
  local -a changed_targets=()
  local -a changed_backups=()

  work_directory="$(mktemp -d)"
  global_backup="$work_directory/global.conf"

  if sudo test -f "$NGINX_UPLOAD_LIMIT_CONFIG"; then
    sudo cp "$NGINX_UPLOAD_LIMIT_CONFIG" "$global_backup"
    global_existed=true
  fi

  sudo install -d -m 0755 /etc/nginx/conf.d
  sudo install -m 0644 "$NGINX_UPLOAD_LIMIT_SOURCE" "$NGINX_UPLOAD_LIMIT_CONFIG"

  # Older droplets have client_max_body_size in the domain's server block. A
  # server-level value overrides the managed http-level snippet, so reconcile
  # that legacy value without replacing the Certbot-managed site configuration.
  for enabled_site in /etc/nginx/sites-enabled/*; do
    [[ -e "$enabled_site" ]] || continue
    target_file="$(readlink -f "$enabled_site")"
    [[ -n "$target_file" && -f "$target_file" ]] || continue
    if ! sudo grep -Eq "server_name[^;]*${host_pattern}" "$target_file"; then
      continue
    fi
    matched_site=true
    if ! sudo grep -Eq 'client_max_body_size[[:space:]]+[^;]+;' "$target_file"; then
      continue
    fi

    backup_file="$work_directory/site-${#changed_targets[@]}.conf"
    rewritten_file="$work_directory/site-${#changed_targets[@]}.new.conf"
    sudo cp "$target_file" "$backup_file"
    sudo sed -E \
      's/client_max_body_size[[:space:]]+[^;]+;/client_max_body_size 27m;/g' \
      "$target_file" > "$rewritten_file"
    if ! sudo cmp -s "$target_file" "$rewritten_file"; then
      sudo cp "$rewritten_file" "$target_file"
      changed_targets+=("$target_file")
      changed_backups+=("$backup_file")
    fi
  done

  rollback_nginx_upload_limit() {
    local index
    for index in "${!changed_targets[@]}"; do
      sudo cp "${changed_backups[$index]}" "${changed_targets[$index]}"
    done
    if [[ "$global_existed" == true ]]; then
      sudo cp "$global_backup" "$NGINX_UPLOAD_LIMIT_CONFIG"
    else
      sudo rm -f -- "$NGINX_UPLOAD_LIMIT_CONFIG"
    fi
  }

  if ! sudo nginx -t; then
    echo "[deploy] Nginx upload-limit configuration is invalid; restoring the prior configuration" >&2
    rollback_nginx_upload_limit
    sudo nginx -t || true
    sudo rm -r -- "$work_directory"
    return 1
  fi

  if ! sudo systemctl reload nginx; then
    echo "[deploy] Nginx reload failed; restoring the prior configuration" >&2
    rollback_nginx_upload_limit
    sudo nginx -t && sudo systemctl reload nginx || true
    sudo rm -r -- "$work_directory"
    return 1
  fi

  if [[ "$matched_site" == false ]]; then
    echo "[deploy] warning: no enabled Nginx site named $PUBLIC_HOST was found; the global 27m limit was installed" >&2
  fi
  sudo rm -r -- "$work_directory"
  echo "[deploy] host Nginx accepts note-image requests up to 27m"
}

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

verify_note_image_request_size() {
  local test_image response_status
  test_image="$(mktemp)"
  truncate -s 26214400 "$test_image"
  response_status="$(
    curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      --max-time 60 \
      --form "image=@${test_image};type=image/jpeg" \
      "$PUBLIC_BASE_URL/api/note-images" || true
  )"
  rm -f -- "$test_image"

  if [[ "$response_status" != "401" ]]; then
    echo "[deploy] 25 MiB upload-boundary probe returned HTTP ${response_status:-000}; expected 401 from application authentication" >&2
    return 1
  fi
  echo "[deploy] 25 MiB request passed both Nginx request-size boundaries"
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

echo "[deploy] reconciling the host Nginx upload limit"
configure_host_nginx_upload_limit

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

if ! verify_note_image_request_size; then
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
