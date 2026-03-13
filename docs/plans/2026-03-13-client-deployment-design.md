# Client Deployment — Design Document

**Date:** 2026-03-13
**Status:** Approved — Ready for implementation

## Summary

One-command deployment via Azure Cloud Shell. Client pastes a one-liner, answers 4 questions, approves a consent prompt, and gets a live dashboard with real assessment data in ~10 minutes.

## Entry Point

```powershell
irm https://raw.githubusercontent.com/northhighland/space-agent/main/setup/Install-SpaceAgent.ps1 | iex
```

## Interactive Prompts

- Client code (3-10 chars, e.g. "contoso")
- Azure region (default: eastus)
- Notification email
- SharePoint admin URL

## Steps

| Step | Action | Duration |
|------|--------|----------|
| 1 | Check environment (PS7, Az modules, Global Admin role) | 5s |
| 2 | Deploy Azure resources via Bicep | ~3 min |
| 3 | Create Azure AD app registration with API permissions | 15s |
| 4 | Generate self-signed certificate, upload to Key Vault + app | 15s |
| 5 | Grant admin consent (opens browser, polls for approval) | 30-60s |
| 6 | Upload runbooks + set Automation Variables + link schedules | 30s |
| 7 | Deploy dashboard to Static Web App | ~2 min |
| 8 | Run initial 50-site dry-run assessment, display results | ~3 min |

All steps are idempotent — safe to re-run on failure.

## Client Ownership Post-Deploy

**They can do:**
- View dashboard, adjust settings, trigger manual runs, act on stale site recommendations, pause schedules

**They need us for:**
- Runbook code updates, permission changes, infrastructure changes

**Ongoing cost:** ~$30-50/month

**Uninstall:** `Remove-AzResourceGroup` + `az ad app delete`

## File Structure

```
setup/
├── Install-SpaceAgent.ps1
├── steps/
│   ├── 01-Check-Environment.ps1
│   ├── 02-Deploy-Resources.ps1
│   ├── 03-Create-AppRegistration.ps1
│   ├── 04-Generate-Certificate.ps1
│   ├── 05-Grant-AdminConsent.ps1
│   ├── 06-Upload-Runbooks.ps1
│   ├── 07-Deploy-Dashboard.ps1
│   └── 08-Run-Assessment.ps1
└── helpers/
    ├── Write-StepBanner.ps1
    └── Test-Prerequisites.ps1
```
