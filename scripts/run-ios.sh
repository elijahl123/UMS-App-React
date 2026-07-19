#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DEVELOPER_DIR:-}" ] && ! xcrun --find simctl >/dev/null 2>&1 && [ -d "/Applications/Xcode.app/Contents/Developer" ]; then
  export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
fi

scheme="${IOS_SCHEME:-App}"
configuration="${IOS_CONFIGURATION:-Debug}"
derived_base="${IOS_DERIVED_DATA_BASE:-${TMPDIR:-/tmp}/ums-app-react-ios-derived-data}"

target_id="${IOS_TARGET_ID:-}"
if [ -z "$target_id" ]; then
  target_id="$(xcrun simctl list devices booted | sed -nE 's/.*\(([0-9A-F-]{36})\) \(Booted\).*/\1/p' | head -n 1)"
fi

if [ -z "$target_id" ]; then
  target_id="$(xcrun simctl list devices available | awk -F'[()]' '/iPhone 17 \(/ { print $2; exit }')"
fi

if [ -z "$target_id" ]; then
  target_id="$(xcrun simctl list devices available | awk -F'[()]' '/iPhone/ { print $2; exit }')"
fi

if [ -z "$target_id" ]; then
  echo "No available iOS simulator found. Open Xcode and install an iOS simulator runtime, then try again." >&2
  exit 1
fi

derived_data_path="${derived_base}/${target_id}"
app_path="${derived_data_path}/Build/Products/${configuration}-iphonesimulator/${scheme}.app"

npx cap sync ios
npm run clean:apple-metadata

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme "$scheme" \
  -configuration "$configuration" \
  -destination "id=${target_id}" \
  -derivedDataPath "$derived_data_path"

if [ -d "$app_path" ]; then
  find "$app_path" -name .DS_Store -delete
  xattr -cr "$app_path" 2>/dev/null || true
  dot_clean -m "$app_path" 2>/dev/null || true
fi

npx native-run ios --app "$app_path" --target "$target_id"
