#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://dev.untitledmanagementsoftware.com}"

echo "Checking $BASE_URL/api/health"
curl -fsS "$BASE_URL/api/health"
echo

echo "Checking $BASE_URL/api/staging-access/config"
curl -fsS "$BASE_URL/api/staging-access/config"
echo

echo "Checking protected endpoint without a token. A 401 is expected when staging access is enabled."
status="$(curl -s -o /tmp/ums-staging-access-check.json -w "%{http_code}" "$BASE_URL/api/staging-access/me")"
cat /tmp/ums-staging-access-check.json
echo

if [[ "$status" == "401" ]]; then
  echo "OK: protected staging endpoint requires auth."
elif [[ "$status" == "200" ]]; then
  echo "WARNING: endpoint is open. Confirm STAGING_ACCESS_CONTROL_ENABLED=true on staging."
else
  echo "Received HTTP $status. Check server logs if this was unexpected."
fi
