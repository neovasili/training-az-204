import * as pulumi from "@pulumi/pulumi";
import {
  getClientConfigOutput,
  RoleAssignment,
} from "@pulumi/azure-native/authorization";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import {
  StorageAccount,
  Kind,
  SkuName as StorageSkuName,
} from "@pulumi/azure-native/storage";
import { Queue } from "@pulumi/azure-native/storage";

const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  purpose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

const azureClient = getClientConfigOutput();

const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

function makeStorageAccountName(): string {
  // Storage account naming: 3-24 chars, lowercase letters + numbers only, globally unique.
  const raw = `${pulumi.getProject()}${pulumi.getStack()}az204q`;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}

const storageAccount = new StorageAccount(
  "StorageAccount",
  {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    accountName: makeStorageAccountName(),
    kind: Kind.StorageV2,
    sku: { name: StorageSkuName.Standard_LRS },
    tags,

    // Optional hardening: enforce AAD-only by disallowing shared key auth
    // allowSharedKeyAccess: false,
  },
  { parent: resourceGroup },
);

const storageQueue = new Queue(
  "StorageQueue",
  {
    resourceGroupName: resourceGroup.name,
    accountName: storageAccount.name,
    queueName: "training-queue",
  },
  { parent: storageAccount },
);

// Built-in role IDs (data-plane)
// Storage Queue Data Message Sender:   c6a89b2d-59bc-44d0-9896-0f6e12d7b80a
// Storage Queue Data Message Processor: 8a0f0c08-91a1-4084-bc3d-661d67233fed
const storageQueueDataMessageSenderRoleDefinitionId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/c6a89b2d-59bc-44d0-9896-0f6e12d7b80a`;
const storageQueueDataMessageProcessorRoleDefinitionId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/8a0f0c08-91a1-4084-bc3d-661d67233fed`;

// Least privilege: scope to the queue itself
new RoleAssignment(
  "StorageQueueMessageSenderRoleAssignment",
  {
    principalId: azureClient.objectId,
    principalType: "User",
    roleDefinitionId: storageQueueDataMessageSenderRoleDefinitionId,
    scope: storageQueue.id,
  },
  { parent: storageQueue },
);

new RoleAssignment(
  "StorageQueueMessageProcessorRoleAssignment",
  {
    principalId: azureClient.objectId,
    principalType: "User",
    roleDefinitionId: storageQueueDataMessageProcessorRoleDefinitionId,
    scope: storageQueue.id,
  },
  { parent: storageQueue },
);

// Outputs for the upcoming Go app
export const storageQueueServiceUrl = pulumi.interpolate`https://${storageAccount.name}.queue.core.windows.net`;
export const storageQueueName = storageQueue.name;
export const resourceGroupName = resourceGroup.name;
