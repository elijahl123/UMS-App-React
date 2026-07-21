#!/usr/bin/env bash
set -euo pipefail

plist_path="${GOOGLE_SERVICE_INFO_PLIST:-${1:-}}"

plist_value() {
  /usr/libexec/PlistBuddy -c "Print :$1" "$plist_path" 2>/dev/null || true
}

if [ -n "$plist_path" ]; then
  if [ ! -f "$plist_path" ]; then
    echo "GoogleService-Info.plist not found: $plist_path" >&2
    exit 1
  fi

  firebase_api_key="$(plist_value API_KEY)"
  ios_bundle_id="$(plist_value BUNDLE_ID)"
  ios_client_id="$(plist_value CLIENT_ID)"
  ios_reversed_client_id="$(plist_value REVERSED_CLIENT_ID)"

  if [ -z "$firebase_api_key" ] || [ -z "$ios_bundle_id" ] || [ -z "$ios_client_id" ] || [ -z "$ios_reversed_client_id" ]; then
    echo "GoogleService-Info.plist is missing one of: API_KEY, BUNDLE_ID, CLIENT_ID, REVERSED_CLIENT_ID" >&2
    exit 1
  fi

  export GOOGLE_SERVICE_INFO_PLIST="$plist_path"
  export VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY:-$firebase_api_key}"
  export VITE_GOOGLE_IOS_CLIENT_ID="${VITE_GOOGLE_IOS_CLIENT_ID:-$ios_client_id}"
  export VITE_GOOGLE_IOS_REVERSED_CLIENT_ID="${VITE_GOOGLE_IOS_REVERSED_CLIENT_ID:-$ios_reversed_client_id}"
  echo "Syncing production iOS build for bundle id: $ios_bundle_id"
elif [ -z "${VITE_FIREBASE_API_KEY:-}" ] || [ -z "${VITE_GOOGLE_IOS_CLIENT_ID:-}" ]; then
  echo "Usage: GOOGLE_SERVICE_INFO_PLIST=/path/to/production-GoogleService-Info.plist npm run ios:sync:production" >&2
  echo "   or set VITE_FIREBASE_API_KEY, VITE_GOOGLE_IOS_CLIENT_ID, and optionally VITE_GOOGLE_IOS_REVERSED_CLIENT_ID." >&2
  exit 1
else
  echo "Syncing production iOS build from environment variables"
fi

if [ -z "${VITE_GOOGLE_IOS_REVERSED_CLIENT_ID:-}" ] && [[ "${VITE_GOOGLE_IOS_CLIENT_ID:-}" == *.apps.googleusercontent.com ]]; then
  export VITE_GOOGLE_IOS_REVERSED_CLIENT_ID="com.googleusercontent.apps.${VITE_GOOGLE_IOS_CLIENT_ID%.apps.googleusercontent.com}"
fi

export VITE_APP_ENV="${VITE_APP_ENV:-production}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://app.untitledmanagementsoftware.com/api}"
export VITE_GOOGLE_REDIRECT_URI="${VITE_GOOGLE_REDIRECT_URI:-}"
export VITE_STAGING_ACCESS_CONTROL_ENABLED="${VITE_STAGING_ACCESS_CONTROL_ENABLED:-false}"

echo "Using production API base URL: $VITE_API_BASE_URL"

if command -v curl >/dev/null 2>&1; then
  billing_config_status="$(
    curl -sS -o /dev/null -w "%{http_code}" \
      -H "Origin: capacitor://localhost" \
      "$VITE_API_BASE_URL/billing/config" || true
  )"

  if [ "$billing_config_status" != "200" ]; then
    echo "Production API did not allow the native iOS origin for billing config." >&2
    echo "Expected 200 from: $VITE_API_BASE_URL/billing/config" >&2
    echo "Got HTTP status: $billing_config_status" >&2
    echo "Check production APP_ORIGINS includes capacitor://localhost, then restart the API service." >&2
    exit 1
  fi
fi

npm run cap:sync

if ! grep -R --fixed-strings "$VITE_API_BASE_URL" ios/App/App/public/assets >/dev/null 2>&1; then
  echo "Production API base URL was not found in the generated iOS bundle." >&2
  echo "Expected: $VITE_API_BASE_URL" >&2
  exit 1
fi
