# SharePoint claudesharepoint — Client Handoff Guide

> **Audience:** North Highland consultants deploying the claudesharepoint for a client.
> **Duration:** 45-60 minutes (deploy + walkthrough).

---

## Pre-Call Checklist

Complete these items **before** the kickoff call:

- [ ] Client has an active Azure subscription (confirm subscription ID)
- [ ] Attendee has **Global Administrator** role in Azure AD
- [ ] Attendee has **Owner** or **Contributor** role on the target Azure subscription
- [ ] Attendee has **SharePoint Administrator** role (or Global Admin covers it)
- [ ] Client can access Azure Cloud Shell (https://shell.azure.com) — not blocked by proxy
- [ ] You have the client's SharePoint admin URL (e.g., `https://contoso-admin.sharepoint.com`)
- [ ] You have an email address for automated alert notifications
- [ ] You have confirmed the Azure region preference (default: `eastus`)
- [ ] Agree on a client code (2-10 lowercase alphanumeric characters, e.g., `contoso`)
- [ ] Calendar invite includes a screen-sharing link

---

## During the Call

### Opening (5 minutes)

- Confirm the attendee has the required permissions listed above.
- Explain what will be deployed:
  - An Azure Automation Account with scheduled runbooks for storage management
  - A Key Vault for secure credential storage
  - A Static Web App dashboard for monitoring
  - A certificate-based App Registration for SharePoint access
- Set expectations: the install takes 10-15 minutes, followed by a dashboard walkthrough.

### Running the Installer (10-15 minutes)

1. Ask the client to open **Azure Cloud Shell** at https://shell.azure.com.
2. Ensure they select **PowerShell** (not Bash).
3. Have them paste the install command:

   ```powershell
   irm https://raw.githubusercontent.com/northhighland/claudesharepoint/main/setup/Install-SpaceAgent.ps1 | iex
   ```

4. Walk them through each prompt:
   - **Client code** — Use the agreed-upon value. Explain this becomes part of all resource names.
   - **Azure region** — Press Enter for `eastus` or type their preferred region.
   - **Notification email** — The address that receives automated alerts.
   - **SharePoint admin URL** — Must start with `https://`.
5. At the confirmation prompt, review the summary together before proceeding.
6. During deployment, narrate what each step does. Key talking points:
   - **Step 2 (Deploy Resources):** "This creates the Azure resources. Takes about 3-5 minutes."
   - **Step 3 (App Registration):** "This creates the identity the automation uses to connect to SharePoint."
   - **Step 4 (Certificate):** "A self-signed certificate for secure, passwordless authentication."
   - **Step 5 (Admin Consent):** "This is where you grant the app permissions to read/manage SharePoint."
   - **Step 6 (Runbooks):** "Uploading the automation scripts that do the actual work."
   - **Step 7 (Dashboard):** "Deploying the monitoring web app."
   - **Step 8 (Assessment):** "Running the first scan to establish a baseline."

### Handling the Admin Consent Prompt (Step 5)

This is the step most likely to need client interaction:

- A browser window or URL may appear asking the Global Admin to approve permissions.
- Walk them through what each permission means:
  - **Sites.ReadWrite.All** — Needed to read site metadata and manage storage.
  - **User.Read** — Standard sign-in permission.
- If the consent prompt does not appear:
  - Check that the attendee is signed in as a Global Admin.
  - Try opening the consent URL directly in a new browser tab.
  - If using a restricted browser, try an InPrivate/Incognito window.
  - As a last resort, consent can be granted manually via Azure Portal > Azure AD > App Registrations > API Permissions.

### Handling Deployment Failures

If any step fails, the wizard will offer a retry option.

**Common issues and fixes:**

| Issue | Cause | Fix |
|-------|-------|-----|
| "Subscription not found" | Wrong subscription context | Run `Set-AzContext -SubscriptionId <id>` and retry |
| "Insufficient privileges" | Missing Owner/Contributor role | Have the subscription owner grant access |
| Bicep deployment timeout | Resource provider not registered | Run `Register-AzResourceProvider -ProviderNamespace Microsoft.Automation` and retry |
| App registration fails | Missing Azure AD permissions | Confirm Global Admin role |
| Dashboard deployment hangs | Static Web App region unavailable | Try a different region |

If a step fails repeatedly, note the error message and contact the claudesharepoint engineering team.

### Post-Deploy Dashboard Walkthrough (15-20 minutes)

After the installer completes, open the dashboard URL shown in the summary.

Walk through each section:

1. **Overview Page**
   - Total sites monitored, total storage used, estimated reclaimable space.
   - Explain the health indicators (green/yellow/red).

2. **Version Cleanup**
   - Shows sites with excessive file versions and space that can be recovered.
   - Explain the difference between "reclaimable" and "will be cleaned."
   - Point out the next scheduled run date.

3. **Quota Management**
   - Current quota utilization across all sites.
   - Sites approaching their quota limit.
   - Auto-increase history.

4. **Stale Sites**
   - Sites ranked by staleness score (combination of last activity, content age, owner status).
   - Explain the recommended actions: archive, delete, or contact owner.
   - Emphasize these are recommendations — no automated deletion occurs.

5. **Recycle Bin**
   - Second-stage recycle bin contents and scheduled cleanup.
   - Storage recoverable from emptying recycle bins.

6. **Job History**
   - Recent automation runs with status and duration.
   - How to spot failed runs and what to do about them.

---

## Handoff Points to Cover

Before ending the call, ensure the client understands:

- [ ] **Dashboard access:** Who should have access and how to share the URL
- [ ] **Alert emails:** Confirm the notification address is correct
- [ ] **Schedule timing:** Review the four automated schedules and confirm the times work
- [ ] **Stale site process:** Who reviews stale site recommendations and takes action
- [ ] **Quota thresholds:** Current auto-increase policy and when to escalate
- [ ] **Ongoing costs:** Expected Azure costs (typically $30-50/month for this footprint)
- [ ] **Support contact:** How to reach North Highland if they have questions
- [ ] **Client runbook:** Send or confirm receipt of the `client-runbook.md` document
- [ ] **Uninstall procedure:** Briefly mention the two commands to remove everything

---

## Post-Call Follow-Up

Within 24 hours of the deployment call:

1. Send a summary email with:
   - Dashboard URL
   - Resource group name
   - App Registration details (app ID, not secrets)
   - Link to the client runbook
   - Your contact information for ongoing support
2. Verify the first scheduled run completes successfully (check the next morning).
3. Schedule a one-week follow-up to review initial results and answer questions.
