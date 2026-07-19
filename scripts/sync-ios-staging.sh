#!/usr/bin/env bash
set -euo pipefail

plist_path="${GOOGLE_SERVICE_INFO_PLIST:-${1:-}}"

if [ -z "$plist_path" ]; then
  echo "Usage: GOOGLE_SERVICE_INFO_PLIST=/path/to/GoogleService-Info.plist npm run ios:sync:staging" >&2
  echo "   or: npm run ios:sync:staging -- /path/to/GoogleService-Info.plist" >&2
  exit 1
fi

if [ ! -f "$plist_path" ]; then
  echo "GoogleService-Info.plist not found: $plist_path" >&2
  exit 1
fi

plist_value() {
  /usr/libexec/PlistBuddy -c "Print :$1" "$plist_path" 2>/dev/null || true
}

firebase_api_key="$(plist_value API_KEY)"
ios_bundle_id="$(plist_value BUNDLE_ID)"
ios_client_id="$(plist_value CLIENT_ID)"
ios_reversed_client_id="$(plist_value REVERSED_CLIENT_ID)"

if [ -z "$firebase_api_key" ] || [ -z "$ios_bundle_id" ] || [ -z "$ios_client_id" ] || [ -z "$ios_reversed_client_id" ]; then
  echo "GoogleService-Info.plist is missing one of: API_KEY, BUNDLE_ID, CLIENT_ID, REVERSED_CLIENT_ID" >&2
  exit 1
fi

export GOOGLE_SERVICE_INFO_PLIST="$plist_path"
export VITE_APP_ENV="${VITE_APP_ENV:-staging}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://dev.untitledmanagementsoftware.com/api}"
export VITE_GOOGLE_REDIRECT_URI="${VITE_GOOGLE_REDIRECT_URI:-}"
export VITE_STAGING_ACCESS_CONTROL_ENABLED="${VITE_STAGING_ACCESS_CONTROL_ENABLED:-true}"
export VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY:-$firebase_api_key}"
export VITE_GOOGLE_IOS_CLIENT_ID="${VITE_GOOGLE_IOS_CLIENT_ID:-$ios_client_id}"
export VITE_GOOGLE_IOS_REVERSED_CLIENT_ID="${VITE_GOOGLE_IOS_REVERSED_CLIENT_ID:-$ios_reversed_client_id}"

echo "Syncing staging iOS build for bundle id: $ios_bundle_id"
echo "Using staging API base URL: $VITE_API_BASE_URL"
npm run cap:sync
