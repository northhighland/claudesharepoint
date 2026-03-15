@description('Short client identifier (2-10 lowercase alphanumeric)')
@minLength(2)
@maxLength(10)
param clientCode string

@description('Azure region for deployment')
param location string = resourceGroup().location

@description('Enable Storage Account deployment')
param enableStorageAccount bool = true

@description('Enable Log Analytics workspace')
param enableLogAnalytics bool = true

@description('Email for alert notifications (optional). IMPORTANT: Must be set to a non-empty value to enable metric alerts (action group + job failure alert). Pass via deploy.ps1 -AlertRecipients or CI/CD parameters.')
param alertRecipients string = ''

@description('Comma-separated admin emails for dashboard RBAC (e.g. "admin@company.com,user2@company.com")')
param adminUsers string = ''

@description('Log Analytics retention in days')
@minValue(7)
@maxValue(730)
param logRetentionDays int = 30

@description('Resource tags for cost management and compliance')
param tags object = {
  project: 'claudesharepoint'
  managedBy: 'bicep'
  environment: 'production'
}

// Key Vault
var keyVaultName = 'kv-csp-${clientCode}'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Diagnostic settings for Key Vault
resource keyVaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableLogAnalytics) {
  name: '${keyVaultName}-diag'
  scope: keyVault
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      { categoryGroup: 'allLogs', enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

// Log Analytics workspace
var logAnalyticsName = 'log-csp-${clientCode}'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = if (enableLogAnalytics) {
  name: logAnalyticsName
  location: location
  tags: tags
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
    tags: tags
  }
}

// Automation Account module
module automation 'modules/automation-account.bicep' = {
  name: 'automation-deployment'
  params: {
    clientCode: clientCode
    location: location
    logAnalyticsWorkspaceId: enableLogAnalytics ? logAnalytics.id : ''
    tags: tags
  }
}

// Static Web App module
module staticWebApp 'modules/static-web-app.bicep' = {
  name: 'static-web-app-deployment'
  params: {
    clientCode: clientCode
    // SWA only available in: westus2, centralus, eastus2, westeurope, eastasia
    location: 'eastus2'
    tags: tags
  }
}

// Function App module (standalone API backend for SWA)
module functionApp 'modules/function-app.bicep' = {
  name: 'function-app-deployment'
  params: {
    clientCode: clientCode
    location: location
    adminUsers: adminUsers
    tags: tags
  }
}

// Linked Backend: SWA → Function App (proxies /api/* requests)
resource swa 'Microsoft.Web/staticSites@2023-12-01' existing = {
  name: 'swa-csp-${clientCode}'
}

resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2023-12-01' = {
  parent: swa
  name: 'backend'
  properties: {
    backendResourceId: functionApp.outputs.functionAppId
    region: location
  }
  dependsOn: [staticWebApp]
}

// RBAC: Automation Account managed identity → Key Vault Secrets User
resource kvSecretsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, keyVaultName, 'aa-csp-${clientCode}', 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: automation.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Automation Account managed identity → Storage Table Data Contributor
resource storageTableRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableStorageAccount) {
  name: guid(resourceGroup().id, 'stcsp${clientCode}', 'aa-csp-${clientCode}', 'Storage Table Data Contributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
    principalId: automation.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Automation Account managed identity → Storage Blob Data Contributor
resource storageBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableStorageAccount) {
  name: guid(resourceGroup().id, 'stcsp${clientCode}', 'aa-csp-${clientCode}', 'Storage Blob Data Contributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: automation.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Automation Account managed identity → Automation Contributor (self-dispatch child runbooks)
// Scoped to resource group since module outputs can't be used as scope
resource automationContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'aa-csp-${clientCode}', 'Automation Contributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'f353d9bd-d4a6-484e-a77a-8050b599b867')
    principalId: automation.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Function App managed identity → Storage Table Data Contributor (read + write for sites-stale POST)
resource funcStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableStorageAccount) {
  name: guid(resourceGroup().id, 'func-csp-${clientCode}', 'Storage Table Data Contributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
    principalId: functionApp.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Function App managed identity → Storage Blob Data Owner (required for Functions runtime with identity-based AzureWebJobsStorage)
resource funcBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableStorageAccount) {
  name: guid(resourceGroup().id, 'func-csp-${clientCode}', 'Storage Blob Data Owner')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
    principalId: functionApp.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Function App managed identity → Storage Queue Data Contributor (required for Functions runtime with identity-based AzureWebJobsStorage)
resource funcQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableStorageAccount) {
  name: guid(resourceGroup().id, 'func-csp-${clientCode}', 'Storage Queue Data Contributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88')
    principalId: functionApp.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC: Function App managed identity → Automation Operator (read + trigger jobs, no runbook modification)
resource funcAutomationRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'func-csp-${clientCode}', 'Automation Operator')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'd3881f73-407a-4167-8283-e981cbba0404')
    principalId: functionApp.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// Alert on automation job failures
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (!empty(alertRecipients)) {
  name: 'ag-csp-${clientCode}'
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
  name: 'alert-csp-${clientCode}-jobfailure'
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
    description: 'Alert when claudesharepoint automation jobs fail'
  }
}

// Outputs
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output automationAccountName string = automation.outputs.automationAccountName
output automationAccountPrincipalId string = automation.outputs.principalId
output storageAccountName string = enableStorageAccount ? storage!.outputs.storageAccountName : ''
output storageTableEndpoint string = enableStorageAccount ? storage!.outputs.tableEndpoint : ''
output storageBlobEndpoint string = enableStorageAccount ? storage!.outputs.blobEndpoint : ''
output staticWebAppHostname string = staticWebApp.outputs.defaultHostname
output functionAppName string = functionApp.outputs.functionAppName
output logAnalyticsWorkspaceName string = enableLogAnalytics ? logAnalytics.name : ''
