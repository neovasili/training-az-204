package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore/messaging"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/to"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/messaging/eventgrid/azeventgrid"
)

func main() {
	endpoint := "https://neovasiliaz204topic.westeurope-1.eventgrid.azure.net/api/events"
	// topicName := "neovasiliaz204topic"

	credential, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		log.Fatalf("credential: %v", err)
	}

	// AAD auth publisher for Event Grid *topics* (not namespaces)
	client, err := azeventgrid.NewClient(endpoint, credential, nil)
	if err != nil {
		log.Fatalf("eventgrid client: %v", err)
	}

	log.Println("Publishing CloudEvents to Event Grid topic with AAD...")

	ctx := context.Background()

	for i := 0; ; i++ {
		events := []messaging.CloudEvent{
			{
				SpecVersion:     "1.0",
				ID:              fmt.Sprintf("msg-%d-%d", time.Now().Unix(), i),
				Source:          "az204/eventgrid/go",
				Type:            "demo.message",
				Subject:         to.Ptr("training"),
				Time:            to.Ptr(time.Now().UTC()),
				DataContentType: to.Ptr("application/json"),
				Data:            []byte(fmt.Sprintf(`{"counter":%d,"ts":"%s"}`, i, time.Now().UTC().Format(time.RFC3339Nano))),
			},
		}

		_, err := client.PublishCloudEvents(ctx, events, nil)
		if err != nil {
			log.Printf("publish failed: %v", err)
		} else {
			log.Printf("published event id=%s", events[0].ID)
		}

		time.Sleep(5 * time.Second)
	}
}