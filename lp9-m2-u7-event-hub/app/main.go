package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/messaging/azeventhubs/v2"
	"github.com/Azure/azure-sdk-for-go/sdk/messaging/azeventhubs/v2/checkpoints"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/container"
)

func main() {
	var (
		mode          = flag.String("mode", "", "send|process")
		consumerGroup = flag.String("consumer-group", "training-cg", "Event Hubs consumer group")
		interval      = flag.Duration("interval", 2*time.Second, "send interval (send mode) or log tick (process mode)")
		count         = flag.Int("count", 0, "number of events to send (0 = forever)")
	)
	flag.Parse()

	if *mode != "send" && *mode != "process" {
		log.Fatal(`-mode is required and must be "send" or "process"`)
	}

	// Event Hubs identifiers
	eventHubNamespaceFQDN := "event-hub-test-ehns.servicebus.windows.net" // ex: <namespace>.servicebus.windows.net
	eventHubName := "training-events"               // ex: training-events

	// Checkpoint store (required for Processor)
	storageAccountURL := "https://eventhubtestaz204eh.blob.core.windows.net/" // ex: https://<account>.blob.core.windows.net/
	storageContainerName := "eventhub-checkpoints"

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Ctrl+C handling
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt)
	go func() {
		<-sig
		log.Println("Stopping...")
		cancel()
	}()

	credential, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		log.Fatalf("credential: %v", err)
	}

	switch *mode {
	case "send":
		if err := runSender(ctx, credential, eventHubNamespaceFQDN, eventHubName, *interval, *count); err != nil {
			log.Fatalf("send failed: %v", err)
		}
	case "process":
		if err := runProcessor(ctx, credential, eventHubNamespaceFQDN, eventHubName, *consumerGroup, storageAccountURL, storageContainerName); err != nil {
			log.Fatalf("process failed: %v", err)
		}
	}
}

func runSender(
	ctx context.Context,
	credential *azidentity.DefaultAzureCredential,
	eventHubNamespaceFQDN string,
	eventHubName string,
	interval time.Duration,
	count int,
) error {
	producerClient, err := azeventhubs.NewProducerClient(eventHubNamespaceFQDN, eventHubName, credential, nil)
	if err != nil {
		return fmt.Errorf("new producer: %w", err)
	}
	defer producerClient.Close(ctx)

	log.Printf("Sending to %s/%s using AAD...", eventHubNamespaceFQDN, eventHubName)

	sent := 0
	for {
		if count > 0 && sent >= count {
			log.Printf("Done. Sent %d events.", sent)
			return nil
		}

		batch, err := producerClient.NewEventDataBatch(ctx, nil)
		if err != nil {
			return fmt.Errorf("new batch: %w", err)
		}

		payload := []byte(fmt.Sprintf(`{"counter":%d,"ts":"%s"}`, sent, time.Now().UTC().Format(time.RFC3339Nano)))
		if err := batch.AddEventData(&azeventhubs.EventData{Body: payload}, nil); err != nil {
			return fmt.Errorf("add event: %w", err)
		}

		if err := producerClient.SendEventDataBatch(ctx, batch, nil); err != nil {
			return fmt.Errorf("send batch: %w", err)
		}

		sent++
		log.Printf("Sent event #%d", sent)

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(interval):
		}
	}
}

func runProcessor(
	ctx context.Context,
	credential *azidentity.DefaultAzureCredential,
	eventHubNamespaceFQDN string,
	eventHubName string,
	consumerGroup string,
	storageAccountURL string,
	storageContainerName string,
) error {
	consumerClient, err := azeventhubs.NewConsumerClient(eventHubNamespaceFQDN, eventHubName, consumerGroup, credential, nil)
	if err != nil {
		return fmt.Errorf("new consumer: %w", err)
	}
	defer consumerClient.Close(ctx)

	containerClient, err := container.NewClient(storageAccountURL+storageContainerName, credential, nil)
	if err != nil {
		return fmt.Errorf("new blob container client: %w", err)
	}

	checkpointStore, err := checkpoints.NewBlobStore(containerClient, nil)
	if err != nil {
		return fmt.Errorf("new checkpoint store: %w", err)
	}

	processor, err := azeventhubs.NewProcessor(consumerClient, checkpointStore, &azeventhubs.ProcessorOptions{
		UpdateInterval: 10 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("new processor: %w", err)
	}

	log.Printf("Processing from %s/%s consumerGroup=%s using AAD + blob checkpoints...", eventHubNamespaceFQDN, eventHubName, consumerGroup)

	// Run the processor with event handler
	dispatchPartitionClients := func() {
		for {
			partitionClient := processor.NextPartitionClient(ctx)
			if partitionClient == nil {
				break
			}

			go func(pc *azeventhubs.ProcessorPartitionClient) {
				defer pc.Close(ctx)
				for {
					receiveCtx, receiveCancel := context.WithTimeout(ctx, time.Minute)
					events, err := pc.ReceiveEvents(receiveCtx, 100, nil)
					receiveCancel()

					if err != nil && ctx.Err() == nil {
						log.Printf("receive error: %v", err)
						continue
					}

					if len(events) == 0 {
						continue
					}

					for _, event := range events {
						log.Printf("Event: partition=%s sequence=%d body=%s",
							pc.PartitionID(), event.SequenceNumber, string(event.Body))
					}

					// checkpoint the last event
					lastEvent := events[len(events)-1]
					if err := pc.UpdateCheckpoint(ctx, lastEvent, nil); err != nil {
						log.Printf("checkpoint error: %v", err)
					}
				}
			}(partitionClient)
		}
	}

	go dispatchPartitionClients()

	// Run the processor
	go func() {
		if err := processor.Run(ctx); err != nil {
			log.Printf("processor run error: %v", err)
		}
	}()

	// Block until context is cancelled
	<-ctx.Done()
	return nil
}
