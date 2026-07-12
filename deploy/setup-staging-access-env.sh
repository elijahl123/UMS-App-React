#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
ADMIN_EMAILS="${STAGING_ADMIN_EMAILS:-}"
SERVICE_ACCOUNT_JSON="${FIREBASE_SERVICE_ACCOUNT_JSON:-}"

if [[ ! -f "package.json" ]]; then
  echo "Run this from the UMS-App-React app directory." >&2
  exit 1
fi

if [[ -z "$ADMIN_EMAILS" ]]; then
  echo "STAGING_ADMIN_EMAILS is required. Example:" >&2
  echo "  STAGING_ADMIN_EMAILS='you@example.com' $0" >&2
  exit 1
fi

touch "$ENV_FILE"
cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d%H%M%S)"

set_env() {
  local key="$1"
  local value="$2"
  local escaped
  escaped="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"

  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s/^${key}=.*/${key}=${escaped}/" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

set_env APP_ENV "staging"
set_env STAGING_ACCESS_CONTROL_ENABLED "true"
set_env STAGING_ADMIN_EMAILS "$ADMIN_EMAILS"
set_env VITE_APP_ENV "staging"
set_env VITE_STAGING_ACCESS_CONTROL_ENABLED "true"

if [[ -n "$SERVICE_ACCOUNT_JSON" ]]; then
  if [[ ! -f "$SERVICE_ACCOUNT_JSON" ]]; then
    echo "FIREBASE_SERVICE_ACCOUNT_JSON does not point to a readable file: $SERVICE_ACCOUNT_JSON" >&2
    exit 1
  fi

  FIREBASE_PROJECT_ID="$(node -e "console.log(require(process.argv[1]).project_id)" "$SERVICE_ACCOUNT_JSON")"
  FIREBASE_CLIENT_EMAIL="$(node -e "console.log(require(process.argv[1]).client_email)" "$SERVICE_ACCOUNT_JSON")"
  FIREBASE_PRIVATE_KEY="$(node -e "console.log(require(process.argv[1]).private_key.replace(/\\n/g, '\\\\n'))" "$SERVICE_ACCOUNT_JSON")"

  set_env FIREBASE_PROJECT_ID "$FIREBASE_PROJECT_ID"
  set_env FIREBASE_CLIENT_EMAIL "$FIREBASE_CLIENT_EMAIL"
  set_env FIREBASE_PRIVATE_KEY "$FIREBASE_PRIVATE_KEY"
fi

echo "Updated $ENV_FILE for staging access control."
echo "Next: run npm run migrate, rebuild/restart the app, then log in with one of: $ADMIN_EMAILS"
