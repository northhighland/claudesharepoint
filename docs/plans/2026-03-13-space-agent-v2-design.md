# claudesharepoint — Design Document

**Date:** 2026-03-13
**Author:** Jason LePage
**Status:** Implementation In Progress

## Problem Statement

North Highland's SharePoint/Teams environment (7,160+ sites) has uncontrolled storage growth. Without the budget for SharePoint Advanced Management, we need a custom solution. The existing Phase 1 & 2 scripts already reclaimed 12+ TB but run sequentially and take days.

## Goals

- Version cleanup: delete versions >90 days old, cap at 100 major versions
- Quota management: auto-increase by 25GB at 90% usage
- Stale site detection: score and recommend sites for deletion
- Auto-permission escalation: add admin access when denied, retry
- Parallel execution: reduce multi-day runs to hours
- Dashboard: real-time monitoring of all automated routines
- Notifications: Teams/email alerts for failures and recommendations

## Architecture

```
Next.js Dashboard (Azure Static Web Apps + Azure AD SSO)
         │
         ▼ Azure Functions API
Azure Table Storage + Blob Storage (results, state, reports)
         ▲
Azure Automation Account
  ├── Orchestrator Runbook (wave-based parallel dispatch)
  ├── Version Cleanup Worker
  ├── Quota Manager Worker
  ├── Stale Site Detector Worker
  └── Recycle Bin Cleaner Worker
```

### Key Design Decisions

1. **Wave-based parallelism over ForEach-Object -Parallel**
   - Azure Automation limits concurrent jobs to 30
   - Orchestrator dispatches child runbooks in waves of 30
   - Each child processes a batch of sites
   - More resilient: individual child failures don't affect others

2. **Azure Table Storage over SQL**
   - No relational queries needed (all queries are partition key + row key)
   - ~$0.05/GB/month vs ~$15/month minimum for Azure SQL
   - Built-in partitioning by JobType/RunId
   - Good enough for the query patterns (latest run, filter by status)

3. **Static Web App with managed functions**
   - Free tier available, Standard at $9/month
   - Built-in Azure AD auth
   - API functions deploy alongside the dashboard
   - No need for a separate Function App

4. **Managed Identity + Key Vault**
   - No stored credentials in runbooks
   - Automation Account system-assigned identity
   - RBAC roles auto-provisioned by Bicep
   - Certificate stored in Key Vault, accessed at runtime

## Scheduling

| Job | Schedule | Estimated Duration |
|-----|----------|--------------------|
| Version Cleanup | Weekly, Sunday 2:00 AM | 5-8 hours |
| Quota Manager | Daily, 6:00 AM | 1-2 hours |
| Stale Site Detector | Monthly, 1st Sunday 10:00 AM | 2-3 hours |
| Recycle Bin Cleaner | Weekly, Sunday 10:00 AM | 1-2 hours |

## Migration from v1

| v1 Pattern | v2 Replacement |
|------------|----------------|
| Sequential site processing | Wave-based parallel child runbooks |
| Blob checkpoint files | Azure Table Storage records |
| CSV reports on local disk | Azure Table Storage + dashboard |
| Manual script execution | Scheduled + dashboard-triggered |
| No monitoring | Real-time dashboard with SWR polling |
| Email reports | Teams webhook + email + dashboard |
