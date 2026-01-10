import * as pulumi from "@pulumi/pulumi";
import { getClientConfigOutput, RoleAssignment } from "@pulumi/azure-native/authorization";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import {
  StorageAccount,
  BlobContainer,
  PublicAccess,
  SkuName,
  Kind,
} from "@pulumi/azure-native/storage";

const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  prupose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

const accountName = "neovasilistorageaz204";
const containerName = "data";

const azureClient = getClientConfigOutput();

// Create an Azure Resource Group
const resourceGroup = new ResourceGroup("ResourceGroup");
// Create an Azure Storage Account
const storageAccount = new StorageAccount("StorageAccount", {
  accountName,
  resourceGroupName: resourceGroup.name,
  sku: {
    name: SkuName.Standard_LRS,
  },
  kind: Kind.StorageV2,
  location: resourceGroup.location,
  tags,
});

// Create a Storage Container
const storageContainer = new BlobContainer("StorageContainer", {
  containerName,
  accountName: storageAccount.name,
  resourceGroupName: resourceGroup.name,
  publicAccess: PublicAccess.None,
});

const storageBlobDataContributorRoleId =
  pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe`;

new RoleAssignment("StorageBlobDataContributorRoleAssignment", {
  scope: storageAccount.id,
  principalId: azureClient.objectId,
  roleDefinitionId: storageBlobDataContributorRoleId,
});

export const storageAccountName = storageAccount.name;
export const storageContainerName = storageContainer.name;
