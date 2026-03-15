@description('Client code used in resource naming')
param clientCode string

@description('Azure region for deployment')
param location string

@description('Log Analytics workspace ID for diagnostics')
param logAnalyticsWorkspaceId string = ''

@description('Resource tags')
param tags object = {}

var automationAccountName = 'aa-csp-${clientCode}'

resource automationAccount 'Microsoft.Automation/automationAccounts@2023-11-01' = {
  name: automationAccountName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    sku: {
      name: 'Basic'
    }
    publicNetworkAccess: true
  }
}

// PnP.PowerShell for PS 7.2 runtime (Az modules are sandbox built-ins — do NOT install custom copies)
resource pnpModule 'Microsoft.Automation/automationAccounts/powershell72Modules@2023-11-01' = {
  parent: automationAccount
  name: 'PnP.PowerShell'
  properties: {
    contentLink: {
      uri: 'https://www.powershellgallery.com/api/v2/package/PnP.PowerShell/2.12.0'
    }
  }
}

// Automation Variables (configuration)
var automationVariables = [
  { name: 'ExpireAfterDays', value: '90', description: 'Days after which versions expire' }
  { name: 'MaxMajorVersions', value: '100', description: 'Maximum major versions to keep per file' }
  { name: 'BatchSize', value: '500', description: 'Sites per processing batch' }
  { name: 'WaveSize', value: '5', description: 'Concurrent child runbooks per wave' }
  { name: 'DisableSchedule', value: 'false', description: 'Emergency stop for scheduled execution' }
  { name: 'QuotaIncrementGB', value: '25', description: 'GB to add when quota exceeds 90%' }
  { name: 'QuotaAlertThreshold', value: '95', description: 'Percentage threshold for quota alerts' }
  { name: 'StalenessThresholdDays', value: '180', description: 'Days of inactivity for staleness scoring' }
  { name: 'TeamsWebhookUrl', value: '', description: 'Teams incoming webhook URL for notifications' }
  { name: 'NotificationEmail', value: '', description: 'Email for weekly summary and critical alerts' }
  { name: 'SendFromAddress', value: '', description: 'From address for Graph API email notifications (must be a licensed mailbox)' }
  { name: 'KeyVaultName', value: 'kv-csp-${clientCode}', description: 'Key Vault name for SPO credentials' }
  { name: 'StorageAccountName', value: 'stcsp${clientCode}', description: 'Storage account name for Table Storage results' }
  { name: 'AutomationAccountName', value: 'aa-csp-${clientCode}', description: 'Automation account name for child runbook dispatch' }
  { name: 'ScheduleVersionCleanup', value: '', description: 'JSON schedule config for Version Cleanup job' }
  { name: 'ScheduleRecycleBinCleaner', value: '', description: 'JSON schedule config for Recycle Bin Cleaner job' }
  { name: 'ScheduleQuotaManager', value: '', description: 'JSON schedule config for Quota Manager job' }
  { name: 'ScheduleStaleSiteDetector', value: '', description: 'JSON schedule config for Stale Site Detector job' }
]

resource variables 'Microsoft.Automation/automationAccounts/variables@2023-11-01' = [
  for v in automationVariables: {
    parent: automationAccount
    name: v.name
    properties: {
      value: '"${v.value}"'
      description: v.description
      isEncrypted: false
    }
  }
]

// ResourceGroupName variable (uses Bicep function, can't be in the array)
resource resourceGroupNameVar 'Microsoft.Automation/automationAccounts/variables@2023-11-01' = {
  parent: automationAccount
  name: 'ResourceGroupName'
  properties: {
    value: '"${resourceGroup().name}"'
    description: 'Resource group name for storage account lookups'
    isEncrypted: false
  }
}

// Schedules
resource versionCleanupSchedule 'Microsoft.Automation/automationAccounts/schedules@2023-11-01' = {
  parent: automationAccount
  name: 'VersionCleanup-Weekly'
  properties: {
    frequency: 'Week'
    interval: 1
    startTime: '2026-03-15T02:00:00Z'
    timeZone: 'Eastern Standard Time'
    advancedSchedule: {
      weekDays: ['Sunday']
    }
    description: 'Weekly version cleanup — Sunday 2:00 AM ET'
  }
}

resource quotaManagerSchedule 'Microsoft.Automation/automationAccounts/schedules@2023-11-01' = {
  parent: automationAccount
  name: 'QuotaManager-Daily'
  properties: {
    frequency: 'Day'
    interval: 1
    startTime: '2026-03-14T06:00:00Z'
    timeZone: 'Eastern Standard Time'
    description: 'Daily quota check — 6:00 AM ET'
  }
}

resource staleSiteSchedule 'Microsoft.Automation/automationAccounts/schedules@2023-11-01' = {
  parent: automationAccount
  name: 'StaleSiteDetector-Monthly'
  properties: {
    frequency: 'Month'
    interval: 1
    startTime: '2026-04-05T10:00:00Z'
    timeZone: 'Eastern Standard Time'
    advancedSchedule: {
      monthDays: [1]
    }
    description: 'Monthly stale site detection — 1st of month 10:00 AM ET'
  }
}

resource recycleBinSchedule 'Microsoft.Automation/automationAccounts/schedules@2023-11-01' = {
  parent: automationAccount
  name: 'RecycleBinCleaner-Weekly'
  properties: {
    frequency: 'Week'
    interval: 1
    startTime: '2026-03-15T10:00:00Z'
    timeZone: 'Eastern Standard Time'
    advancedSchedule: {
      weekDays: ['Sunday']
    }
    description: 'Weekly recycle bin cleanup — Sunday 10:00 AM ET (after version cleanup)'
  }
}

// Diagnostics
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(logAnalyticsWorkspaceId)) {
  name: '${automationAccountName}-diag'
  scope: automationAccount
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { categoryGroup: 'allLogs', enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

output automationAccountName string = automationAccount.name
output automationAccountId string = automationAccount.id
output principalId string = automationAccount.identity.principalId
