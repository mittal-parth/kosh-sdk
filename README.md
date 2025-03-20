# Kosh SDK - TEE-based Tool Service for LLMs

A comprehensive SDK for deploying Trusted Execution Environment (TEE)-based tool services for Large Language Models (LLMs) using the MCP protocol.

## Overview

Kosh SDK provides a seamless solution for deploying secure tool services for LLMs in a Trusted Execution Environment. It handles the entire infrastructure, including hosting and request routing, while ensuring secure deployment and execution.

## Architecture

### Components

1. **Kosh Server (TEE-based)**
   - Deployed on Marlin Network
   - Handles secure execution of tools
   - Manages request routing and authentication
   - Implements MCP protocol for tool communication

2. **Kosh Client SDK**
   - Python-based SDK for easy integration
   - Provides high-level abstractions for tool deployment
   - Handles communication with the TEE server
   - Manages authentication and request signing

3. **SecretLLM Integration**
   - Optional secure LLM deployment
   - Seamless integration with TEE environment
   - Secure model serving capabilities

### Tech Stack

- **Backend**: Python, FastAPI
- **TEE**: Marlin Network
- **Protocol**: MCP (Model Control Protocol)
- **Security**: TEE-based execution, request signing
- **Optional**: SecretLLM for secure model serving

## Getting Started

### Prerequisites

- Python 3.8+
- Marlin Network account
- (Optional) SecretLLM setup

### Installation

```bash
pip install kosh-sdk
```

### Basic Usage

1. **Define Your Tool**

```python
from kosh_sdk import Tool, ToolService

class MyTool(Tool):
    def __init__(self):
        super().__init__(
            name="my_tool",
            description="Description of my tool",
            version="1.0.0"
        )
    
    async def execute(self, params):
        # Your tool logic here
        return {"result": "tool output"}

# Create and deploy your tool service
service = ToolService(
    tools=[MyTool()],
    marlin_config={
        "network": "mainnet",
        "account": "your_account"
    }
)

# Deploy to Marlin Network
service.deploy()
```

2. **Client Usage**

```python
from kosh_sdk import KoshClient

client = KoshClient(
    service_url="your_service_url",
    api_key="your_api_key"
)

# Execute tool
result = await client.execute_tool(
    tool_name="my_tool",
    params={"param1": "value1"}
)
```

## Security Features

- TEE-based execution environment
- Request signing and verification
- Secure parameter handling
- Rate limiting and access control

## License

MIT License - See LICENSE file for details

