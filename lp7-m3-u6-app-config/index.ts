import * as pulumi from "@pulumi/pulumi";
import {
  getClientConfigOutput,
  RoleAssignment,
} from "@pulumi/azure-native/authorization";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import { ConfigurationStore, KeyValue } from "@pulumi/azure-native/appconfiguration";

function createFeatureFlag(
  name: string,
  args: {
    resourceGroupName: pulumi.Input<string>;
    configStoreName: pulumi.Input<string>;
    flagName: string;
    enabled: boolean;
    description?: string;
    tags?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  },
) {
  // ARM encoding for "/" in the key name.
  // This results in an App Config key: ".appconfig.featureflag/<flagName>"
  const keyValueName = `.appconfig.featureflag~2F${args.flagName}`;

  const value = JSON.stringify({
    id: args.flagName,
    description: args.description ?? "",
    enabled: args.enabled,
    conditions: {
      client_filters: [],
    },
  });

  return new KeyValue(name, {
    resourceGroupName: args.resourceGroupName,
    configStoreName: args.configStoreName,
    keyValueName,
    contentType: "application/vnd.microsoft.appconfig.ff+json;charset=utf-8",
    value,
    tags: args.tags,
  });
}

const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  prupose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

// Get the current user object ID
const azureClient = getClientConfigOutput();
// Create an Azure Resource Group
const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

// Create an Azure App Configuration instance
const appConfig = new ConfigurationStore("AppConfigurationStore", {
  resourceGroupName: resourceGroup.name,
  sku: {
    name: "Standard",
  },
  tags,
});

new KeyValue("AppConfigKeyValue", {
  configStoreName: appConfig.name,
  resourceGroupName: resourceGroup.name,
  keyValueName: "WelcomeMessage",
  value: "Hello from Azure App Configuration!",
  contentType: "text/plain",
  tags,
});

createFeatureFlag("BetaFeatureFlag", {
  resourceGroupName: resourceGroup.name,
  configStoreName: appConfig.name,
  flagName: "BetaFeature",
  enabled: true,
  description: "Enables the beta feature for users.",
  tags,
});

createFeatureFlag("NewUIFeatureFlag", {
  resourceGroupName: resourceGroup.name,
  configStoreName: appConfig.name,
  flagName: "BetaFeature:NewUI",
  enabled: true,
  description: "Enables the new UI for users.",
  tags,
});

const appConfigOwnerRoleId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c`;

// Assign the user as the owner of the App Configuration instance
new RoleAssignment("AppConfigurationOwnerRoleAssignment", {
  principalId: azureClient.objectId,
  roleDefinitionId: appConfigOwnerRoleId,
  scope: appConfig.id,
});

const appConfigDataReaderRoleId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/5ae67dd6-50cb-40e7-96ff-dc2bfa4b606b`;

new RoleAssignment("AppConfigDataReader", {
  principalId: azureClient.objectId,
  roleDefinitionId: appConfigDataReaderRoleId,
  scope: appConfig.id,
});


export const appConfigEndpoint = appConfig.endpoint;
