package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azappconfig"

	"github.com/neovasili/training-az-204/pkg/whoami"
)

type FeatureFlag struct {
	ID      string `json:"id"`
	Enabled bool   `json:"enabled"`
}

func getFeatureFlag(ctx context.Context, client *azappconfig.Client, flagName string) (bool, error) {
	key := ".appconfig.featureflag/" + flagName

	resp, err := client.GetSetting(ctx, key, nil)
	if err != nil {
		return false, err
	}

	var ff FeatureFlag
	if err := json.Unmarshal([]byte(*resp.Value), &ff); err != nil {
		return false, err
	}

	return ff.Enabled, nil
}

func main() {
	endpoint := "https://appconfigurationstore476ccaa5.azconfig.io"
	if endpoint == "" {
		log.Fatal("APPCONFIG_ENDPOINT is required")
	}

	flags := []string{
		"BetaFeature",
		"BetaFeature:NewUI",
	}

	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		log.Fatalf("credential: %v", err)
	}

	client, err := azappconfig.NewClient(endpoint, cred, nil)
	if err != nil {
		log.Fatalf("appconfig client: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	idInfo, err := whoami.WhoAmI(ctx, cred)
	if err != nil {
		log.Fatalf("whoami: %v", err)
	}
	fmt.Printf("WHOAMI:\n")
	fmt.Printf("DisplayName: %+v\n", idInfo.DisplayName)
	fmt.Printf("ObjectID: %+v\n", idInfo.ObjectID)
	fmt.Printf("TenantID: %+v\n", idInfo.TenantID)
	fmt.Printf("SubscriptionID: %+v\n", idInfo.SubscriptionID)
	fmt.Println("----------------------")

	// Ctrl+C handling
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt)
	go func() {
		<-sig
		fmt.Println("\nStopping...")
		cancel()
	}()

	lastState := map[string]bool{}

	fmt.Println("Watching feature flags...")

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		for _, flag := range flags {
			enabled, err := getFeatureFlag(ctx, client, flag)
			if err != nil {
				log.Printf("read %s: %v", flag, err)
				continue
			}

			prev, exists := lastState[flag]
			if !exists || prev != enabled {
				state := "DISABLED"
				if enabled {
					state = "ENABLED"
				}
				fmt.Printf("[%s] %s -> %s\n", time.Now().Format(time.RFC3339), flag, state)
				lastState[flag] = enabled
			}
		}

		time.Sleep(5 * time.Second)
	}
}
