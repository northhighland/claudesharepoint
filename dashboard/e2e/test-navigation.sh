#!/bin/bash
# Navigation E2E Tests — verify all pages load and sidebar nav works
# Usage: bash dashboard/e2e/test-navigation.sh
set -euo pipefail

BASE_URL="https://yellow-cliff-0c765ea0f.4.azurestaticapps.net"
PASS=0
FAIL=0
AUTH_STATE="dashboard/e2e/auth.json"

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -qi "$expected"; then
    echo "  PASS: $desc"
    ((PASS++))
  else
    echo "  FAIL: $desc (expected '$expected', got '$actual')"
    ((FAIL++))
  fi
}

echo "=== Navigation Tests ==="
echo ""

# Load auth if available
if [ -f "$AUTH_STATE" ]; then
  playwright-cli state-load "$AUTH_STATE"
fi

# Open browser and go to base URL
playwright-cli open "$BASE_URL"
playwright-cli snapshot --filename=e2e-nav-overview.yaml

# Test 1: Overview page loads
echo "[1/7] Overview page"
TITLE=$(playwright-cli eval "document.title")
check "Page title contains 'claudesharepoint'" "claudesharepoint" "$TITLE"
HEADING=$(playwright-cli eval "document.querySelector('h1')?.textContent || ''")
check "Overview heading visible" "Overview" "$HEADING"

# Test 2: Navigate to Jobs
echo "[2/7] Jobs page"
playwright-cli click --text="Jobs"
playwright-cli snapshot --filename=e2e-nav-jobs.yaml
HEADING=$(playwright-cli eval "document.querySelector('h1')?.textContent || ''")
check "Jobs heading visible" "Jobs" "$HEADING"
HAS_TABLE=$(playwright-cli eval "!!document.querySelector('table')")
check "Jobs table present" "true" "$HAS_TABLE"

# Test 3: Navigate to Version Cleanup
echo "[3/7] Version Cleanup page"
playwright-cli click --text="Version Cleanup"
playwright-cli snapshot --filename=e2e-nav-versions.yaml
HEADING=$(playwright-cli eval "document.querySelector('h1')?.textContent || ''")
check "Version Cleanup heading visible" "Version Cleanup" "$HEADING"

# Test 4: Navigate to Quota
echo "[4/7] Quota page"
playwright-cli click --text="Quota"
playwright-cli snapshot --filename=e2e-nav-quota.yaml
HEADING=$(playwright-cli eval "document.querySelector('h1')?.textContent || ''")
check "Quota heading visible" "Quota" "$HEADING"

# Test 5: Navigate to Stale Sites
echo "[5/7] Stale Sites page"
playwright-cli click --text="Stale Sites"
playwright-cli snapshot --filename=e2e-nav-stale.yaml
HEADING=$(playwright-cli eval "document.querySelector('h1')?.textContent || ''")
check "Stale Sites heading visible" "Stale" "$HEADING"

# Test 6: Navigate to Settings
echo "[6/7] Settings page"
playwright-cli click --text="Settings"
playwright-cli snapshot --filename=e2e-nav-settings.yaml
HEADING=$(playwright-cli eval "document.querySelector('h1')?.textContent || ''")
check "Settings heading visible" "Settings" "$HEADING"
HAS_INPUT=$(playwright-cli eval "!!document.querySelector('input')")
check "Settings form inputs present" "true" "$HAS_INPUT"

# Test 7: Navigate back to Overview
echo "[7/7] Back to Overview"
playwright-cli click --text="Overview"
playwright-cli snapshot --filename=e2e-nav-back-overview.yaml
HEADING=$(playwright-cli eval "document.querySelector('h1')?.textContent || ''")
check "Overview heading after nav round-trip" "Overview" "$HEADING"

# Close browser
playwright-cli close

# Summary
echo ""
echo "=== Navigation Results: $PASS passed, $FAIL failed ==="
exit $FAIL
