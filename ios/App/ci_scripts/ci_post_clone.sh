#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="${CI_PRIMARY_REPOSITORY_PATH:-$(git -C "$script_dir" rev-parse --show-toplevel)}"
cd "$repo_root"

ensure_node() {
  if command -v npm >/dev/null 2>&1; then
    return
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo "npm is required for the Xcode Cloud Capacitor build, and curl is not available to install Node." >&2
    exit 1
  fi

  local node_version="22.13.1"
  local machine_arch
  local node_arch
  local install_dir
  machine_arch="$(uname -m)"

  case "$machine_arch" in
    arm64) node_arch="arm64" ;;
    x86_64) node_arch="x64" ;;
    *)
      echo "Unsupported macOS architecture for Node bootstrap: $machine_arch" >&2
      exit 1
      ;;
  esac

  install_dir="${HOME}/.local/node-v${node_version}-darwin-${node_arch}"

  if [ ! -x "${install_dir}/bin/npm" ]; then
    echo "Installing Node v${node_version} for ${node_arch}"
    mkdir -p "${HOME}/.local"
    curl -fsSL "https://nodejs.org/dist/v${node_version}/node-v${node_version}-darwin-${node_arch}.tar.gz" \
      | tar -xz -C "${HOME}/.local"
  fi

  export PATH="${install_dir}/bin:${PATH}"
}

ensure_node

write_info_plist() {
  local plist_path="ios/App/App/Info.plist"
  local ios_url_scheme="${VITE_GOOGLE_IOS_REVERSED_CLIENT_ID:-YOUR_GOOGLE_IOS_REVERSED_OAUTH_CLIENT_ID}"

  mkdir -p "$(dirname "$plist_path")"
  cat > "$plist_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>Untitled Management Software</string>
	<key>CFBundleExecutable</key>
	<string>\$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>\$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>\$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>\$(MARKETING_VERSION)</string>
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>${ios_url_scheme}</string>
			</array>
		</dict>
	</array>
	<key>CFBundleVersion</key>
	<string>\$(CURRENT_PROJECT_VERSION)</string>
	<key>LSRequiresIPhoneOS</key>
	<true/>
	<key>UILaunchStoryboardName</key>
	<string>LaunchScreen</string>
	<key>UIMainStoryboardFile</key>
	<string>Main</string>
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>armv7</string>
	</array>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
	</array>
	<key>UISupportedInterfaceOrientations~ipad</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationPortraitUpsideDown</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>UIViewControllerBasedStatusBarAppearance</key>
	<true/>
	<key>CAPACITOR_DEBUG</key>
	<string>\$(CAPACITOR_DEBUG)</string>
</dict>
</plist>
PLIST

  /usr/bin/plutil -lint "$plist_path"
}

echo "Xcode Cloud repository root: $repo_root"
echo "Node: $(command -v node || true) $(node --version 2>/dev/null || true)"
echo "npm: $(command -v npm || true) $(npm --version 2>/dev/null || true)"

echo "Installing Node dependencies for Capacitor Swift packages"
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required for the Xcode Cloud Capacitor build, but it was not found." >&2
  exit 1
fi

npm ci

for package_path in \
  node_modules/@capacitor/app \
  node_modules/@capacitor/browser \
  node_modules/@capacitor/local-notifications
do
  if [ ! -d "$package_path" ]; then
    echo "Required Capacitor package was not installed: $package_path" >&2
    exit 1
  fi
done

if [ -n "${VITE_FIREBASE_API_KEY:-}" ] && [ -n "${VITE_GOOGLE_IOS_CLIENT_ID:-}" ]; then
  echo "Building production web assets for Capacitor"
  export VITE_APP_ENV="${VITE_APP_ENV:-production}"
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://app.untitledmanagementsoftware.com/api}"
  export VITE_GOOGLE_REDIRECT_URI="${VITE_GOOGLE_REDIRECT_URI:-}"
  export VITE_STAGING_ACCESS_CONTROL_ENABLED="${VITE_STAGING_ACCESS_CONTROL_ENABLED:-false}"

  if [ -z "${VITE_GOOGLE_IOS_REVERSED_CLIENT_ID:-}" ] && [[ "$VITE_GOOGLE_IOS_CLIENT_ID" == *.apps.googleusercontent.com ]]; then
    export VITE_GOOGLE_IOS_REVERSED_CLIENT_ID="com.googleusercontent.apps.${VITE_GOOGLE_IOS_CLIENT_ID%.apps.googleusercontent.com}"
  fi

  npm run build
  npm run clean:apple-metadata
else
  echo "VITE_FIREBASE_API_KEY or VITE_GOOGLE_IOS_CLIENT_ID is not set; using committed web assets"
fi

echo "Writing generated iOS Info.plist"
write_info_plist

echo "Refreshing Capacitor iOS package metadata"
npx cap sync ios
