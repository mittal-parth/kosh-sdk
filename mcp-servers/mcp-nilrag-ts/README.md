# nilRAG TypeScript MCP Server

This is a TypeScript implementation of the Model Context Protocol (MCP) server for nilRAG, which acts as a wrapper around the existing Python nilRAG implementation.

## Overview

The nilRAG TypeScript server provides the same functionality as the Python version but is implemented in TypeScript. It works by:

1. Receiving MCP protocol requests from clients
2. Calling the underlying Python nilRAG functions via child processes
3. Returning the responses back to the client

## Tools

The server provides the following tools:

1. **initialize** - Initialize nilRAG schema and query
2. **upload_owner_data** - Upload data to nilDB
3. **client_query** - Query nilDB with NilAI using nilRAG

## Requirements

- Node.js (>= 18)
- npm
- Python environment with the Python nilRAG server installed

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Build the TypeScript:
   ```
   npm run build
   ```

3. Run the server:
   ```
   ./run_server.sh
   ```

## Development

- Source code is in the `src` directory
- Built JavaScript is in the `dist` directory
- `run_server.sh` is a helper script that builds and runs the server

## How it Works

The TypeScript server doesn't implement the nilRAG functionality itself; instead, it executes the Python implementation in child processes. This approach allows reusing the existing Python code without having to reimplement it in TypeScript.

When a tool is called:
1. The TypeScript server converts the arguments to JSON
2. It spawns a Python subprocess that imports the NilRAGManager from the Python implementation
3. It calls the appropriate method on the NilRAGManager
4. It captures the output and returns it to the client

## Environment Variables

The server uses the same environment variables as the Python nilRAG server:

- `NILRAG_ORG_SECRET_KEY` or `NILRAG_SECRET_KEY`
- `NILRAG_ORG_DID`
- `NILAI_API_URL`
- `NILAI_API_TOKEN`
- `NILRAG_CONFIG_PATH` 