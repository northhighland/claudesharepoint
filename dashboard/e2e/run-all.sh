#!/bin/bash
# Run all E2E tests in sequence
# Usage: bash dashboard/e2e/run-all.sh
#
# Prerequisites:
#   1. playwright-cli installed (npm i -g playwright-cli or npx playwright-cli)
#   2. Auth state saved: playwright-cli open <url> -> log in -> playwright-cli state-save dashboard/e2e/auth.json
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOTAL_PASS=0
TOTAL_FAIL=0
TESTS_RUN=0
TESTS_FAILED=0

run_test() {
  local script="$1"
  local name="$2"
  echo ""
  echo "========================================"
  echo "Running: $name"
  echo "========================================"
  echo ""

  if bash "$script"; then
    echo ""
    echo ">>> $name: ALL PASSED"
  else
    local exit_code=$?
    echo ""
    echo ">>> $name: $exit_code FAILURES"
    ((TESTS_FAILED++))
  fi
  ((TESTS_RUN++))
}

echo "========================================="
echo "  E2E Test Suite — claudesharepoint"
echo "========================================="

# Check for auth state
if [ ! -f "$SCRIPT_DIR/auth.json" ]; then
  echo ""
  echo "WARNING: No auth.json found."
  echo "To create one:"
  echo "  1. playwright-cli open https://yellow-cliff-0c765ea0f.4.azurestaticapps.net"
  echo "  2. Log in via Azure AD"
  echo "  3. playwright-cli state-save dashboard/e2e/auth.json"
  echo "  4. playwright-cli close"
  echo ""
  echo "Continuing without auth (pages may redirect to login)..."
  echo ""
fi

# Run test suites
run_test "$SCRIPT_DIR/test-navigation.sh" "Navigation Tests"
run_test "$SCRIPT_DIR/test-jobs.sh" "Jobs Tests"
run_test "$SCRIPT_DIR/test-versions.sh" "Version Cleanup Tests"

# Final summary
echo ""
echo "========================================="
echo "  FINAL RESULTS"
echo "  Suites run:    $TESTS_RUN"
echo "  Suites failed: $TESTS_FAILED"
echo "========================================="

if [ "$TESTS_FAILED" -gt 0 ]; then
  exit 1
fi
exit 0
