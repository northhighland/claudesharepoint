@description('Client code used in resource naming')
param clientCode string

@description('Azure region for deployment')
param location string

@description('Log Analytics workspace ID for diagnostics')
param logAnalyticsWorkspaceId string = ''

@description('Resource tags')
param tags object = {}

// Storage account names: 3-24 chars, lowercase alphanumeric only
var storageAccountName = 'stcsp${clientCode}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    publicNetworkAccess: 'Enabled' // Required for SWA managed API and Function App to reach storage
    networkAcls: {
      // Cannot use defaultAction:'Deny' — Azure Automation runbooks use Get-AzAccessToken + REST API
      // to write to Table Storage, which is NOT covered by bypass:'AzureServices' (that only covers
      // first-party Azure service internal calls, not custom bearer-token REST requests).
      // resourceAccessRules also does NOT support Automation Accounts or Function Apps.
      // TODO: Refactor runbooks to use Az.Storage module or Private Endpoints to re-enable Deny.
      defaultAction: 'Allow'
      bypass: 'AzureServices'
      ipRules: []
    }
  }
}

// Table service for structured results
resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

// Tables for each result type
var tableNames = [
  'JobRuns'
  'VersionCleanupResults'
  'QuotaStatus'
  'StaleSiteRecommendations'
  'RecycleBinResults'
]

resource tables 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = [
  for tableName in tableNames: {
    parent: tableService
    name: tableName
  }
]

// Blob service for reports (versioning required by NH policy)
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    isVersioningEnabled: true
  }
}

resource reportsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'reports'
  properties: {
    publicAccess: 'None'
  }
}

resource stateContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'spaceagent-state'
  properties: {
    publicAccess: 'None'
  }
}

// Queue service (required for Functions runtime)
resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

// Diagnostic settings for blob service
resource blobDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(logAnalyticsWorkspaceId)) {
  name: '${storageAccountName}-blob-diag'
  scope: blobService
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { categoryGroup: 'allLogs', enabled: true }
    ]
    metrics: [
      { category: 'Transaction', enabled: true }
    ]
  }
}

// Diagnostic settings for table service
resource tableDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(logAnalyticsWorkspaceId)) {
  name: '${storageAccountName}-table-diag'
  scope: tableService
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { categoryGroup: 'allLogs', enabled: true }
    ]
    metrics: [
      { category: 'Transaction', enabled: true }
    ]
  }
}

// Diagnostic settings for queue service
resource queueDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(logAnalyticsWorkspaceId)) {
  name: '${storageAccountName}-queue-diag'
  scope: queueService
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { categoryGroup: 'allLogs', enabled: true }
    ]
    metrics: [
      { category: 'Transaction', enabled: true }
    ]
  }
}

// Microsoft Defender for Storage
resource defenderForStorage 'Microsoft.Security/defenderForStorageSettings@2022-12-01-preview' = {
  name: 'current'
  scope: storageAccount
  properties: {
    isEnabled: true
    malwareScanning: {
      onUpload: {
        isEnabled: true
        capGBPerMonth: 5000
      }
    }
    sensitiveDataDiscovery: {
      isEnabled: true
    }
    overrideSubscriptionLevelSettings: true
  }
}

// Resource lock — prevent accidental deletion
resource storageAccountLock 'Microsoft.Authorization/locks@2020-05-01' = {
  name: '${storageAccountName}-lock'
  scope: storageAccount
  properties: {
    level: 'CanNotDelete'
    notes: 'Prevent accidental deletion of storage account containing job results and reports'
  }
}

output storageAccountName string = storageAccount.name
output storageAccountId string = storageAccount.id
output tableEndpoint string = storageAccount.properties.primaryEndpoints.table
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
