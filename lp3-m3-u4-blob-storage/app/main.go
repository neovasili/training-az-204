package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
)

func uploadFile(client *azblob.Client, containerName, blobName, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("open file: %v", err)
	}
	defer file.Close()

	_, err = client.UploadFile(
		context.Background(),
		containerName,
		blobName,
		file,
		&azblob.UploadFileOptions{},
	)
	if err != nil {
		return fmt.Errorf("upload failed: %v", err)
	}

	return nil
}

func deleteFile(ctx context.Context, client *azblob.Client, containerName string, blobName string) error {
	// 1) List all blobs with versions included, filtered by prefix=blobName
	pager := client.NewListBlobsFlatPager(containerName, &azblob.ListBlobsFlatOptions{
		Prefix: &blobName,
		Include: azblob.ListBlobsInclude{
			Versions: true,
		},
	})

	// 2) Delete every version we find that matches the exact blob name.
	//    We delete versions first, then delete the base blob at the end.
	var found bool

	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return fmt.Errorf("list blobs (with versions): %w", err)
		}

		for _, item := range page.Segment.BlobItems {
			if item.Name == nil || *item.Name != blobName {
				continue
			}
			found = true

			// If VersionID is present, this entry represents a specific version.
			if item.VersionID != nil && *item.VersionID != "" {
				_, err = client.DeleteBlob(ctx, containerName, blobName, &azblob.DeleteBlobOptions{})
				if err != nil {
					return fmt.Errorf("delete version %s of %s: %w", *item.VersionID, blobName, err)
				}
			}
		}
	}

	if !found {
		// Nothing to delete (blob not found).
		return nil
	}

	// 3) Delete the base blob (current version / root)
	_, err := client.DeleteBlob(ctx, containerName, blobName, nil)
	if err != nil {
		return fmt.Errorf("delete base blob %s: %w", blobName, err)
	}

	return nil
}

func listBlobs(client *azblob.Client, containerName string) error {
	pager := client.NewListBlobsFlatPager(containerName, nil)

	fmt.Println("Blobs in container:")
	for pager.More() {
		page, err := pager.NextPage(context.Background())
		if err != nil {
			return fmt.Errorf("list blobs: %v", err)
		}

		for _, blob := range page.Segment.BlobItems {
			fmt.Printf("- %s\n", *blob.Name)
		}
	}

	return nil
}

func downloadFile(ctx context.Context, client *azblob.Client, containerName, blobName, downloadPath string) error {
	// Ensure destination folder exists
	if err := os.MkdirAll(filepath.Dir(downloadPath), 0o755); err != nil {
		return fmt.Errorf("mkdir dest dir: %w", err)
	}

	// Download
	resp, err := client.DownloadStream(ctx, containerName, blobName, nil)
	if err != nil {
		return fmt.Errorf("download stream: %w", err)
	}
	defer resp.Body.Close()

	file, err := os.Create(downloadPath)
	if err != nil {
		return fmt.Errorf("create file: %v", err)
	}
	defer file.Close()

	if _, err := io.Copy(file, resp.Body); err != nil {
		return fmt.Errorf("write dest file: %w", err)
	}

	return nil
}

func main() {
	accountName := "neovasilistorageaz204"
	containerName := "data"

	var filePath string
	var mode string
	flag.StringVar(&filePath, "file", "", "Specify file path to upload")
	flag.StringVar(&mode, "mode", "upload", "Specify mode (upload/list/download/delete)")
	flag.Parse()

	if filePath == "" && mode != "list" {
		log.Fatalf("file path is required")
	}

	// Check if file exists
	if mode == "upload" {
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			log.Fatalf("file does not exist: '%s'", filePath)
		}
	}

	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		log.Fatalf("credential error: %v", err)
	}

	blobURL := fmt.Sprintf("https://%s.blob.core.windows.net/", accountName)

	client, err := azblob.NewClient(blobURL, cred, nil)
	if err != nil {
		log.Fatalf("client error: %v", err)
	}

	switch mode {
	case "upload":
		fmt.Printf("Uploading file: '%s'\n", filePath)
		blobName := filepath.Base(filePath)
		err = uploadFile(client, containerName, blobName, filePath)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Uploaded %s to container %s\n", blobName, containerName)
	case "delete":
		fmt.Printf("Deleting file: '%s'\n", filePath)
		blobName := filepath.Base(filePath)
		err = deleteFile(context.Background(), client, containerName, blobName)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Deleted %s from container %s\n", blobName, containerName)
	case "list":
		err = listBlobs(client, containerName)
		if err != nil {
			log.Fatal(err)
		}
	case "download":
		fmt.Printf("Downloading file: '%s'\n", filePath)
		blobName := filepath.Base(filePath)
		downloadPath := fmt.Sprintf("downloaded-%s", blobName)
		err = downloadFile(context.Background(), client, containerName, blobName, downloadPath)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Downloaded %s to %s\n", blobName, downloadPath)
	default:
		log.Fatalf("unsupported mode: %s", mode)
	}
}
