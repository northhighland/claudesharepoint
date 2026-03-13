# SharePoint Space Agent — Client Operations Runbook

> Your organization's SharePoint storage management is now automated.
> This guide covers day-to-day operations, troubleshooting, and configuration.

---

## Table of Contents

1. [Dashboard Overview](#1-dashboard-overview)
2. [Adjusting Settings](#2-adjusting-settings)
3. [Triggering Manual Runs](#3-triggering-manual-runs)
4. [Acting on Stale Site Recommendations](#4-acting-on-stale-site-recommendations)
5. [Pausing and Resuming Schedules](#5-pausing-and-resuming-schedules)
6. [Troubleshooting](#6-troubleshooting)
7. [Getting Help](#7-getting-help)
8. [Uninstalling](#8-uninstalling)

---

## 1. Dashboard Overview

Access your dashboard at the URL provided during setup. Sign in with your Azure AD credentials.

### Overview Page

The landing page shows a summary of your SharePoint environment:

- **Total Sites Monitored** — Number of SharePoint sites and Teams sites under management.
- **Total Storage Used** — Aggregate storage consumption across all sites.
- **Reclaimable Storage** — Estimated space that can be recovered through version cleanup and recycle bin management.
- **Health Status** — Green (healthy), Yellow (attention needed), Red (action required).

### Version Cleanup Page

Displays sites with excessive file version history:

- **Site URL** — The SharePoint site.
- **Current Versions** — Total file versions stored.
- **Reclaimable Space** — Storage recoverable by trimming old versions.
- **Last Cleaned** — When the cleanup last ran for this site.
- **Status** — Whether cleanup is scheduled, in progress, or complete.

### Quota Management Page

Shows storage quota utilization:

- **Site URL** — The SharePoint site.
- **Quota** — Allocated storage limit.
- **Used** — Current usage and percentage.
- **Auto-Increased** — Whether the quota was automatically raised and when.
- **Trend** — Usage direction over the past 30 days.

### Stale Sites Page

Lists sites ranked by staleness score:

- **Site URL** — The SharePoint site.
- **Staleness Score** — 0-100 score based on activity, content age, and owner status.
- **Last Activity** — Most recent content modification or user visit.
- **Owner** — Site owner and whether their account is still active.
- **Recommendation** — Suggested action (monitor, contact owner, archive, or review for deletion).

### Recycle Bin Page

Second-stage recycle bin contents across sites:

- **Site URL** — The SharePoint site.
- **Items** — Number of items in the second-stage recycle bin.
- **Size** — Total space consumed.
- **Oldest Item** — Age of the oldest item.
- **Last Cleaned** — When the bin was last emptied.

### Job History Page

Automation run logs:

- **Run ID** — Unique identifier for the job.
- **Job Type** — Which automation ran (Version Cleanup, Quota Manager, etc.).
- **Started / Completed** — Timestamps.
- **Status** — Succeeded, Failed, or In Progress.
- **Sites Processed** — Number of sites handled in that run.
- **Details** — Link to detailed per-site results.

---

## 2. Adjusting Settings

Settings are managed through the Azure Automation Account variables. To change them:

1. Open the **Azure Portal** (https://portal.azure.com).
2. Navigate to your resource group (named `rg-spspace-{your-client-code}`).
3. Open the **Automation Account** (named `aa-spspace-{your-client-code}`).
4. Go to **Shared Resources > Variables**.

### Key Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MaxVersionsToKeep` | `100` | Number of file versions to retain per file during cleanup. |
| `QuotaThresholdPercent` | `90` | Percentage at which auto-increase triggers. |
| `QuotaIncrementGB` | `5` | Amount to increase quota by when threshold is hit. |
| `StaleSiteThresholdDays` | `180` | Days of inactivity before a site is flagged as stale. |
| `RecycleBinRetentionDays` | `30` | Minimum age of recycle bin items before cleanup. |
| `NotificationEmail` | *(set during install)* | Email address for automated alerts. |
| `DryRun` | `false` | Set to `true` to run automations in read-only mode (no changes made). |
| `MaxConcurrentWorkers` | `30` | Number of sites processed in parallel per wave. |

To update a variable:

1. Click the variable name.
2. Update the value.
3. Click **Save**.

Changes take effect on the next scheduled run.

---

## 3. Triggering Manual Runs

To run an automation outside its normal schedule:

### From the Azure Portal

1. Open the **Automation Account** in the Azure Portal.
2. Go to **Process Automation > Runbooks**.
3. Select the runbook you want to run:
   - `Invoke-Orchestrator` — The main entry point.
4. Click **Start**.
5. Set the **JobType** parameter to one of:
   - `VersionCleanup`
   - `QuotaManager`
   - `StaleSiteScan`
   - `RecycleBinCleanup`
6. Optionally set `DryRun` to `true` to preview changes without applying them.
7. Click **OK**.

### From PowerShell

```powershell
# Connect to Azure
Connect-AzAccount

# Start a manual run
$params = @{
    JobType = "VersionCleanup"
    DryRun  = $false
}

Start-AzAutomationRunbook `
    -AutomationAccountName "aa-spspace-{your-client-code}" `
    -ResourceGroupName "rg-spspace-{your-client-code}" `
    -Name "Invoke-Orchestrator" `
    -Parameters $params
```

Monitor progress on the **Job History** page of the dashboard.

---

## 4. Acting on Stale Site Recommendations

The stale site scan identifies sites that may no longer be needed. **No sites are automatically deleted.** All actions require human decision-making.

### Recommended Workflow

1. **Review** the Stale Sites page on the dashboard weekly or monthly.
2. **Sort by staleness score** — focus on scores above 80 first.
3. For each flagged site, decide on one of these actions:
   - **Monitor** — Keep watching. No action now.
   - **Contact Owner** — Reach out to the site owner to confirm if the site is still needed.
   - **Archive** — Export the site content and set it to read-only.
   - **Review for Deletion** — If the owner confirms it is no longer needed, proceed with deletion through your normal governance process.
4. **Document decisions** — Use your organization's change management process.

### Contacting Site Owners

The dashboard shows the site owner's display name and email. Before reaching out:

- Verify the owner's account is still active in Azure AD.
- If the owner has left the organization, identify the appropriate team lead or department head.
- Use a standard template email (ask your North Highland consultant for one if needed).

---

## 5. Pausing and Resuming Schedules

### Pause a Schedule

1. Open the **Automation Account** in the Azure Portal.
2. Go to **Shared Resources > Schedules**.
3. Select the schedule you want to pause:
   - `VersionCleanup-Weekly` — Sunday 2:00 AM
   - `QuotaManager-Daily` — Daily 6:00 AM
   - `StaleSiteScan-Monthly` — 1st of each month
   - `RecycleBinCleanup-Weekly` — Sunday 10:00 AM
4. Toggle **Enabled** to **No**.
5. Click **Save**.

### Resume a Schedule

Follow the same steps but toggle **Enabled** to **Yes**.

### Changing Schedule Times

1. Open the schedule.
2. Update the **Start time**, **Recurrence**, or **Expiration** fields.
3. Click **Save**.

All times are in UTC. Adjust for your local timezone accordingly.

---

## 6. Troubleshooting

### A scheduled job did not run

- Check the schedule is **Enabled** in the Automation Account.
- Verify the Automation Account is running (not in a stopped/deallocated state).
- Check the **Job History** page — the job may have started but failed.
- Ensure the Azure subscription is active and not suspended.

### A job failed

1. Open the failed job in the **Job History** page or the Azure Portal.
2. Check the **Error** output for details.
3. Common failures:
   - **Authentication error** — The certificate may have expired. Check the App Registration certificate expiry date (certificates are valid for 1 year by default).
   - **Throttled by SharePoint** — Too many requests. Reduce `MaxConcurrentWorkers` and retry.
   - **Site not found** — A site may have been deleted or its URL changed.
   - **Insufficient permissions** — The App Registration may be missing required API permissions.
4. After fixing the issue, trigger a manual run to verify.

### Certificate expiry

The self-signed certificate created during setup is valid for 1 year. Before it expires:

1. Generate a new certificate (contact North Highland or run the certificate step of the installer).
2. Upload the new certificate to the App Registration in Azure AD.
3. Upload the new certificate to the Key Vault.
4. The automation will pick up the new certificate on its next run.

### Dashboard is not loading

- Verify the Static Web App is running in the Azure Portal.
- Check if the custom domain (if configured) DNS is pointing correctly.
- Try accessing the default Azure-provided URL instead of any custom domain.
- Clear your browser cache and try an InPrivate/Incognito window.

### Alert emails are not arriving

- Verify the `NotificationEmail` variable in the Automation Account.
- Check your spam/junk folder.
- Confirm the email address is correct and can receive external mail.

---

## 7. Getting Help

### Self-Service Resources

- **Dashboard Job History** — Check recent runs for errors and details.
- **Azure Automation Logs** — In the Azure Portal, open the Automation Account and check **Monitoring > Logs**.
- **This runbook** — Refer to the troubleshooting section above.

### North Highland Support

For issues beyond self-service troubleshooting:

- **Email:** Contact your assigned North Highland consultant (provided during setup).
- **Include in your request:**
  - Your client code and resource group name
  - The error message or screenshot
  - The job run ID (from the dashboard or Azure Portal)
  - When the issue started
  - Any recent changes to your Azure or SharePoint environment

### Emergency: Stopping All Automation

If you need to immediately stop all automated runs:

```powershell
# Disable all schedules at once
Get-AzAutomationSchedule `
    -AutomationAccountName "aa-spspace-{your-client-code}" `
    -ResourceGroupName "rg-spspace-{your-client-code}" |
    ForEach-Object {
        Set-AzAutomationSchedule `
            -AutomationAccountName "aa-spspace-{your-client-code}" `
            -ResourceGroupName "rg-spspace-{your-client-code}" `
            -Name $_.Name `
            -IsEnabled $false
    }
```

This disables all schedules without deleting any configuration. Re-enable them when ready.

---

## 8. Uninstalling

To completely remove the SharePoint Space Agent:

### Step 1: Remove Azure Resources

```powershell
# Connect to Azure
Connect-AzAccount

# Delete the resource group and all contained resources
Remove-AzResourceGroup -Name "rg-spspace-{your-client-code}" -Force
```

This removes the Automation Account, Key Vault, Storage Account, Static Web App, and all associated data.

### Step 2: Remove the App Registration

```powershell
# Find and delete the App Registration
az ad app delete --id "{app-id-from-setup-summary}"
```

The App Registration ID was shown in the setup completion summary. You can also find it in the Azure Portal under **Azure AD > App Registrations**.

### Step 3: Verify Cleanup

1. Confirm the resource group no longer appears in the Azure Portal.
2. Confirm the App Registration no longer appears in Azure AD.
3. No SharePoint data is modified or deleted during uninstall — only the management infrastructure is removed.

### What Is NOT Removed

- SharePoint site content (untouched).
- Any version cleanups or recycle bin emptying already performed (these are permanent).
- Azure AD audit logs of the app's activity (retained per your Azure AD log retention policy).
