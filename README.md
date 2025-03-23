# Kosh - Secure Tool Services Platform for LLMs using TEEs

A comprehensive platform for deploying Trusted Execution Environment (TEE)-based tool services for Large Language Models (LLMs) using the MCP (Model Control Protocol).

## Overview

Kosh provides a seamless solution for deploying secure tool services for LLMs in a Trusted Execution Environment. It handles infrastructure for hosting and request routing while ensuring secure deployment and execution through Nillion and Merlin TEE technologies.

## Components

The project consists of two main parts:

### Frontend

The Kosh frontend provides a user interface for interacting with the various MCP services. It offers:

- Service configuration and management dashboard
- Real-time monitoring of MCP service activity
- User authentication and access control
- Integration with TEE secure environments

### MCP Services

Kosh includes four main MCP services:

1. **MCP Brave** - MCP server for integration with Brave browser
2. **MCP Slack** - MCP server for Slack integration
3. **MCP GitHub** - MCP server for GitHub integration
4. **MCP Nilrag** - Core MCP server providing secure computation capabilities

## Setup and Configuration

### MCP Client Configuration

To add Kosh services to your MCP client (e.g., Claude), use the following configuration:

```json
{
  "mcpServers": {
    "nilrag-brave": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://dadc-2409-40f2-15a-d04a-ec2f-ff68-c1e7-5a5c.ngrok-free.app/mcp"
      ]
    }
  }
}
```

This configuration should be added to your MCP client's configuration file.

### Prerequisites

- Node.js 16+ and npm
- Python 3.11+ (for some components)
- Docker and Docker Compose (for containerized deployment)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/kosh.git
cd kosh
```

2. Install dependencies for the frontend:
```bash
cd frontend
npm install
```

3. Install dependencies for each service as needed.

4. Start the frontend development server:
```bash
npm run dev
```

## Security Features

### Trusted Execution Environments (TEEs)

Kosh leverages TEEs to provide secure computation environments where sensitive data remains protected even during processing. The implementation uses:

- **Nillion** - A secure computation network that decentralizes trust for high-value data
- **Merlin** - Advanced TEE technology providing isolated execution environments

This combination ensures:
- Data privacy during computation
- Secure parameter handling
- Protection against side-channel attacks
- Tamper-proof execution environments

## Project Structure

- `/frontend` - User interface for service management and monitoring
- `/mcp-servers` - Contains the four MCP server implementations
- `/common` - Shared utilities and libraries
- `/operations` - Operational tools and scripts
- `/marlin` - Integration with Marlin Network for TEE capabilities

## License

MIT License - See LICENSE file for details

## Support

For more information about Nillion and secure TEE-based development, visit [Nillion Documentation](https://docs.nillion.com/).

