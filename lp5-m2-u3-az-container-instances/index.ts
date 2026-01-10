import * as pulumi from "@pulumi/pulumi";
import { ResourceGroup } from "@pulumi/azure-native/resources";
import { ContainerGroup } from "@pulumi/azure-native/containerinstance";

const tags = {
  project: pulumi.getProject(),
  stack: pulumi.getStack(),
  prupose: "AZ training",
  certification: "AZ-204",
  owner: pulumi.getOrganization(),
};

const resourceGroup = new ResourceGroup("ResourceGroup", { tags });

const containerGroup = new ContainerGroup("ContainerGroup", {
  resourceGroupName: resourceGroup.name,
  containerGroupName: "myContainerGroup",
  osType: "Linux",
  location: resourceGroup.location,
  containers: [
    {
      name: "mycontainer",
      image: "mcr.microsoft.com/azuredocs/aci-helloworld", // Replace with your image
      resources: {
        requests: {
          cpu: 1,
          memoryInGB: 1.5,
        },
      },
      ports: [{ port: 80 }],
      environmentVariables: [
        { name: "ENV_VAR_EXAMPLE", value: "example_value" },
      ],
    },
  ],
  restartPolicy: "Always",
  ipAddress: {
    ports: [{ port: 80, protocol: "TCP" }],
    type: "Public",
  },
  tags,
});

export const containerGroupUrl = containerGroup.ipAddress.apply(
  (ip) => `http://${ip?.ip}`,
);
