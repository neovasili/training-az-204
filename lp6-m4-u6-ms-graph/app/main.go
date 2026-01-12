package main

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	msgraphsdk "github.com/microsoftgraph/msgraph-sdk-go"
	auth "github.com/microsoftgraph/msgraph-sdk-go-core/authentication"
	"github.com/microsoftgraph/msgraph-sdk-go/users"
)

func main() {
	clientId := "e8620826-fd03-4237-b323-424db1999d24"
	tenantId := "06b1722b-c9c0-4bfd-a011-0ce9ece4a630"
	scopesEnv := "User.Read"

	if clientId == "" || tenantId == "" || scopesEnv == "" {
		log.Fatal("Set CLIENT_ID, TENANT_ID, GRAPH_USER_SCOPES (e.g., User.Read)")
	}
	scopes := strings.Split(scopesEnv, ",")

	// User auth via device code flow (simple + reliable for CLI training)
	credential, err := azidentity.NewDeviceCodeCredential(&azidentity.DeviceCodeCredentialOptions{
		ClientID: clientId,
		TenantID: tenantId,
		UserPrompt: func(ctx context.Context, msg azidentity.DeviceCodeMessage) error {
			fmt.Println(msg.Message)
			return nil
		},
	})
	if err != nil {
		log.Fatalf("create credential: %v", err)
	}

	// Graph SDK auth provider + request adapter + client
	authProvider, err := auth.NewAzureIdentityAuthenticationProviderWithScopes(credential, scopes)
	if err != nil {
		log.Fatalf("auth provider: %v", err)
	}

	adapter, err := msgraphsdk.NewGraphRequestAdapter(authProvider)
	if err != nil {
		log.Fatalf("request adapter: %v", err)
	}

	graphClient := msgraphsdk.NewGraphServiceClient(adapter)

	// GET /me?$select=displayName,mail,userPrincipalName
	query := users.UserItemRequestBuilderGetQueryParameters{
		Select: []string{"displayName", "mail", "userPrincipalName"},
	}

	me, err := graphClient.Me().Get(context.Background(), &users.UserItemRequestBuilderGetRequestConfiguration{
		QueryParameters: &query,
	})
	if err != nil {
		log.Fatalf("get /me: %v", err)
	}

	displayName := me.GetDisplayName()
	email := me.GetMail()
	if email == nil {
		email = me.GetUserPrincipalName()
	}

	if displayName != nil {
		fmt.Printf("Hello, %s\n", *displayName)
	}
	if email != nil {
		fmt.Printf("Email: %s\n", *email)
	}
}
