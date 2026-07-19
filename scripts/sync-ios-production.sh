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

export VITE_APP_ENV="${VITE_APP_ENV:-production}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://app.untitledmanagementsoftware.com/api}"
export VITE_GOOGLE_REDIRECT_URI="${VITE_GOOGLE_REDIRECT_URI:-}"
export VITE_STAGING_ACCESS_CONTROL_ENABLED="${VITE_STAGING_ACCESS_CONTROL_ENABLED:-false}"

echo "Using production API base URL: $VITE_API_BASE_URL"
npm run cap:sync
