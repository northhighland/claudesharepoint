# claudesharepoint

Automated storage management for SharePoint Online and Microsoft Teams environments. Reclaims storage through version cleanup, quota management, recycle bin processing, and stale site detection — across thousands of sites in parallel.

Built by [North Highland](https://www.northhighland.com) for deployment to client Azure tenants.

---

## What It Does

| Capability | Description |
|---|---|
| **Version Cleanup** | Trims excess file versions across document libraries, reclaiming TB-scale storage |
| **Quota Management** | Monitors site quotas and auto-increases when thresholds are hit |
| **Stale Site Detection** | Scores sites by activity and recommends archival or deletion |
| **Recycle Bin Cleanup** | Purges aged recycle bin items to free allocated storage |
| **Monitoring Dashboard** | Real-time view of job status, storage trends, and site health |

All operations run as scheduled Azure Automation runbooks with wave-based parallelism (30 concurrent sites per batch).

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Azure Static Web App (Dashboard)                       │
│  Next.js 14 + Tailwind + shadcn/ui                      │
│  ┌──────────────┐                                       │
│  │ Azure Funcs  │  ← API layer (Table Storage + REST)   │
│  └──────────────┘                                       │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│  Azure Automation Account                               │
│  ┌──────────────┐   ┌──────────────────────────────┐    │
│  │ Orchestrator │──▶│ Workers (30 parallel/wave)   │    │
│  └──────────────┘   │  • Version Cleanup           │    │
│                     │  • Quota Manager             │    │
│                     │  • Stale Site Detector        │    │
│                     │  • Recycle Bin Cleaner        │    │
│                     └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
         │                              │
    Key Vault                   Table Storage
   (secrets)                  (results + config)
```

---

## Quick Start (Client Deployment)

Deployment is a single command run during a kickoff call via Azure Cloud Shell:

```powershell
irm https://raw.githubusercontent.com/JasonLePage/claudesharepoint/main/setup/Install-SpaceAgent.ps1 | iex
```

The setup wizard will:
1. Create an Azure AD app registration with certificate auth
2. Deploy all infrastructure (Automation Account, Storage, Key Vault, Static Web App)
3. Upload and schedule runbooks
4. Deploy the monitoring dashboard
5. Run an initial 50-site dry-run assessment

Clients see live data in their dashboard within ~10 minutes.

> See [Client Handoff Guide](docs/client-handoff.md) for the full deployment walkthrough.

---

## Project Structure

```
├── setup/                    # One-command deployment wizard
│   ├── Install-SpaceAgent.ps1
│   ├── steps/                # Modular install steps
│   └── helpers/              # Shared install utilities
├── infrastructure/           # Azure Bicep templates
│   ├── main.bicep
│   ├── modules/              # Automation, Storage, KeyVault, SWA, etc.
│   └── deploy.ps1
├── runbooks/                 # PowerShell 7.2+ automation
│   ├── modules/              # SpaceAgent.psm1 (shared module)
│   ├── config/               # Default thresholds and schedules
│   ├── Invoke-Orchestrator.ps1
│   ├── Invoke-VersionCleanup.ps1
│   ├── Invoke-QuotaManager.ps1
│   ├── Invoke-StaleSiteDetector.ps1
│   └── Invoke-RecycleBinCleaner.ps1
├── dashboard/                # Next.js monitoring UI
│   ├── src/                  # App Router pages + components
│   └── api/                  # Azure Functions (SWA managed)
└── docs/
    ├── client-handoff.md     # NH consultant deployment guide
    └── client-runbook.md     # Client ongoing operations guide
```

---

## Development

### Dashboard

```sh
npm install
npm run dev          # http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
```

### Runbooks (local testing)

```sh
pwsh ./runbooks/Invoke-Orchestrator.ps1 -JobType VersionCleanup -DryRun
```

### Infrastructure

```sh
pwsh ./infrastructure/deploy.ps1 \
  -SubscriptionId "..." \
  -ResourceGroupName "..." \
  -ClientCode "nh" \
  -Location "eastus"
```

---

## Resource Naming Convention

All Azure resources follow: `{type}-spspace-{clientCode}`

| Resource | Example |
|---|---|
| Automation Account | `aa-spspace-contoso` |
| Key Vault | `kv-spspace-contoso` |
| Storage Account | `stspspacecontoso` |
| Static Web App | `swa-spspace-contoso` |
| Log Analytics | `log-spspace-contoso` |

---

## Documentation

- **[Client Handoff Guide](docs/client-handoff.md)** — Step-by-step for NH consultants deploying to a client
- **[Client Operations Runbook](docs/client-runbook.md)** — Day-to-day operations guide for client IT admins

---

## Tech Stack

- **Runbooks:** PowerShell 7.2+ on Azure Automation
- **Infrastructure:** Bicep (Azure IaC)
- **Dashboard:** Next.js 14, Tailwind CSS, shadcn/ui, Recharts, SWR
- **API:** Azure Functions (Static Web Apps managed)
- **Storage:** Azure Table Storage + Blob Storage
- **Auth:** Azure AD (MSAL) + Managed Identity
- **Secrets:** Azure Key Vault

---

## License

Internal use only. Copyright North Highland.
