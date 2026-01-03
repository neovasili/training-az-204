import * as pulumi from "@pulumi/pulumi";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import { DiagnosticSetting } from "@pulumi/azure-native/insights";
import { AppServicePlan, WebApp, WebAppDiagnosticLogsConfiguration } from "@pulumi/azure-native/web";

const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  prupose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

enum ServicePlanName {
  Free = "F1",
  Basic1 = "B1",
  Basic2 = "B2",
  Basic3 = "B3",
}

enum ServicePlanTier {
  Free = "Free",
  Basic = "Basic",
}

// Create an Azure Resource Group
const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

// Create an App Service Plan
const appServicePlan = new AppServicePlan("AppServicePlan", {
  resourceGroupName: resourceGroup.name,
  location: resourceGroup.location,
  kind: "linux",
  reserved: true,
  sku: {
    name: ServicePlanName.Basic1,
    tier: ServicePlanTier.Basic,
  },
  tags,
});

// Create a Web App
const webApp = new WebApp("webApp", {
  resourceGroupName: resourceGroup.name,
  location: resourceGroup.location,
  serverFarmId: appServicePlan.id,
  kind: "app,linux,container",
  name: "test-web-app-service-001",
  siteConfig: {
    // linuxFxVersion: "DOCKER|nginxdemos/hello:latest",
    linuxFxVersion: "DOCKER|mcr.microsoft.com/k8se/quickstart:latest",
    // If your container listens on a non-80 port, set WEBSITES_PORT below.
    appSettings: [
      { name: "WEBSITES_ENABLE_APP_SERVICE_STORAGE", value: "false" },
      // { name: "WEBSITES_PORT", value: "8080" }, // uncomment if needed
    ],
    ftpsState: "Disabled",
    scmType: "None",
    alwaysOn: true,
    minTlsVersion: "1.3",
    httpLoggingEnabled: true,
    http20Enabled: true,
    numberOfWorkers: 1,
    requestTracingEnabled: true,
  },
  httpsOnly: true,
  tags,
});

const logsSettings = new WebAppDiagnosticLogsConfiguration("app-logs", {
  name: webApp.name,
  resourceGroupName: resourceGroup.name,
  applicationLogs: {
    fileSystem: {
      level: "Information", // Off | Error | Warning | Information | Verbose
    },
  },
  kind: "webapp",
});

// Export the URL of the Web App
export const webAppUrl = pulumi.interpolate`https://${webApp.defaultHostName}`;
