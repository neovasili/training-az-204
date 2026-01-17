import * as pulumi from "@pulumi/pulumi";
import { getClientConfigOutput, RoleAssignment } from "@pulumi/azure-native/authorization";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import {
  Namespace,
  Queue,
  SkuName,
  SkuTier,
} from "@pulumi/azure-native/servicebus";

const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  purpose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

const azureClient = getClientConfigOutput();

const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

// Service Bus namespace name must be globally unique.
const serviceBusNamespace = new Namespace(
  "ServiceBusNamespace",
  {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    namespaceName: pulumi.interpolate`${pulumi.getProject()}-${pulumi.getStack()}-sbns`,
    sku: {
      name: SkuName.Standard,
      tier: SkuTier.Standard,
    },
    // Optional: if you want to enforce AAD-only (no SAS), set this to true.
    // disableLocalAuth: true,
    tags,
  },
  { parent: resourceGroup }
);

const queue = new Queue(
  "Queue",
  {
    resourceGroupName: resourceGroup.name,
    namespaceName: serviceBusNamespace.name,
    queueName: "training-queue",

    // Sensible lab defaults
    lockDuration: "PT30S",
    maxDeliveryCount: 10,
    defaultMessageTimeToLive: "P1D",
    enablePartitioning: false,
    requiresDuplicateDetection: false,
  },
  { parent: serviceBusNamespace }
);

// Built-in role IDs (RBAC)
const serviceBusDataSenderRoleDefinitionId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/69a216fc-b8fb-44d8-bc22-1f3c2cd27a39`;
const serviceBusDataReceiverRoleDefinitionId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0`;

// Least-privilege scope: the queue
new RoleAssignment(
  "ServiceBusDataSenderRoleAssignment",
  {
    principalId: azureClient.objectId,
    principalType: "User",
    roleDefinitionId: serviceBusDataSenderRoleDefinitionId,
    scope: queue.id,
  },
  { parent: queue }
);

new RoleAssignment(
  "ServiceBusDataReceiverRoleAssignment",
  {
    principalId: azureClient.objectId,
    principalType: "User",
    roleDefinitionId: serviceBusDataReceiverRoleDefinitionId,
    scope: queue.id,
  },
  { parent: queue }
);

// Outputs for the upcoming Go app (AAD + DefaultAzureCredential)
export const serviceBusNamespaceFqdn = pulumi.interpolate`${serviceBusNamespace.name}.servicebus.windows.net`;
export const serviceBusQueueName = queue.name;
export const resourceGroupName = resourceGroup.name;
