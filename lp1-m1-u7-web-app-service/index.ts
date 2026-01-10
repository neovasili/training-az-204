import * as pulumi from "@pulumi/pulumi";
import { MetricAggregationType } from "@pulumi/azure-native/types/enums/monitor";
import * as inputs from "@pulumi/azure-native/types/input";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import {
  DiagnosticSetting,
  AutoscaleSetting,
} from "@pulumi/azure-native/monitor";
import {
  AppServicePlan,
  WebApp,
  WebAppDiagnosticLogsConfiguration,
  WebAppSlot,
  WebAppSlotConfigurationNames,
} from "@pulumi/azure-native/web";
import { WebAppActiveSlot } from "@pulumi/azure/appservice";

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
  Standard1 = "S1",
  Standard2 = "S2",
  Standard3 = "S3",
  PremiumV2_1 = "P1V2",
  PremiumV2_2 = "P2V2",
  PremiumV2_3 = "P3V2",
  PremiumV3_0 = "P0V3",
  PremiumV3_1 = "P1V3",
  PremiumV3_2 = "P2V3",
  PremiumV3_3 = "P3V3",
}

enum ServicePlanTier {
  Free = "Free",
  Basic = "Basic",
  Standard = "Standard",
  PremiumV2 = "PremiumV2",
  PremiumV3 = "PremiumV3",
}

enum Interval {
  OneMinute = "PT1M",
  FiveMinutes = "PT5M",
  FitheenMinutes = "PT15M",
}

enum MetricName {
  CpuPercentage = "CpuPercentage",
}

enum Operator {
  GreaterThan = "GreaterThan",
  LessThan = "LessThan",
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
    name: ServicePlanName.Standard1,
    tier: ServicePlanTier.Standard,
  },
  perSiteScaling: true,
  tags,
});

new AutoscaleSetting("autoscaleSetting", {
  resourceGroupName: resourceGroup.name,
  targetResourceUri: appServicePlan.id,
  enabled: true,
  profiles: [
    {
      name: "AutoScaleProfile",
      capacity: {
        minimum: "1",
        maximum: "3",
        default: "1",
      },
      rules: [
        {
          metricTrigger: {
            metricName: MetricName.CpuPercentage,
            metricNamespace: "Microsoft.Web/serverfarms",
            metricResourceUri: appServicePlan.id,
            timeGrain: Interval.OneMinute,
            statistic: MetricAggregationType.Average,
            timeWindow: Interval.FiveMinutes,
            timeAggregation: MetricAggregationType.Average,
            operator: Operator.GreaterThan,
            threshold: 70,
          },
          scaleAction: {
            direction: "Increase",
            type: "ChangeCount",
            value: "1",
            cooldown: Interval.FiveMinutes,
          },
        },
        {
          metricTrigger: {
            metricName: MetricName.CpuPercentage,
            metricNamespace: "Microsoft.Web/serverfarms",
            metricResourceUri: appServicePlan.id,
            timeGrain: Interval.OneMinute,
            statistic: MetricAggregationType.Average,
            timeWindow: Interval.FiveMinutes,
            timeAggregation: MetricAggregationType.Average,
            operator: Operator.LessThan,
            threshold: 30,
          },
          scaleAction: {
            direction: "Decrease",
            type: "ChangeCount",
            value: "1",
            cooldown: Interval.FiveMinutes,
          },
        },
      ],
    },
  ],
  tags,
});

// const image = "DOCKER|mcr.microsoft.com/k8se/quickstart:";
const image = "DOCKER|nginxdemos/hello:";

const baseSiteConfig = {
  // linuxFxVersion: "DOCKER|nginxdemos/hello:latest",
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
  limits: {
    maxPercentageCpu: 70,
    maxMemoryInMb: 1536,
  },
};

const prodTag = "0.2";
const stageTag = "0.4";
const appName = "test-webapp-svc-001";

const stageHostname = pulumi.interpolate`${appName}-stage.azurewebsites.net`;
const routeTrafficPercentage = 0;

// Create a Web App
const webApp = new WebApp("webApp", {
  name: appName,
  resourceGroupName: resourceGroup.name,
  location: resourceGroup.location,
  serverFarmId: appServicePlan.id,
  kind: "app,linux,container",
  siteConfig: {
    ...baseSiteConfig,
    linuxFxVersion: `${image}${prodTag}`,
    appSettings: [
      ...(baseSiteConfig.appSettings ?? []),
      { name: "APP_ENV", value: "prod" },
    ],
    numberOfWorkers: 2,
    experiments: {
      rampUpRules: [
        {
          name: "StageTraffic",
          actionHostName: stageHostname,
          reroutePercentage: routeTrafficPercentage,
        },
      ],
    },
  },
  httpsOnly: true,
  tags,
});

// STAGE slot
const stage = new WebAppSlot("stage", {
  name: webApp.name,               // parent site name
  slot: "stage",                // slot name
  resourceGroupName: resourceGroup.name,
  location: resourceGroup.location,
  serverFarmId: appServicePlan.id,
  kind: "app,linux,container",
  siteConfig: {
    ...baseSiteConfig,
    linuxFxVersion: `${image}${stageTag}`,
    appSettings: [
      ...(baseSiteConfig.appSettings ?? []),
      { name: "APP_ENV", value: "stage" },
    ],
  },
  httpsOnly: true,
  tags,
});

// Slot-sticky settings (do not swap)
new WebAppSlotConfigurationNames("slot-config", {
  name: webApp.name,
  resourceGroupName: resourceGroup.name,
  appSettingNames: [
    "APP_ENV",
    // Add secrets/connection identifiers you want to remain per-slot
    // e.g. "DB_CONNECTION_STRING", "REDIS_URL"
  ],
});

// new WebAppActiveSlot("active-slot", {
//   slotId: stage.id,
// });

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

export const prodUrl = pulumi.interpolate`https://${webApp.defaultHostName}`;
export const stageUrl = pulumi.interpolate`https://${stage.defaultHostName}`;
