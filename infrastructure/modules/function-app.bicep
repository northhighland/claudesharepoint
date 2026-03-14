@description('Client code used in resource naming')
param clientCode string

@description('Azure region for deployment')
param location string

@description('Storage account name for Table Storage data access')
param storageAccountName string = 'stcsp${clientCode}'

@description('Automation account name')
param automationAccountName string = 'aa-csp-${clientCode}'

// --- Basic App Service Plan (Windows, B1) ---
// Windows avoids Linux Kudu/SCM storage dependency issue.
// No runtime storage account needed — all 6 functions are HTTP-only triggers.
// Secrets stored on local filesystem via AzureWebJobsSecretStorageType=files.
var appServicePlanName = 'asp-csp-${clientCode}'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
}

// --- Function App (Windows) ---
var functionAppName = 'func-csp-${clientCode}'

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      nodeVersion: '~20'
      appSettings: [
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storageAccountName
        }
        {
          name: 'AzureWebJobsSecretStorageType'
          value: 'files'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'AZURE_STORAGE_ACCOUNT_NAME'
          value: storageAccountName
        }
        {
          name: 'AZURE_SUBSCRIPTION_ID'
          value: subscription().subscriptionId
        }
        {
          name: 'AZURE_RESOURCE_GROUP'
          value: resourceGroup().name
        }
        {
          name: 'AZURE_AUTOMATION_ACCOUNT'
          value: automationAccountName
        }
      ]
    }
  }
}

output functionAppName string = functionApp.name
output functionAppId string = functionApp.id
output principalId string = functionApp.identity.principalId
