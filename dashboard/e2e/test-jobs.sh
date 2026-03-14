#!/bin/bash
# Jobs E2E Tests — verify job table, filters, trigger dropdown, and detail view
# Usage: bash dashboard/e2e/test-jobs.sh
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

echo "=== Jobs Tests ==="
echo ""

# Load auth if available
if [ -f "$AUTH_STATE" ]; then
  playwright-cli state-load "$AUTH_STATE"
fi

# Open browser and navigate to Jobs page
playwright-cli open "${BASE_URL}/jobs"
playwright-cli snapshot --filename=e2e-jobs-initial.yaml

# Test 1: Jobs page renders with table headers
echo "[1/6] Jobs table headers"
HEADING=$(playwright-cli eval "document.querySelector('h1')?.textContent || ''")
check "Jobs heading visible" "Jobs" "$HEADING"
HEADERS=$(playwright-cli eval "Array.from(document.querySelectorAll('th')).map(th => th.textContent).join(',')")
check "Type column present" "Type" "$HEADERS"
check "Status column present" "Status" "$HEADERS"
check "Started column present" "Started" "$HEADERS"

# Test 2: Filter by job type
echo "[2/6] Filter by type"
playwright-cli select --text="All Types" "VersionCleanup"
playwright-cli snapshot --filename=e2e-jobs-filter-type.yaml
# Verify filter applied (either shows filtered results or "No jobs found")
PAGE_CONTENT=$(playwright-cli eval "document.body.textContent || ''")
check "Page still renders after type filter" "Jobs" "$PAGE_CONTENT"

# Test 3: Filter by status
echo "[3/6] Filter by status"
playwright-cli select --text="All Types" ""
playwright-cli select --text="All Statuses" "Completed"
playwright-cli snapshot --filename=e2e-jobs-filter-status.yaml
PAGE_CONTENT=$(playwright-cli eval "document.body.textContent || ''")
check "Page still renders after status filter" "Jobs" "$PAGE_CONTENT"

# Test 4: Reset filters
echo "[4/6] Reset filters"
playwright-cli select --text="All Statuses" ""
playwright-cli snapshot --filename=e2e-jobs-reset.yaml

# Test 5: Trigger dropdown shows all job types (read-only — do NOT trigger)
echo "[5/6] Trigger dropdown"
playwright-cli click --text="Trigger Job"
playwright-cli snapshot --filename=e2e-jobs-trigger-dropdown.yaml
DROPDOWN=$(playwright-cli eval "document.body.textContent || ''")
check "Version Cleanup in dropdown" "Version Cleanup" "$DROPDOWN"
check "Quota Manager in dropdown" "Quota Manager" "$DROPDOWN"
check "Stale Site Detector in dropdown" "Stale Site Detector" "$DROPDOWN"
check "Recycle Bin Cleaner in dropdown" "Recycle Bin Cleaner" "$DROPDOWN"
# Dismiss dropdown by clicking elsewhere
playwright-cli press Escape

# Test 6: Job detail view (if rows exist)
echo "[6/6] Job detail view"
HAS_ROWS=$(playwright-cli eval "document.querySelectorAll('tbody tr').length > 0 && !document.querySelector('tbody tr td[colspan]')")
if [ "$HAS_ROWS" = "true" ]; then
  playwright-cli click --selector="tbody tr:first-child"
  playwright-cli snapshot --filename=e2e-jobs-detail.yaml
  DETAIL=$(playwright-cli eval "document.body.textContent || ''")
  check "Detail shows Run ID" "Run ID" "$DETAIL"
  check "Detail shows Started" "Started" "$DETAIL"
  check "Detail shows Space Reclaimed" "Space Reclaimed" "$DETAIL"
  # Go back
  playwright-cli click --text="back" || playwright-cli go-back
else
  echo "  SKIP: No job rows to click into"
fi

# Close browser
playwright-cli close

# Summary
echo ""
echo "=== Jobs Results: $PASS passed, $FAIL failed ==="
exit $FAIL
