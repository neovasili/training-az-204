import { Output, getProject, getStack, getOrganization } from "@pulumi/pulumi";
import { getClientConfigOutput } from "@pulumi/azure-native/authorization";
import { Application, ApplicationRedirectUris } from "@pulumi/azuread";

const tags = {
  project: getProject(),
  stack: getStack(),
  purpose: "AZ training",
  certification: "AZ-204",
  owner: getOrganization(),
};

const { tenantId } = getClientConfigOutput();

// 1) App registration (public client / native scenario)
const entraApp = new Application("EntraApp", {
  displayName: "az204-msal-go",
  // This enables “public client” flows for native apps in Entra ID
  fallbackPublicClientEnabled: true,
  tags: Object.values(tags),
});

// 2) Redirect URIs for interactive auth
// MSAL interactive flows require the redirect_uri to match one registered in Entra ID.
// For native/desktop apps, Microsoft documents commonly used redirect URIs such as
// `http://localhost` (system browser) and `https://login.microsoftonline.com/common/oauth2/nativeclient`
// (recommended for some native scenarios). :contentReference[oaicite:1]{index=1}
new ApplicationRedirectUris("EntraAppPublicRedirects", {
  applicationId: entraApp.id,
  type: "PublicClient",
  redirectUris: [
    // System browser loopback (MSAL commonly uses localhost with a port)
    "http://localhost",
    "http://localhost:8400",
  ],
});

// Output what your Go app will need
export const clientId: Output<string> = entraApp.clientId;
export const appObjectId: Output<string> = entraApp.objectId;
export const tenantIdOutput: Output<string> = tenantId;
