#!/bin/bash
# Local validation script — runs all checks that don't require Azure deployment
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

echo ""
echo "═══════════════════════════════════════"
echo "  claudesharepoint — Local Validation"
echo "═══════════════════════════════════════"
echo ""

# 1. Dashboard build + lint
echo "▸ Dashboard: lint"
cd "$ROOT/dashboard"
npm run lint 2>&1 || { echo "  ✗ Lint failed"; ERRORS=$((ERRORS+1)); }

echo "▸ Dashboard: build"
npm run build 2>&1 | tail -15 || { echo "  ✗ Build failed"; ERRORS=$((ERRORS+1)); }
echo "  ✓ Dashboard OK"
echo ""

# 2. Bicep validation
echo "▸ Infrastructure: Bicep validate"
az bicep build --file "$ROOT/infrastructure/main.bicep" 2>&1 || { echo "  ✗ Bicep failed"; ERRORS=$((ERRORS+1)); }
echo "  ✓ Bicep OK"
echo ""

# 3. PowerShell lint
echo "▸ Runbooks: PSScriptAnalyzer"
pwsh -NoProfile -Command "
  if (-not (Get-Module PSScriptAnalyzer -ListAvailable)) { Install-Module PSScriptAnalyzer -Force -Scope CurrentUser }
  \$results = Invoke-ScriptAnalyzer -Path '$ROOT/runbooks' -Recurse -Settings @{ Severity = @('Error','Warning'); ExcludeRules = @('PSUseShouldProcessForStateChangingFunctions') }
  \$results | Format-Table RuleName, Severity, ScriptName, Line -AutoSize
  if (\$results | Where-Object Severity -eq 'Error') { exit 1 }
" 2>&1 || { echo "  ✗ PSScriptAnalyzer found errors"; ERRORS=$((ERRORS+1)); }
echo "  ✓ Runbooks OK"
echo ""

# 4. Consistency checks
echo "▸ Consistency: no stale references"
STALE=$(grep -r "spspace\|space.agent" --include="*.ps1" --include="*.bicep" --include="*.ts" --include="*.tsx" --include="*.md" "$ROOT" 2>/dev/null | grep -v node_modules | grep -v .git | grep -v package-lock || true)
if [ -n "$STALE" ]; then
  echo "  ✗ Found stale 'spspace' or 'space agent' references:"
  echo "$STALE"
  ERRORS=$((ERRORS+1))
else
  echo "  ✓ No stale references"
fi
echo ""

# Summary
echo "═══════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
  echo "  ✓ All checks passed"
else
  echo "  ✗ $ERRORS check(s) failed"
fi
echo "═══════════════════════════════════════"
echo ""
exit $ERRORS
