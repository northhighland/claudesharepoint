@description('Client code used in resource naming')
param clientCode string

@description('Azure region for Static Web App (limited availability: westus2, centralus, eastus2, westeurope, eastasia)')
param location string = 'eastus2'

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

output staticWebAppName string = staticWebApp.name
output staticWebAppId string = staticWebApp.id
output defaultHostname string = staticWebApp.properties.defaultHostname
output principalId string = staticWebApp.identity.principalId
