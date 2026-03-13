@description('Short client identifier (3-10 lowercase alphanumeric)')
@minLength(3)
@maxLength(10)
param clientCode string

@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Enable Storage Account deployment')
param enableStorageAccount bool = true

@description('Enable Log Analytics workspace')
param enableLogAnalytics bool = true

@description('Email for alert notifications (optional)')
param alertRecipients string = ''

@description('Log Analytics retention in days')
@minValue(7)
@maxValue(730)
param logRetentionDays int = 30

// Key Vault
var keyVaultName = 'kv-spspace-${clientCode}'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Log Analytics workspace
var logAnalyticsName = 'log-spspace-${clientCode}'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = if (enableLogAnalytics) {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: logRetentionDays
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// Storage Account module
module storage 'modules/storage-account.bicep' = if (enableStorageAccount) {
  name: 'storage-deployment'
  params: {
    clientCode: clientCode
    location: location
  }
}

// Automation Account module
module automation 'modules/automation-account.bicep' = {
  name: 'automation-deployment'
  params: {
    clientCode: clientCode
    location: location
    logAnalyticsWorkspaceId: enableLogAnalytics ? logAnalytics.id : ''
  }
}

// Static Web App module
module staticWebApp 'modules/static-web-app.bicep' = {
  name: 'static-web-app-deployment'
  params: {
    clientCode: clientCode
    location: location
  }
}

// RBAC: Automation Account managed identity → Key Vault Secrets User
resource kvSecretsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, keyVaultName, 'aa-spspace-${clientCode}', 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: automation.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Automation Account managed identity → Storage Table Data Contributor
resource storageTableRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableStorageAccount) {
  name: guid(resourceGroup().id, 'stspspace${clientCode}', 'aa-spspace-${clientCode}', 'Storage Table Data Contributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
    principalId: automation.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Automation Account managed identity → Storage Blob Data Contributor
resource storageBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableStorageAccount) {
  name: guid(resourceGroup().id, 'stspspace${clientCode}', 'aa-spspace-${clientCode}', 'Storage Blob Data Contributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: automation.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// Alert on automation job failures
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (!empty(alertRecipients)) {
  name: 'ag-spspace-${clientCode}'
  location: 'global'
  properties: {
    groupShortName: 'SpaceAgent'
    enabled: true
    emailReceivers: [
      {
        name: 'AdminEmail'
        emailAddress: alertRecipients
        useCommonAlertSchema: true
      }
    ]
  }
}

resource jobFailureAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(alertRecipients)) {
  name: 'alert-spspace-${clientCode}-jobfailure'
  location: 'global'
  properties: {
    severity: 2
    enabled: true
    scopes: [automation.outputs.automationAccountId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'JobFailures'
          metricName: 'TotalJob'
          metricNamespace: 'Microsoft.Automation/automationAccounts'
          operator: 'GreaterThan'
          threshold: 0
          timeAggregation: 'Total'
          dimensions: [
            {
              name: 'Status'
              operator: 'Include'
              values: ['Failed']
            }
          ]
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
    description: 'Alert when Space Agent automation jobs fail'
  }
}

// Outputs
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output automationAccountName string = automation.outputs.automationAccountName
output automationAccountPrincipalId string = automation.outputs.principalId
output storageAccountName string = enableStorageAccount ? storage.outputs.storageAccountName : ''
output storageTableEndpoint string = enableStorageAccount ? storage.outputs.tableEndpoint : ''
output storageBlobEndpoint string = enableStorageAccount ? storage.outputs.blobEndpoint : ''
output staticWebAppHostname string = staticWebApp.outputs.defaultHostname
output logAnalyticsWorkspaceName string = enableLogAnalytics ? logAnalytics.name : ''
