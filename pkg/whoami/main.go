package whoami

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armsubscriptions"
	msgraphsdkgo "github.com/microsoftgraph/msgraph-sdk-go"
)

type IdentityInfo struct {
	DisplayName    string
	ObjectID       string
	TenantID       string
	Subscription   string
	SubscriptionID string
}

func WhoAmI(ctx context.Context, cred *azidentity.DefaultAzureCredential) (*IdentityInfo, error) {
	// ----- Tenant (from token) -----
	token, err := cred.GetToken(ctx, policy.TokenRequestOptions{
		Scopes: []string{"https://management.azure.com/.default"},
	})
	if err != nil {
		return nil, err
	}

	// Parse JWT token to extract tenant ID
	parts := strings.Split(token.Token, ".")
	if len(parts) < 2 {
		return nil, fmt.Errorf("invalid token format")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode token payload: %w", err)
	}

	var claims map[string]interface{}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("failed to parse token claims: %w", err)
	}

	tenantID, ok := claims["tid"].(string)
	if !ok {
		return nil, fmt.Errorf("tenant ID not found in token")
	}

	// ----- Subscriptions -----
	subClient, err := armsubscriptions.NewClient(cred, nil)
	if err != nil {
		return nil, err
	}

	pager := subClient.NewListPager(nil)
	var subName, subID string
	if pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		if len(page.Value) > 0 {
			subName = *page.Value[0].DisplayName
			subID = *page.Value[0].SubscriptionID
		}
	}

	// ----- Microsoft Graph (identity) -----
	graph, err := msgraphsdkgo.NewGraphServiceClientWithCredentials(cred, []string{"https://graph.microsoft.com/.default"})
	if err != nil {
		return nil, err
	}

	me, err := graph.Me().Get(ctx, nil)
	if err != nil {
		return nil, err
	}

	return &IdentityInfo{
		DisplayName:    *me.GetDisplayName(),
		ObjectID:       *me.GetId(),
		TenantID:       tenantID,
		Subscription:   subName,
		SubscriptionID: subID,
	}, nil
}
