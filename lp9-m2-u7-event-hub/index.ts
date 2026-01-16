import * as pulumi from "@pulumi/pulumi";
import { getClientConfigOutput, RoleAssignment } from "@pulumi/azure-native/authorization";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import {
  Namespace,
  EventHub,
  ConsumerGroup,
  SkuName as EventHubSkuName,
} from "@pulumi/azure-native/eventhub";
import {
  StorageAccount,
  SkuName as StorageSkuName,
  Kind,
  BlobContainer,
} from "@pulumi/azure-native/storage";

// --------------------
// Tags
// --------------------
const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  purpose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

// --------------------
// Identity (current user)
// --------------------
const azureClient = getClientConfigOutput();

// --------------------
// Resource Group
// --------------------
const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

// --------------------
// Event Hubs Namespace + Event Hub + Consumer Group
// --------------------
const eventHubNamespace = new Namespace(
  "EventHubNamespace",
  {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    namespaceName: pulumi.interpolate`${pulumi.getProject()}-${pulumi.getStack()}-ehns`,
    sku: { name: EventHubSkuName.Standard },
    tags,
  },
  { parent: resourceGroup }
);

const eventHub = new EventHub(
  "EventHub",
  {
    resourceGroupName: resourceGroup.name,
    namespaceName: eventHubNamespace.name,
    eventHubName: "training-events",
    partitionCount: 2,
    messageRetentionInDays: 1,
  },
  { parent: eventHubNamespace }
);

const consumerGroup = new ConsumerGroup(
  "ConsumerGroup",
  {
    resourceGroupName: resourceGroup.name,
    namespaceName: eventHubNamespace.name,
    eventHubName: eventHub.name,
    consumerGroupName: "training-cg",
  },
  { parent: eventHub }
);

// --------------------
// Storage Account + Container (for Processor checkpoints/ownership)
// --------------------
function makeStorageAccountName(): string {
  // Basic sanitization to meet naming rules (lowercase letters/numbers only).
  // You may still need to adjust if Azure says the name is already taken.
  const raw = `${pulumi.getProject()}${pulumi.getStack()}az204eh`;
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
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
  },
  { parent: resourceGroup }
);

const checkpointContainer = new BlobContainer(
  "CheckpointContainer",
  {
    resourceGroupName: resourceGroup.name,
    accountName: storageAccount.name,
    containerName: "eventhub-checkpoints",
    publicAccess: "None",
  },
  { parent: storageAccount }
);

// --------------------
// RBAC Role Assignments
// --------------------
// Built-in role IDs:
// - Azure Event Hubs Data Sender:   2b629674-e913-4c01-ae53-ef4638d8f975
// - Azure Event Hubs Data Receiver: a638d3c7-ab3a-418d-83e6-5f17a39d4fde
// - Storage Blob Data Contributor:  ba92f5b4-2d11-453d-a403-e96b0029c9fe

const eventHubsDataSenderRoleDefinitionId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/2b629674-e913-4c01-ae53-ef4638d8f975`;
const eventHubsDataReceiverRoleDefinitionId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/a638d3c7-ab3a-418d-83e6-5f17a39d4fde`;
const storageBlobDataContributorRoleDefinitionId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe`;

// Least-privilege: scope to the Event Hub
new RoleAssignment(
  "EventHubsDataSenderRoleAssignment",
  {
    principalId: azureClient.objectId,
    principalType: "User",
    roleDefinitionId: eventHubsDataSenderRoleDefinitionId,
    scope: eventHub.id,
  },
  { parent: eventHub }
);

new RoleAssignment(
  "EventHubsDataReceiverRoleAssignment",
  {
    principalId: azureClient.objectId,
    principalType: "User",
    roleDefinitionId: eventHubsDataReceiverRoleDefinitionId,
    scope: eventHub.id,
  },
  { parent: eventHub }
);

// Processor needs Blob container access for ownership + checkpoints.
// Scope to the container (tightest).
new RoleAssignment(
  "CheckpointContainerBlobDataContributorRoleAssignment",
  {
    principalId: azureClient.objectId,
    principalType: "User",
    roleDefinitionId: storageBlobDataContributorRoleDefinitionId,
    scope: checkpointContainer.id,
  },
  { parent: checkpointContainer }
);

// --------------------
// Outputs for your Go program
// --------------------
export const eventHubNamespaceFdqn = pulumi.interpolate`${eventHubNamespace.name}.servicebus.windows.net`;
export const eventHubName = eventHub.name;
export const consumerGroupName = consumerGroup.name;

export const storageAccountUrl = pulumi.interpolate`https://${storageAccount.name}.blob.core.windows.net/`;
export const storageContainerName = checkpointContainer.name;

export const resourceGroupName = resourceGroup.name;
