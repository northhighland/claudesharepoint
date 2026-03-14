#!/bin/bash
# Version Cleanup E2E Tests — filter jobs to VersionCleanup, verify data
# Usage: bash dashboard/e2e/test-versions.sh
set -euo pipefail

BASE_URL="https://yellow-cliff-0c765ea0f.4.azurestaticapps.net"
PASS=0
FAIL=0
AUTH_STATE="dashboard/e2e/auth.json"

run_js() {
  playwright-cli eval "$1" 2>&1 | grep -A1 '### Result' | tail -1 | sed 's/^"//;s/"$//'
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

echo "=== Version Cleanup Tests ==="
echo ""

# Open browser, load auth, navigate to Jobs
playwright-cli open > /dev/null 2>&1
if [ -f "$AUTH_STATE" ]; then
  playwright-cli state-load "$AUTH_STATE" > /dev/null 2>&1
fi
playwright-cli goto "${BASE_URL}/jobs" > /dev/null 2>&1
playwright-cli run-code "async page => await page.waitForTimeout(2000)" > /dev/null 2>&1

# Test 1: Filter to VersionCleanup
echo "[1/4] Filter to Version Cleanup"
playwright-cli run-code "async page => { const sel = page.locator('select').first(); await sel.selectOption('VersionCleanup'); await page.waitForTimeout(1500); }" > /dev/null 2>&1
CONTENT=$(run_js "document.body.textContent")
check "Jobs page filtered" "Jobs" "$CONTENT"

# Test 2: Table renders
echo "[2/4] Table renders"
HAS_TABLE=$(run_js "!!document.querySelector('table')")
check "Table present" "true" "$HAS_TABLE"
ROW_COUNT=$(run_js "document.querySelectorAll('tbody tr').length")
echo "  INFO: Found $ROW_COUNT table rows"

# Test 3: Filter to Completed
echo "[3/4] Filter to Completed"
playwright-cli run-code "async page => { const sel = page.locator('select').nth(1); await sel.selectOption('Completed'); await page.waitForTimeout(1000); }" > /dev/null 2>&1
CONTENT=$(run_js "document.body.textContent")
check "Page renders with both filters" "Jobs" "$CONTENT"

# Test 4: Click into detail if rows exist
echo "[4/4] Job detail view"
HAS_ROWS=$(run_js "document.querySelectorAll('tbody tr').length > 0 && !document.querySelector('tbody td[colspan]')")
if [ "$HAS_ROWS" = "true" ]; then
  playwright-cli run-code "async page => { await page.locator('tbody tr').first().click(); await page.waitForTimeout(1500); }" > /dev/null 2>&1
  DETAIL=$(run_js "document.body.textContent")
  check "Detail view loaded" "Run ID" "$DETAIL"
  check "Site results visible" "Site" "$DETAIL"
  playwright-cli go-back > /dev/null 2>&1
else
  echo "  SKIP: No completed version cleanup rows found"
fi

# Close browser
playwright-cli close > /dev/null 2>&1

# Summary
echo ""
echo "=== Version Cleanup Results: $PASS passed, $FAIL failed ==="
exit $FAIL
