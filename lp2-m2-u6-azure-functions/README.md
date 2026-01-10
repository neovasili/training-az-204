# Azure Functions Go Example

This is a Pulumi project that deploys a Golang Azure Function with a simple "Hello World" HTTP trigger.

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
- [Node.js](https://nodejs.org/) (for Pulumi)
- [Go](https://golang.org/dl/) 1.21 or later
- [Azure Functions Core Tools](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local)

## Project Structure

```
m2-u6-azure-functions/
├── index.ts                 # Pulumi infrastructure code
├── package.json             # Node.js dependencies for Pulumi
├── Pulumi.yaml              # Pulumi project configuration
├── Pulumi.test.yaml         # Pulumi stack configuration
└── function/                # Azure Function code
    ├── handler.go           # Go handler implementation
    ├── go.mod               # Go module file
    ├── host.json            # Function app configuration
    ├── local.settings.json  # Local development settings
    ├── Makefile             # Build automation
    ├── .gitignore           # Git ignore file
    ├── .funcignore          # Function deployment ignore file
    └── HelloWorld/
        └── function.json    # Function binding configuration
```

## Local Development

### Build the Go function

```bash
cd function
make build
```

### Run locally

```bash
cd function
func start
```

Test the function:
```bash
# GET request
curl "http://localhost:7071/api/HelloWorld?name=YourName"

# POST request
curl -X POST http://localhost:7071/api/HelloWorld \
  -H "Content-Type: application/json" \
  -d '{"name": "YourName"}'
```

## Deploy with Pulumi

### Initialize dependencies

```bash
# Install Node.js dependencies
pnpm install

# Initialize Go modules
cd function
go mod tidy
cd ..
```

### Login to Pulumi and Azure

```bash
pulumi login
az login
```

### Deploy

```bash
# Select or create stack
pulumi stack select test

# Preview changes
pulumi preview

# Deploy infrastructure
pulumi up
```

### Deploy the function code

After the infrastructure is deployed, you need to package and deploy the Go function:

```bash
cd function

# Build the Go binary for Linux
make build

# Create a deployment package
zip -r deploy.zip . -x "*.go" "go.mod" "go.sum" ".git*" ".vscode/*" "local.settings.json"

# Deploy using Azure Functions Core Tools
func azure functionapp publish $(pulumi stack output functionAppName)
```

### Test the deployed function

```bash
# Get the function URL
FUNCTION_URL=$(pulumi stack output functionAppUrl)

# Test the function
curl "$FUNCTION_URL?name=Azure"
```

## Clean Up

```bash
pulumi destroy
```

## How It Works

- **Custom Handler**: Azure Functions for Go uses a custom handler approach where your Go binary acts as an HTTP server
- **handler.go**: Implements an HTTP server that listens on the port specified by `FUNCTIONS_CUSTOMHANDLER_PORT`
- **function.json**: Defines the HTTP trigger binding for the HelloWorld function
- **host.json**: Configures the custom handler settings for the function app

The function accepts a `name` parameter via query string or request body and returns a JSON response with a greeting message.
