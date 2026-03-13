@description('Client code used in resource naming')
param clientCode string

@description('Azure region for deployment')
param location string

var staticWebAppName = 'swa-spspace-${clientCode}'

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

// Auth configuration (Azure AD)
resource authConfig 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    AZURE_STORAGE_ACCOUNT: 'stspspace${clientCode}'
    AZURE_AUTOMATION_ACCOUNT: 'aa-spspace-${clientCode}'
  }
}

output staticWebAppName string = staticWebApp.name
output staticWebAppId string = staticWebApp.id
output defaultHostname string = staticWebApp.properties.defaultHostname
