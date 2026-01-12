import * as pulumi from "@pulumi/pulumi";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import { Vault, SkuName, SkuFamily } from "@pulumi/azure-native/keyvault";
import { getClientConfigOutput, RoleAssignment } from "@pulumi/azure-native/authorization";

const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  prupose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

const vaultName = "neovasilicoaz204kv";

// Get the current user object ID
const azureClient = getClientConfigOutput();
// Create an Azure Resource Group
const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

// Create an Azure Key Vault
const keyVault = new Vault("KeyVault", {
  vaultName,
  resourceGroupName: resourceGroup.name,
  properties: {
    sku: {
      family: SkuFamily.A,
      name: SkuName.Standard,
    },
    tenantId: azureClient.tenantId,
    enableRbacAuthorization: true,
  },
  tags,
});

const keyVaultOwnerRoleId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/b86a8fe4-44ce-4948-aee5-eccb2c155cd7`;

new RoleAssignment("KeyVaultOwnerRoleAssignment", {
  principalId: azureClient.objectId,
  roleDefinitionId: keyVaultOwnerRoleId,
  scope: keyVault.id,
});

export const keyVaultName = keyVault.name;
export const keyVaultUri = keyVault.properties.apply((p) => p.vaultUri);
