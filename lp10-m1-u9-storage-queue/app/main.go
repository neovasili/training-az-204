package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azqueue"
)

func main() {
	var (
		mode     = flag.String("mode", "", "send|receive")
		interval = flag.Duration("interval", 2*time.Second, "send interval (send mode) / poll interval (receive mode)")
		count    = flag.Int("count", 0, "messages to send (0 = forever) (send mode)")
	)
	flag.Parse()

	if *mode != "send" && *mode != "receive" {
		log.Fatal(`-mode is required and must be "send" or "receive"`)
	}

	queueServiceURL := "https://storagequeuetestaz204q.queue.core.windows.net"
	queueName := "training-queue"

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

	serviceClient, err := azqueue.NewServiceClient(queueServiceURL, credential, nil)
	if err != nil {
		log.Fatalf("queue service client: %v", err)
	}

	queueClient := serviceClient.NewQueueClient(queueName)

	switch *mode {
	case "send":
		if err := runSender(ctx, queueClient, *interval, *count); err != nil {
			log.Fatalf("send failed: %v", err)
		}
	case "receive":
		if err := runReceiver(ctx, queueClient, *interval); err != nil {
			log.Fatalf("receive failed: %v", err)
		}
	}
}

func runSender(ctx context.Context, queueClient *azqueue.QueueClient, interval time.Duration, count int) error {
	log.Printf("Sending to storage queue=%s using AAD...", queueClient.URL())

	sent := 0
	for {
		if count > 0 && sent >= count {
			log.Printf("Done. Sent %d messages.", sent)
			return nil
		}

		body := fmt.Sprintf(`{"counter":%d,"ts":"%s"}`, sent, time.Now().UTC().Format(time.RFC3339Nano))

		_, err := queueClient.EnqueueMessage(ctx, body, nil)
		if err != nil {
			return fmt.Errorf("enqueue message: %w", err)
		}

		sent++
		log.Printf("Sent message #%d", sent)

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(interval):
		}
	}
}

func runReceiver(ctx context.Context, queueClient *azqueue.QueueClient, pollInterval time.Duration) error {
	log.Printf("Receiving from storage queue=%s using AAD...", queueClient.URL())

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		receiveCtx, receiveCancel := context.WithTimeout(ctx, 30*time.Second)
		dequeueResponse, err := queueClient.DequeueMessages(receiveCtx, &azqueue.DequeueMessagesOptions{
			NumberOfMessages:  toPtr(int32(10)),
			VisibilityTimeout: toPtr(int32(30)), // seconds (messages become visible again if not deleted)
		})
		receiveCancel()

		if err != nil {
			// If nothing is returned before the timeout, treat it as "no messages right now".
			if errors.Is(err, context.DeadlineExceeded) {
				time.Sleep(pollInterval)
				continue
			}
			return fmt.Errorf("dequeue messages: %w", err)
		}

		if len(dequeueResponse.Messages) == 0 {
			time.Sleep(pollInterval)
			continue
		}

		for _, message := range dequeueResponse.Messages {
			log.Printf("Received: messageId=%s body=%s", safeString(message.MessageID), safeString(message.MessageText))

			// Delete using messageId + popReceipt
			_, err := queueClient.DeleteMessage(ctx, safeString(message.MessageID), safeString(message.PopReceipt), nil)
			if err != nil {
				return fmt.Errorf("delete message: %w", err)
			}
		}
	}
}

func safeString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func toPtr[T any](value T) *T {
	return &value
}
