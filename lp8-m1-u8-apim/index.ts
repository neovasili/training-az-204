import * as pulumi from "@pulumi/pulumi";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import {
  Api,
  SkuType,
  ApiManagementService,
} from "@pulumi/azure-native/apimanagement";

const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  prupose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

// Minimal APIM instance (Developer SKU is typical for labs)
const apim = new ApiManagementService("ApiManagementService", {
  resourceGroupName: resourceGroup.name,
  publisherEmail: "admin@example.com",
  publisherName: "AZ204 Labs",
  enableClientCertificate: true,
  sku: {
    name: SkuType.Developer,
    capacity: 1,
  },
  tags,
}, { parent: resourceGroup });

// Import API from OpenAPI URL
const api = new Api("Petstore", {
  resourceGroupName: resourceGroup.name,
  serviceName: apim.name,

  // The API identifier inside APIM
  apiId: "petstore",

  // URL import of OpenAPI
  format: "openapi-link",
  value: "https://petstore3.swagger.io/api/v3/openapi.json",

  // Gateway path: https://<apim>.azure-api.net/petstore/...
  path: "petstore",
  protocols: ["https"],

  displayName: "Petstore (OpenAPI v3)",
}, { parent: apim });

export const apimGatewayUrl = pulumi.interpolate`https://${apim.name}.azure-api.net/${api.path}`;
