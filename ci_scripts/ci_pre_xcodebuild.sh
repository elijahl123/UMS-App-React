#!/usr/bin/env bash
set -euo pipefail

repo_root="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$repo_root"

echo "Pre-xcodebuild verification"
echo "Repository root: $repo_root"

required_paths=(
  "ios/App/App/Info.plist"
  "ios/App/App/public/index.html"
  "node_modules/@capacitor/app"
  "node_modules/@capacitor/browser"
  "node_modules/@capacitor/local-notifications"
)

for required_path in "${required_paths[@]}"; do
  if [ ! -e "$required_path" ]; then
    echo "Missing required archive input: $required_path" >&2
    exit 1
  fi
  echo "Found: $required_path"
done

/usr/bin/plutil -lint ios/App/App/Info.plist

echo "Bundle identifier:"
/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" ios/App/App/Info.plist

echo "URL schemes:"
/usr/libexec/PlistBuddy -c "Print :CFBundleURLTypes:0:CFBundleURLSchemes" ios/App/App/Info.plist 2>/dev/null || true
