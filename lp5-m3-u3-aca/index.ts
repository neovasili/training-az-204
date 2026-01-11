import { getOrganization, getProject, getStack, Output } from "@pulumi/pulumi";

import { ResourceGroup } from "@pulumi/azure-native/resources";
import { ManagedEnvironment, ContainerApp } from "@pulumi/azure-native/app";

const tags = {
  project: getProject(),
  stack: getStack(),
  purpose: "AZ training",
  certification: "AZ-204",
  owner: getOrganization(),
};

// Resource Group
const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

// Container Apps Environment
const containerAppEnv = new ManagedEnvironment("ContainerAppEnv", {
  resourceGroupName: resourceGroup.name,
  location: resourceGroup.location,
  environmentName: "neovasilicocaenv",
  tags,
});
// Container App
const containerApp = new ContainerApp("ContainerApp", {
  containerAppName: "test",
  resourceGroupName: resourceGroup.name,
  managedEnvironmentId: containerAppEnv.id,
  location: resourceGroup.location,
  configuration: {
    ingress: {
      external: true,
      targetPort: 80,
      allowInsecure: false,
    },
  },
  template: {
    containers: [
      {
        name: "mycontainer",
        image: "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest",
        resources: {
          cpu: 0.5,
          memory: "1.0Gi",
        },
      },
    ],
  },
  tags,
});

// The app’s public base URL (needed for the redirect URI)
export const containerAppUrl: Output<string | undefined> =
  containerApp.configuration.apply((c) =>
    c?.ingress?.fqdn ? `https://${c.ingress.fqdn}` : undefined,
  );
