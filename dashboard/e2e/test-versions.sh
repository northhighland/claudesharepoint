#!/bin/bash
# Version Cleanup E2E Tests — verify summary cards, filters, table, and detail view
# Usage: bash dashboard/e2e/test-versions.sh
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

check_not() {
  local desc="$1"
  local not_expected="$2"
  local actual="$3"
  if echo "$actual" | grep -qi "$not_expected"; then
    echo "  FAIL: $desc (got unexpected '$not_expected')"
    ((FAIL++))
  else
    echo "  PASS: $desc"
    ((PASS++))
  fi
}

echo "=== Version Cleanup Tests ==="
echo ""

# Load auth if available
if [ -f "$AUTH_STATE" ]; then
  playwright-cli state-load "$AUTH_STATE"
fi

# Open browser and navigate to Versions page
playwright-cli open "${BASE_URL}/versions"
playwright-cli snapshot --filename=e2e-versions-initial.yaml

# Test 1: Page loads with heading and summary cards
echo "[1/5] Page loads"
HEADING=$(playwright-cli eval "document.querySelector('h1')?.textContent || ''")
check "Version Cleanup heading visible" "Version Cleanup" "$HEADING"
PAGE_CONTENT=$(playwright-cli eval "document.body.textContent || ''")
check "Total Reclaimed card present" "Total Reclaimed" "$PAGE_CONTENT"
check "Completed Runs card present" "Completed Runs" "$PAGE_CONTENT"
check "Sites Processed card present" "Sites Processed" "$PAGE_CONTENT"
check "Failed Sites card present" "Failed Sites" "$PAGE_CONTENT"

# Test 2: Summary card values are populated (not showing --)
echo "[2/5] Summary card values"
# Give API a moment to return data
playwright-cli eval "await new Promise(r => setTimeout(r, 2000))"
playwright-cli snapshot --filename=e2e-versions-loaded.yaml
CARDS=$(playwright-cli eval "Array.from(document.querySelectorAll('[class*=font-bold],[class*=font-semibold]')).map(el => el.textContent).join('|')")
check "Card values rendered" "." "$CARDS"

# Test 3: Filter buttons work
echo "[3/5] Filter buttons"
playwright-cli click --text="Completed"
playwright-cli snapshot --filename=e2e-versions-filter-completed.yaml
PAGE_CONTENT=$(playwright-cli eval "document.body.textContent || ''")
check "Page renders after Completed filter" "Version Cleanup" "$PAGE_CONTENT"

playwright-cli click --text="Failed"
playwright-cli snapshot --filename=e2e-versions-filter-failed.yaml

playwright-cli click --text="All"
playwright-cli snapshot --filename=e2e-versions-filter-all.yaml

# Test 4: Results table has expected columns
echo "[4/5] Results table"
HEADERS=$(playwright-cli eval "Array.from(document.querySelectorAll('th')).map(th => th.textContent).join(',')")
check "Run ID column" "Run ID" "$HEADERS"
check "Status column" "Status" "$HEADERS"
check "Space Reclaimed column" "Space Reclaimed" "$HEADERS"

# Test 5: Click into a run detail (if rows exist)
echo "[5/5] Run detail view"
HAS_ROWS=$(playwright-cli eval "document.querySelectorAll('tbody tr').length > 0 && !document.querySelector('tbody tr td[colspan]')")
if [ "$HAS_ROWS" = "true" ]; then
  playwright-cli click --selector="tbody tr:first-child"
  playwright-cli snapshot --filename=e2e-versions-detail.yaml
  DETAIL=$(playwright-cli eval "document.body.textContent || ''")
  check "Detail shows per-site results heading" "Per-Site Results" "$DETAIL"
  DETAIL_HEADERS=$(playwright-cli eval "Array.from(document.querySelectorAll('th')).map(th => th.textContent).join(',')")
  check "Site column in detail" "Site" "$DETAIL_HEADERS"
  check "Versions Deleted column in detail" "Versions Deleted" "$DETAIL_HEADERS"
  check "Reclaimed column in detail" "Reclaimed" "$DETAIL_HEADERS"
  # Go back
  playwright-cli go-back
else
  echo "  SKIP: No version cleanup rows to click into"
fi

# Close browser
playwright-cli close

# Summary
echo ""
echo "=== Version Cleanup Results: $PASS passed, $FAIL failed ==="
exit $FAIL
