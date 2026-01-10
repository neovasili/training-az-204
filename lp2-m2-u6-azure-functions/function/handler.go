package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// HelloWorldResponse represents the response structure
type HelloWorldResponse struct {
	Message string `json:"message"`
}

// HelloWorldHandler handles the HTTP request
func HelloWorldHandler(w http.ResponseWriter, r *http.Request) {
	// Read the request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request body", http.StatusBadRequest)
		return
	}

	// Get name from query parameters or body
	name := r.URL.Query().Get("name")
	if name == "" {
		var data map[string]interface{}
		if len(body) > 0 {
			if err := json.Unmarshal(body, &data); err == nil {
				if n, ok := data["name"].(string); ok {
					name = n
				}
			}
		}
	}

	// Default name if not provided
	if name == "" {
		name = "World"
	}

	// Create response
	response := HelloWorldResponse{
		Message: fmt.Sprintf("Hello, %s! Welcome to Azure Functions with Go!", name),
	}

	// Set response headers
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	// Encode and send response
	json.NewEncoder(w).Encode(response)
}

func main() {
	customHandlerPort, exists := os.LookupEnv("FUNCTIONS_CUSTOMHANDLER_PORT")
	if !exists {
		customHandlerPort = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/HelloWorld", HelloWorldHandler)

	fmt.Printf("Go server listening on port %s\n", customHandlerPort)
	http.ListenAndServe(":"+customHandlerPort, mux)
}
