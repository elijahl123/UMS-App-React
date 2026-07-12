#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "package.json" ]]; then
  echo "Run this from the UMS-App-React app directory." >&2
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

set_env APP_ENV "production"
set_env STAGING_ACCESS_CONTROL_ENABLED "false"
set_env VITE_APP_ENV "production"
set_env VITE_STAGING_ACCESS_CONTROL_ENABLED "false"

echo "Updated $ENV_FILE so staging access control is disabled."
echo "Rebuild/restart the app for build-time Vite values to take effect."
