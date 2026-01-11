package main

import (
	"context"
	"fmt"
	"log"

	"github.com/AzureAD/microsoft-authentication-library-for-go/apps/public"
)

func main() {
	clientId := "0a9bfd9c-9baf-41ec-a135-ac9dfe0a6d7a"
	tenantId := "06b1722b-c9c0-4bfd-a011-0ce9ece4a630"

	if clientId == "" || tenantId == "" {
		log.Fatal("CLIENT_ID and TENANT_ID must be set")
	}

	scopes := []string{"User.Read"}

	authority := fmt.Sprintf("https://login.microsoftonline.com/%s", tenantId)

	// Create MSAL public client
	app, err := public.New(
		clientId,
		public.WithAuthority(authority),
	)
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()

	var result public.AuthResult

	result, err = app.AcquireTokenInteractive(ctx, scopes)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Access Token:")
	fmt.Println(result.AccessToken)
}
