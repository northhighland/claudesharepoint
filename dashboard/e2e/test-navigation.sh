#!/bin/bash
# Navigation E2E Tests — verify all pages load and sidebar nav works
# Usage: bash dashboard/e2e/test-navigation.sh
set -euo pipefail

BASE_URL="https://yellow-cliff-0c765ea0f.4.azurestaticapps.net"
PASS=0
FAIL=0
AUTH_STATE="dashboard/e2e/auth.json"

# Extract result value from playwright-cli eval markdown output
run_js() {
  playwright-cli eval "$1" 2>&1 | grep -A1 '### Result' | tail -1 | sed 's/^"//;s/"$//'
}

nav_click() {
  playwright-cli run-code "async page => await page.getByRole('link', { name: '$1' }).click()" > /dev/null 2>&1
  # Wait for client-side navigation
  playwright-cli run-code "async page => await page.waitForTimeout(1000)" > /dev/null 2>&1
}

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -qi "$expected"; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Navigation Tests ==="
echo ""

# Open browser, load auth, then navigate
playwright-cli open > /dev/null 2>&1
if [ -f "$AUTH_STATE" ]; then
  playwright-cli state-load "$AUTH_STATE" > /dev/null 2>&1
fi
playwright-cli goto "$BASE_URL" > /dev/null 2>&1
# Wait for SPA to hydrate
playwright-cli run-code "async page => await page.waitForTimeout(2000)" > /dev/null 2>&1

# Test 1: Overview page loads
echo "[1/6] Overview page"
TITLE=$(run_js "document.title")
check "Page title contains 'claudesharepoint'" "claudesharepoint" "$TITLE"
CONTENT=$(run_js "document.body.textContent")
check "Impact Dashboard heading visible" "Impact Dashboard" "$CONTENT"
check "Storage Reclaimed card present" "Storage Reclaimed" "$CONTENT"

# Test 2: Navigate to Jobs
echo "[2/6] Jobs page"
nav_click "Jobs"
CONTENT=$(run_js "document.body.textContent")
check "Jobs content visible" "Jobs" "$CONTENT"
HAS_TABLE=$(run_js "!!document.querySelector('table')")
check "Jobs table present" "true" "$HAS_TABLE"

# Test 3: Navigate to Quota
echo "[3/6] Quota page"
nav_click "Quota"
CONTENT=$(run_js "document.body.textContent")
check "Quota content visible" "Quota" "$CONTENT"

# Test 4: Navigate to Stale Sites
echo "[4/6] Stale Sites page"
nav_click "Stale Sites"
CONTENT=$(run_js "document.body.textContent")
check "Stale Sites content visible" "Stale" "$CONTENT"

# Test 5: Navigate to Settings
echo "[5/6] Settings page"
nav_click "Settings"
CONTENT=$(run_js "document.body.textContent")
check "Settings content visible" "Settings" "$CONTENT"
HAS_INPUT=$(run_js "!!document.querySelector('input')")
check "Settings form inputs present" "true" "$HAS_INPUT"

# Test 6: Navigate back to Overview
echo "[6/6] Back to Overview"
nav_click "Overview"
CONTENT=$(run_js "document.body.textContent")
check "Back at Impact Dashboard" "Impact Dashboard" "$CONTENT"

# Close browser
playwright-cli close > /dev/null 2>&1

# Summary
echo ""
echo "=== Navigation Results: $PASS passed, $FAIL failed ==="
exit $FAIL
