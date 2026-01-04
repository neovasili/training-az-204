import * as pulumi from "@pulumi/pulumi";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import {
  StorageAccount,
  BlobContainer,
  Blob,
  SkuName,
  Kind,
  HttpProtocol,
  SignedResource,
  Permissions,
  listStorageAccountKeysOutput,
  listStorageAccountServiceSAS,
} from "@pulumi/azure-native/storage";
import { AppServicePlan, WebApp } from "@pulumi/azure-native/web";

// Create an Azure Resource Group
const resourceGroup = new ResourceGroup("ResourceGroup", {
  location: "WestEurope",
});

// Create an Azure Storage Account
const storageAccount = new StorageAccount("StorageAccount", {
  accountName: "neovasilifuncaz204",
  resourceGroupName: resourceGroup.name,
  location: resourceGroup.location,
  sku: {
    name: SkuName.Standard_LRS,
  },
  kind: Kind.StorageV2,
});

// Get Storage Account Keys
const storageAccountKeys = listStorageAccountKeysOutput({
  resourceGroupName: resourceGroup.name,
  accountName: storageAccount.name,
});

const primaryStorageKey = storageAccountKeys.keys[0].value;

const codeContainer = new BlobContainer("code", {
  resourceGroupName: resourceGroup.name,
  accountName: storageAccount.name,
  publicAccess: "None",
});

// Zip up your function app files (prebuilt Go binary + host.json + function.json etc.)
//
// Expected folder (example):
// ./funcapp/
//   host.json
//   local.settings.json   (NOT deployed; local only)
//   HelloHttp/
//     function.json
//   customHandler.json
//   handler              (your compiled Go binary for linux amd64, chmod +x)
//
// Pulumi will upload a ZIP of ./funcapp to blob storage.
const codeZip = new Blob("funcapp-zip", {
  resourceGroupName: resourceGroup.name,
  accountName: storageAccount.name,
  containerName: codeContainer.name,
  blobName: "funcapp.zip",
  contentType: "application/zip",
  source: new pulumi.asset.FileArchive("./function"),
});

// Build connection string
const storageConnectionString = pulumi.interpolate`DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${primaryStorageKey};EndpointSuffix=core.windows.net`;

// Create a SAS URL for the ZIP so the Function App can run from package
const sas = pulumi
  .all([resourceGroup.name, storageAccount.name, codeContainer.name])
  .apply(([resourceGroupName, accountName, containerName]) =>
    listStorageAccountServiceSAS({
      resourceGroupName,
      accountName,
      protocols: HttpProtocol.Https,
      sharedAccessStartTime: "2025-01-01",
      sharedAccessExpiryTime: "2035-01-01",
      resource: SignedResource.C,
      permissions: Permissions.R,
      canonicalizedResource: `/blob/${accountName}/${containerName}`,
      contentType: "application/zip",
      cacheControl: "max-age=5",
      contentDisposition: "inline",
      contentEncoding: "deflate",
    }),
  );

const codeZipUrl = pulumi.interpolate`https://${
  storageAccount.name
}.blob.core.windows.net/${codeContainer.name}/${codeZip.name}?${sas.apply(
  (s) => s.serviceSasToken,
)}`;

// Create an App Service Plan (Consumption plan for Functions)
const appServicePlan = new AppServicePlan("AppServicePlan", {
  resourceGroupName: resourceGroup.name,
  location: resourceGroup.location,
  kind: "Linux",
  reserved: true,
  sku: {
    name: "Y1",
    tier: "Dynamic",
  },
});

// Create a Function App
const functionApp = new WebApp("FunctionApp", {
  resourceGroupName: resourceGroup.name,
  location: resourceGroup.location,
  serverFarmId: appServicePlan.id,
  kind: "functionapp,linux",
  siteConfig: {
    appSettings: [
      {
        name: "AzureWebJobsStorage",
        value: storageConnectionString,
      },
      {
        name: "FUNCTIONS_EXTENSION_VERSION",
        value: "~4",
      },
      {
        name: "FUNCTIONS_WORKER_RUNTIME",
        value: "custom",
      },
      {
        name: "WEBSITE_RUN_FROM_PACKAGE",
        value: codeZipUrl,
      },
    ],
    http20Enabled: true,
  },
  httpsOnly: true,
});

export const resourceGroupName = resourceGroup.name;
export const functionAppName = functionApp.name;
export const functionAppUrl = pulumi.interpolate`https://${functionApp.defaultHostName}/api/HelloWorld`;
export const storageAccountName = storageAccount.name;
