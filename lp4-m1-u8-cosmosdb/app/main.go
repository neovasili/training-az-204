package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azcosmos"
)

type Item struct {
	PK        string `json:"mypartitionkey,omitempty"`
	ID        string `json:"id"`
	Category  string `json:"category"` // partition key
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

func insertItem(container *azcosmos.ContainerClient) error {
	item := Item{
		PK:        "whatever",
		ID:        "item-" + fmt.Sprint(time.Now().Unix()),
		Category:  "demo",
		Name:      "Hello Cosmos",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}

	body, err := json.Marshal(item)
	if err != nil {
		return fmt.Errorf("marshal item: %v", err)
	}

	pk := azcosmos.NewPartitionKeyString(item.PK)

	start := time.Now()
	resp, err := container.CreateItem(
		context.Background(),
		pk,
		body,
		nil,
	)
	elapsed := time.Since(start)
	if err != nil {
		return fmt.Errorf("create item: %v", err)
	}

	fmt.Printf("Inserted item\n")
	fmt.Printf("Client latency: %d ms\n", elapsed.Milliseconds())

	if resp.RawResponse != nil {
		h := resp.RawResponse.Header
		// Some Cosmos APIs include server-time style headers; if present you can print them:
		serverLatency := h.Get("x-ms-server-time-ms")
		if serverLatency != "" {
			fmt.Printf("Server latency: %s ms\n", serverLatency)
		} else {
			fmt.Println("Server latency: not provided by service")
		}
	}
	fmt.Printf("RU charge: %.2f\n", resp.RequestCharge)

	return nil
}

func listItemsByPartition(container *azcosmos.ContainerClient, partitionKey string) error {
	ctx := context.Background()

	query := "SELECT * FROM c"
	pk := azcosmos.NewPartitionKeyString(partitionKey)

	pager := container.NewQueryItemsPager(query, pk, nil)

	start := time.Now()

	var totalRU float32
	var serverMsTotal int64
	var serverMsSamples int64
	var itemCount int

	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return fmt.Errorf("query page: %w", err)
		}

		totalRU += page.RequestCharge

		// Accumulate server latency if Cosmos provides it
		if page.RawResponse != nil {
			if v := page.RawResponse.Header.Get("x-ms-server-time-ms"); v != "" {
				if ms, err := strconv.ParseInt(v, 10, 64); err == nil {
					serverMsTotal += ms
					serverMsSamples++
				}
			}
		}

		for _, b := range page.Items {
			var doc Item
			if err := json.Unmarshal(b, &doc); err != nil {
				return err
			}
			// Print item or process it as needed
			fmt.Printf("- Item ID: %s, Name: %s, CreatedAt: %s\n",
				doc.ID, doc.Name, doc.CreatedAt)
			itemCount++
		}
	}

	clientLatency := time.Since(start)

	fmt.Println("Query completed")
	fmt.Printf("Items: %d\n", itemCount)
	fmt.Printf("Client latency: %d ms\n", clientLatency.Milliseconds())

	if serverMsSamples > 0 {
		fmt.Printf("Server latency: %d ms\n", serverMsTotal)
		fmt.Printf("Server latency average: %.2f ms\n",
			float64(serverMsTotal)/float64(serverMsSamples))
	} else {
		fmt.Println("Server latency: not provided by service")
	}
	fmt.Printf("Total RU charge: %.2f\n", totalRU)

	return nil
}

func deleteItem(container *azcosmos.ContainerClient, partitionKey string, itemID string) error {
	ctx := context.Background()
	pk := azcosmos.NewPartitionKeyString(partitionKey)

	start := time.Now()
	resp, err := container.DeleteItem(ctx, pk, itemID, nil)
	clientLatency := time.Since(start)

	if err != nil {
		return fmt.Errorf("delete item (id=%s pk=%s): %w", itemID, partitionKey, err)
	}

	// RU charge (Cosmos-provided)
	totalRU := resp.RequestCharge

	// Server latency (optional header; may be absent)
	serverLatency := "not provided by service"
	if resp.RawResponse != nil {
		if v := resp.RawResponse.Header.Get("x-ms-server-time-ms"); v != "" {
			serverLatency = v
		}
	}

	fmt.Printf("Delete complete\n")
	fmt.Printf("Client latency: %d ms\n", clientLatency.Milliseconds())
	fmt.Printf("Server latency: %s ms\n", serverLatency)
	fmt.Printf("RU charge: %.2f\n", totalRU)

	return nil
}


func main() {
	endpoint := "https://neovasilicosmosaz204.documents.azure.com:443/"
	dbName := "mydatabase"
	containerName := "mycontainer"

	var mode string
	var itemID string
	flag.StringVar(&mode, "mode", "upload", "Specify mode (insert/list/delete)")
	flag.StringVar(&itemID, "item", "", "Item ID for delete mode")
	flag.Parse()

	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		log.Fatal(err)
	}

	client, err := azcosmos.NewClient(endpoint, cred, nil)
	if err != nil {
		log.Fatal(err)
	}

	container, err := client.NewContainer(dbName, containerName)
	if err != nil {
		log.Fatal(err)
	}

	switch mode {
	case "insert":
		fmt.Println("Inserting item...")
		err = insertItem(container)
		if err != nil {
			log.Fatal(err)
		}
	case "list":
		fmt.Println("Listing items...")
		err = listItemsByPartition(container, "whatever")
		if err != nil {
			log.Fatal(err)
		}
	case "delete":
		if itemID == "" {
			log.Fatal("item ID is required for delete mode")
		}
		err = deleteItem(container, "whatever", itemID)
		if err != nil {
			log.Fatal(err)
		}
	default:
		log.Fatalf("unknown mode: %s", mode)
	}
}
