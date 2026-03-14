#!/bin/bash
# Jobs E2E Tests — verify job table, filters, trigger dropdown, and detail view
# Usage: bash dashboard/e2e/test-jobs.sh
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

echo "=== Jobs Tests ==="
echo ""

# Open browser, load auth, navigate to Jobs
playwright-cli open > /dev/null 2>&1
if [ -f "$AUTH_STATE" ]; then
  playwright-cli state-load "$AUTH_STATE" > /dev/null 2>&1
fi
playwright-cli goto "${BASE_URL}/jobs" > /dev/null 2>&1
playwright-cli run-code "async page => await page.waitForTimeout(2000)" > /dev/null 2>&1

# Test 1: Jobs page renders with table
echo "[1/5] Jobs page loads"
CONTENT=$(run_js "document.body.textContent")
check "Jobs content visible" "Jobs" "$CONTENT"
HAS_TABLE=$(run_js "!!document.querySelector('table')")
check "Table present" "true" "$HAS_TABLE"
# Check key columns via body text (eval can't handle Array.from().map())
check "Type column present" "Type" "$CONTENT"
check "Status column present" "Status" "$CONTENT"

# Test 2: Filter by type
echo "[2/5] Filter by type"
playwright-cli run-code "async page => { const sel = page.locator('select').first(); await sel.selectOption('VersionCleanup'); await page.waitForTimeout(1000); }" > /dev/null 2>&1
CONTENT=$(run_js "document.body.textContent")
check "Page renders after type filter" "Jobs" "$CONTENT"

# Test 3: Filter by status
echo "[3/5] Filter by status"
playwright-cli run-code "async page => { const sel = page.locator('select').first(); await sel.selectOption(''); const sel2 = page.locator('select').nth(1); await sel2.selectOption('Completed'); await page.waitForTimeout(1000); }" > /dev/null 2>&1
CONTENT=$(run_js "document.body.textContent")
check "Page renders after status filter" "Jobs" "$CONTENT"

# Test 4: Trigger button exists
echo "[4/5] Trigger button"
playwright-cli run-code "async page => { const sel = page.locator('select').nth(1); await sel.selectOption(''); }" > /dev/null 2>&1
HAS_TRIGGER=$(run_js "document.body.textContent.includes('Trigger')")
check "Trigger button present" "true" "$HAS_TRIGGER"

# Test 5: Job detail view (if rows exist)
echo "[5/5] Job detail view"
HAS_ROWS=$(run_js "document.querySelectorAll('tbody tr').length > 0 && !document.querySelector('tbody td[colspan]')")
if [ "$HAS_ROWS" = "true" ]; then
  playwright-cli run-code "async page => { await page.locator('tbody tr').first().click(); await page.waitForTimeout(1500); }" > /dev/null 2>&1
  DETAIL=$(run_js "document.body.textContent")
  check "Detail shows Run ID" "Run ID" "$DETAIL"
  check "Detail shows Started" "Started" "$DETAIL"
  playwright-cli go-back > /dev/null 2>&1
else
  echo "  SKIP: No job rows to click into"
fi

# Close browser
playwright-cli close > /dev/null 2>&1

# Summary
echo ""
echo "=== Jobs Results: $PASS passed, $FAIL failed ==="
exit $FAIL
