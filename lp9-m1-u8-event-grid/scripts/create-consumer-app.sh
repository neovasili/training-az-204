#!/usr/bin/env bash

set -o errexit
set -o nounset
set -o pipefail

# Used to colorize output
RED='\e[0;31m'
GREEN='\e[0;32m'
YELLOW='\e[0;33m'
BLUE='\e[0;34m'
PURPLE='\e[0;35m'
CYAN='\e[0;36m'
RESET='\e[0m'

printf "\n${PURPLE}Deploy the Event Grid Viewer consumer application to the resource group.${RESET}\n"

printf " --> ${CYAN}Getting the resource group name from Pulumi stack outputs...${RESET}\n"
resource_group=$(pulumi stack output resourceGroupName --stack test -C lp9-m1-u8-event-grid)

printf " --> ${CYAN}Resource Group Name: ${RESET}'%s'\n" "${resource_group}"

printf " --> ${CYAN}Deploying the Event Grid Viewer application...${RESET}\n"
deployment=$(az deployment group create \
  --resource-group "${resource_group}" \
  --template-uri "https://raw.githubusercontent.com/Azure-Samples/azure-event-grid-viewer/main/azuredeploy.json" \
  --parameters siteName=neovasiliaz204eventviewer hostingPlanName=viewerhost)

siteUrl=$(jq -e -r '.properties.outputs.appServiceEndpoint.value' <<< "${deployment}")

printf "Site URL: %s\n" "${siteUrl}"

printf "\n✅ ${GREEN}Event Grid Viewer application deployed successfully.${RESET}\n"
