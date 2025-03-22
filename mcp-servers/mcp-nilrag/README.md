# nilRAG Integration with Claude Desktop

This folder contains the server implementation for integrating nilRAG with Claude Desktop, allowing you to use nilRAG as a tool within Claude.

## Setup Instructions

### Prerequisites

1. Install the `nilrag` package and its dependencies according to the main [nilRAG instructions](../README.md).
2. Make sure you have a Nillion organization account with access to nilDB and nilAI.

### Configuration

The nilRAG server uses environment variables for configuration. There are two ways to configure it:

#### Option 1: Configure Claude Desktop Using Environment Variables (Recommended)

Edit the `claude_desktop_config.json` file in this directory:

```json
{
  "mcpServers": {
    "nilrag": {
      "command": "/bin/bash",
      "args": [
        "/path/to/nilrag/nilRag/run_server.sh"
      ],
      "env": {
        "NILRAG_ORG_SECRET_KEY": "your-secret-key",
        "NILRAG_ORG_DID": "your-org-did",
        "NILAI_API_TOKEN": "your-nilai-token",
        "NILAI_API_URL": "https://nilai-url.nillion.network"
      }
    }
  }
}
```

Replace the paths and values with your actual configuration. The server will automatically:
1. Create a config file from the sample if needed
2. Populate it with your organization credentials
3. Initialize the schema and query when first used

#### Option 2: Use Pre-configured nilDB Config File

If you prefer to use a pre-existing nilDB config file:

1. Create your config file following the main nilRAG instructions
2. Configure Claude Desktop to use this file:

```json
{
  "mcpServers": {
    "nilrag": {
      "command": "/bin/bash",
      "args": [
        "/path/to/nilrag/nilRag/run_server.sh"
      ],
      "env": {
        "NILRAG_CONFIG_PATH": "/full/path/to/your/nildb_config.json",
        "NILAI_API_TOKEN": "your-nilai-token",
        "NILAI_API_URL": "https://nilai-url.nillion.network"
      }
    }
  }
}
```

### Installing the Configuration in Claude Desktop

1. Locate your Claude Desktop config directory:
   - Mac: `~/Library/Application Support/Claude/`
   - Windows: `%APPDATA%\Claude\`
   - Linux: `~/.config/Claude/`

2. Copy your `claude_desktop_config.json` file to this directory.

3. Restart Claude Desktop.

## Available Tools

The nilRAG integration provides three tools in Claude:

1. **initialize**: Initializes the nilRAG schema and query. This is automatically called when needed.

2. **upload_owner_data**: Uploads documents to nilDB.
   - Parameters:
     - `file_path`: Path to the file to upload (optional)
     - `file_content`: Direct content to upload (optional)
     - `chunk_size`: Maximum number of words per chunk (default: 50)
     - `overlap`: Number of overlapping words between chunks (default: 10)

3. **client_query**: Queries nilDB with nilAI.
   - Parameters:
     - `prompt`: The query prompt (required)
     - `model`: Model to use (default: "meta-llama/Llama-3.1-8B-Instruct")
     - `temperature`: Temperature for completion (default: 0.2)
     - `max_tokens`: Maximum tokens to generate (default: 2048)

## Troubleshooting

If you encounter issues:

1. Check that your virtual environment is properly set up with all dependencies.
2. Verify your organization credentials and API tokens.
3. Make sure the paths in the configuration are absolute and correctly point to your files.
4. Check Claude Desktop logs for any error messages.
5. If initialization fails, try running the initialization script from the main nilRAG package manually. 