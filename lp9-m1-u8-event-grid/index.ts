import * as pulumi from "@pulumi/pulumi";
import {
  getClientConfigOutput,
  RoleAssignment,
} from "@pulumi/azure-native/authorization";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import {
  Namespace,
  Topic,
  SkuName,
  InputSchema,
  DeliverySchema,
  EventSubscription,
} from "@pulumi/azure-native/eventgrid";

const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  prupose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

// Get the current user object ID
const azureClient = getClientConfigOutput();

const config = new pulumi.Config();
const viewerWebsiteUrl = config.get("viewerWebsiteUrl");

// Define resource group
const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

// Define Event Grid namespace
const eventGridNamespace = new Namespace(
  "EventGridNamespace",
  {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    namespaceName: "myEventGridNamespace",
    sku: {
      name: SkuName.Standard,
    },
    tags,
  },
  { parent: resourceGroup },
);

// Define Event Grid topic
const eventGridTopic = new Topic(
  "EventGridTopic",
  {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    topicName: "neovasiliaz204topic",
    inputSchema: InputSchema.CloudEventSchemaV1_0,
    tags,
  },
  { parent: eventGridNamespace },
);

if (viewerWebsiteUrl) {
  new EventSubscription(
    "ViewerWebhookEventSubscription",
    {
      eventSubscriptionName: "ViewerWebhook",
      eventDeliverySchema: DeliverySchema.CloudEventSchemaV1_0,
      scope: eventGridTopic.id,
      destination: {
        endpointType: "WebHook",
        endpointUrl: `${viewerWebsiteUrl}/api/updates`,
      },
    },
    { parent: eventGridTopic },
  );
}

// Assign "EventGrid Data Sender" role to the current user for the Event Grid topic
const sendMessaagesRoleId = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/d5a91429-5739-47e2-a06b-3470a27159e7`;

new RoleAssignment(
  "SendMessagesRoleAssignment",
  {
    principalId: azureClient.objectId,
    principalType: "User",
    roleDefinitionId: sendMessaagesRoleId, // EventGrid Data Sender
    scope: eventGridTopic.id,
  },
  { parent: eventGridTopic },
);

// Export the Event Grid topic endpoint
export const eventGridNamespaceEndpoint = pulumi.interpolate`https://${eventGridNamespace.name}.${resourceGroup.location}.eventgrid.azure.net`;
export const eventGridNamespaceTopicName = eventGridTopic.name;
export const resourceGroupName = resourceGroup.name;
export const topicEndpoint = eventGridTopic.endpoint;
