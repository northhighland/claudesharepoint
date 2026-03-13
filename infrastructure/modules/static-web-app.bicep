@description('Client code used in resource naming')
param clientCode string

@description('Azure region for Static Web App (limited availability: westus2, centralus, eastus2, westeurope, eastasia)')
param location string = 'eastus2'

@description('Storage account name for Table Storage access')
param storageAccountName string = 'stcsp${clientCode}'

@description('Automation account name')
param automationAccountName string = 'aa-csp-${clientCode}'

@description('Subscription ID for automation API calls')
param subscriptionId string = subscription().subscriptionId

@description('Resource group name for automation API calls')
param resourceGroupName string = resourceGroup().name

var staticWebAppName = 'swa-csp-${clientCode}'

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates: true
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

// App settings for API functions
resource appSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    AZURE_STORAGE_ACCOUNT_NAME: storageAccountName
    AZURE_AUTOMATION_ACCOUNT: automationAccountName
    AZURE_SUBSCRIPTION_ID: subscriptionId
    AZURE_RESOURCE_GROUP: resourceGroupName
  }
}

output staticWebAppName string = staticWebApp.name
output staticWebAppId string = staticWebApp.id
output defaultHostname string = staticWebApp.properties.defaultHostname
output principalId string = staticWebApp.identity.principalId
