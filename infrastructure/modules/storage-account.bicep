@description('Client code used in resource naming')
param clientCode string

@description('Azure region for deployment')
param location string

// Storage account names: 3-24 chars, lowercase alphanumeric only
var storageAccountName = 'stcsp${clientCode}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
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

// Blob service for reports
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
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

output storageAccountName string = storageAccount.name
output storageAccountId string = storageAccount.id
output tableEndpoint string = storageAccount.properties.primaryEndpoints.table
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
