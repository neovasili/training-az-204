package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"time"
	"flag"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/keyvault/azsecrets"
)

func randomValue(nBytes int) (string, error) {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	// URL-safe base64, no padding (nice for secrets)
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func upsertSecret(secretName, value string, client *azsecrets.Client) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	resp, err := client.SetSecret(ctx, secretName, azsecrets.SetSecretParameters{Value: &value}, nil)
	if err != nil {
		return err
	}

	fmt.Printf("Secret set: '%s'\n", *resp.ID)
	return nil
}

func listSecrets(client *azsecrets.Client) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pager := client.NewListSecretsPager(nil)

	fmt.Println("Secrets in vault:")
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return err
		}
		for _, secret := range page.Value {
			fmt.Printf("- %s\n", *secret.ID)
		}
	}

	return nil
}

func deleteSecret(secretName string, client *azsecrets.Client) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err := client.DeleteSecret(ctx, secretName, nil)
	if err != nil {
		return err
	}

	for i := 0; i < 3; i++ {
		_, err = client.PurgeDeletedSecret(ctx, secretName, nil)
		if err == nil {
			break
		}
		// Check if it's a 409 conflict (secret not yet fully deleted)
		if i < 2 {
			time.Sleep(5 * time.Second)
			continue
		}
		return err
	}

	fmt.Printf("Secret deleted: '%s'\n", secretName)
	return nil
}

func main() {
	var mode string
	flag.StringVar(&mode, "mode", "upsert", "Specify mode (upsert/list/delete)")
	flag.Parse()

	vaultURL := "https://neovasilicoaz204kv.vault.azure.net/"
	if vaultURL == "" {
		log.Fatal("KEYVAULT_URL env var is required (e.g. https://<vault>.vault.azure.net/)")
	}

	secretName := "demo-secret"

	value, err := randomValue(32)
	if err != nil {
		log.Fatalf("random value: %v", err)
	}

	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		log.Fatalf("credential: %v", err)
	}

	client, err := azsecrets.NewClient(vaultURL, cred, nil)
	if err != nil {
		log.Fatalf("key vault client: %v", err)
	}

	switch mode {
	case "upsert":
		if err := upsertSecret(secretName, value, client); err != nil {
			log.Fatalf("upsert secret: %v", err)
		}
	case "list":
		if err := listSecrets(client); err != nil {
			log.Fatalf("list secrets: %v", err)
		}
	case "delete":
		if err := deleteSecret(secretName, client); err != nil {
			log.Fatalf("delete secret: %v", err)
		}
	default:
		log.Fatalf("unknown mode: %s", mode)
	}
}
