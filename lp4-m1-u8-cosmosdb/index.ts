import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { getClientConfigOutput } from "@pulumi/azure-native/authorization";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import {
  DatabaseAccount,
  SqlResourceSqlDatabase,
  SqlResourceSqlContainer,
  SqlResourceSqlRoleAssignment,
} from "@pulumi/azure-native/cosmosdb";

const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  prupose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

// Create an Azure Resource Group
const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

const accountName = "neovasilicosmosaz204";

const azureClient = getClientConfigOutput();

// Create a CosmosDB Account
const cosmosdbAccount = new DatabaseAccount("CosmosdbAccount", {
  accountName,
  resourceGroupName: resourceGroup.name,
  databaseAccountOfferType: "Standard",
  locations: [
    {
      locationName: resourceGroup.location,
      failoverPriority: 0,
    },
  ],
  consistencyPolicy: {
    defaultConsistencyLevel: "Session",
  },
  tags,
});

// Create a CosmosDB SQL Database
const cosmosdbDatabase = new SqlResourceSqlDatabase("CosmosdbDatabase", {
  databaseName : "mydatabase",
  resourceGroupName: resourceGroup.name,
  accountName: cosmosdbAccount.name,
  resource: {
    id: "mydatabase",
  },
  options: {
    throughput: 400,
  },
  tags,
});

// Create a CosmosDB SQL Container
const cosmosdbContainer = new SqlResourceSqlContainer("CosmosdbContainer", {
  resourceGroupName: resourceGroup.name,
  accountName: cosmosdbAccount.name,
  databaseName: cosmosdbDatabase.name,
  containerName: "mycontainer",
  resource: {
    id: "mycontainer",
    partitionKey: {
      paths: ["/mypartitionkey"],
      kind: "Hash",
    },
  },
  options: {
    throughput: 400,
  },
  tags,
});

const cosmosdbContributorRoleId =
  pulumi.interpolate`${cosmosdbAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002`;

const roleAssignmentId = new random.RandomUuid("roleAssignmentId", {});
const scope = pulumi.interpolate`/subscriptions/${azureClient.subscriptionId}/resourceGroups/${resourceGroup.name}/providers/Microsoft.DocumentDB/databaseAccounts/${cosmosdbAccount.name}/dbs/${cosmosdbDatabase.name}/colls/${cosmosdbContainer.name}`;

new SqlResourceSqlRoleAssignment("CosmosdbContributorRoleAssignment", {
  accountName: cosmosdbAccount.name,
  roleAssignmentId: roleAssignmentId.result,
  resourceGroupName: resourceGroup.name,
  principalId: azureClient.objectId,
  roleDefinitionId: cosmosdbContributorRoleId,
  scope,
});

// Export the connection string for the CosmosDB account
export const connectionString = cosmosdbAccount.documentEndpoint;
