#!/usr/bin/env bash
set -euo pipefail

repo_root="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$repo_root"

echo "Installing Node dependencies for Capacitor Swift packages"
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required for the Xcode Cloud Capacitor build, but it was not found." >&2
  exit 1
fi

npm ci

echo "Syncing production Capacitor iOS assets"
npm run ios:sync:production
