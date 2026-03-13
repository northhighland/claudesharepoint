# SharePoint Space Agent v2

## Project Overview
Storage management platform for North Highland's SharePoint/Teams environment (7,160+ sites).
Consolidates legacy Phase 1 & 2 scripts into parallelized Azure Automation runbooks with a Next.js monitoring dashboard.

## Tech Stack
- **Runbooks:** PowerShell 7.2+ on Azure Automation
- **Infrastructure:** Bicep (Azure)
- **Dashboard:** Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- **API:** Azure Functions (Static Web Apps managed functions)
- **Storage:** Azure Table Storage + Blob Storage
- **Auth:** Azure AD (MSAL) + Managed Identity

## Commands

### Dashboard
```sh
cd dashboard && npm run dev        # Local dev server
cd dashboard && npm run build      # Production build
cd dashboard && npm run lint       # ESLint
cd dashboard && npx swa start      # Local with Azure Functions API
```

### Infrastructure
```sh
cd infrastructure && pwsh ./deploy.ps1 -SubscriptionId "..." -ResourceGroupName "..." -ClientCode "nh" -Location "eastus"
```

### Runbooks (local testing)
```sh
pwsh ./runbooks/Invoke-Orchestrator.ps1 -JobType VersionCleanup -DryRun
```

## Conventions
- PowerShell: PascalCase functions, `$camelCase` variables, Verb-Noun naming
- TypeScript: camelCase, strict mode, explicit return types on exported functions
- Bicep modules in `infrastructure/modules/`, composed by `main.bicep`
- Worker runbooks accept `$SiteUrls` (JSON array) and `$RunId`
- All workers write results to Azure Table Storage
- Use `-DryRun` flag for safe testing of any runbook

## Resource Naming
Pattern: `{type}-spspace-{clientCode}`
- Automation Account: `aa-spspace-nh`
- Key Vault: `kv-spspace-nh`
- Storage Account: `stspspacenh`
- Static Web App: `swa-spspace-nh`
- Log Analytics: `log-spspace-nh`

## Azure Table Storage Tables
- `JobRuns` — orchestrator job tracking
- `VersionCleanupResults` — per-site version cleanup results
- `QuotaStatus` — quota usage and auto-increase history
- `StaleSiteRecommendations` — staleness scores and admin actions
- `RecycleBinResults` — recycle bin cleanup results

## Key Design Decisions
- Wave-based parallelism (30 concurrent child runbooks) instead of sequential processing
- Azure Table Storage over SQL for cost and simplicity (no relational queries needed)
- Static Web App with managed API instead of separate Function App
- Managed identity + Key Vault for secrets (no stored credentials)
