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
	"github.com/Azure/azure-sdk-for-go/sdk/messaging/azservicebus"
)

func main() {
	var (
		mode     = flag.String("mode", "", "send|receive")
		interval = flag.Duration("interval", 2*time.Second, "send interval (send mode)")
		count    = flag.Int("count", 0, "messages to send (0 = forever) (send mode)")
	)
	flag.Parse()

	if *mode != "send" && *mode != "receive" {
		log.Fatal(`-mode is required and must be "send" or "receive"`)
	}

	serviceBusNamespaceFqdn := "service-bus-test-sbns.servicebus.windows.net"
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

	client, err := azservicebus.NewClient(serviceBusNamespaceFqdn, credential, nil)
	if err != nil {
		log.Fatalf("service bus client: %v", err)
	}
	defer client.Close(ctx)

	switch *mode {
	case "send":
		if err := runSender(ctx, client, queueName, *interval, *count); err != nil {
			log.Fatalf("send failed: %v", err)
		}
	case "receive":
		if err := runReceiver(ctx, client, queueName); err != nil {
			log.Fatalf("receive failed: %v", err)
		}
	}
}

func runSender(ctx context.Context, client *azservicebus.Client, queueName string, interval time.Duration, count int) error {
	sender, err := client.NewSender(queueName, nil)
	if err != nil {
		return fmt.Errorf("new sender: %w", err)
	}
	defer sender.Close(ctx)

	log.Printf("Sending to queue=%s using AAD...", queueName)

	sent := 0
	for {
		if count > 0 && sent >= count {
			log.Printf("Done. Sent %d messages.", sent)
			return nil
		}

		body := fmt.Sprintf(`{"counter":%d,"ts":"%s"}`, sent, time.Now().UTC().Format(time.RFC3339Nano))
		message := &azservicebus.Message{
			Body: []byte(body),
		}

		if err := sender.SendMessage(ctx, message, nil); err != nil {
			return fmt.Errorf("send message: %w", err)
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

func runReceiver(ctx context.Context, client *azservicebus.Client, queueName string) error {
	receiver, err := client.NewReceiverForQueue(queueName, nil)
	if err != nil {
		return fmt.Errorf("new receiver: %w", err)
	}
	defer receiver.Close(ctx)

	log.Printf("Receiving from queue=%s using AAD...", queueName)

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		receiveCtx, receiveCancel := context.WithTimeout(ctx, 30*time.Second)
		messages, err := receiver.ReceiveMessages(receiveCtx, 10, nil)
		receiveCancel()

		if err != nil {
			// With no messages, the SDK can return context deadline exceeded due to our timeout.
			// Treat it as "no messages right now".
			if err == context.DeadlineExceeded {
				continue
			}
			return fmt.Errorf("receive messages: %w", err)
		}

		for _, message := range messages {
			log.Printf("Received: messageId=%s body=%s", safeString(&message.MessageID), string(message.Body))

			// Complete (peek-lock pattern)
			if err := receiver.CompleteMessage(ctx, message, nil); err != nil {
				return fmt.Errorf("complete message: %w", err)
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
