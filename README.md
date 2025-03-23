# 🧰 Kosh

Simple and secure way to interact with remote MCP Servers in Trusted Execution Environments (TEEs) with no coding required.

## 🤔 Problems Identified

- [Anthropic's Model Context Protocol (MCP)](https://www.anthropic.com/news/model-context-protocol) is fairly new and currently requires manual setup and some familiarity with coding.
- Since MCP enables users to interact with their private data, it becomes increasingly important to keep the data and execution environment secure.

## ⚡️ Solution

- Connect to MCP Servers in just a few clicks, with absolutely no coding required.
  1. Select the servers you need. Currently offers 4 servers:
      - Brave Search [Add search capabilities to your chatbot]
      - Slack [Interact with Slack]
      - GitHub [Interact with GitHub]
      - RAG (Retrieval Augmented Generation) capabilities powered by [Nilrag](https://github.com/NillionNetwork/nilrag/tree/main). We built a custom nilRAG MCP server to allow users to upload any data, store them securely in a nilDB and query them using nilAI. 
  2. Provide the API keys required.
  3. Start interacting with the server in real time.
- All the MCP servers are deployed in a [TEE](https://docs.trustauthority.intel.com/main/articles/concept-tees-overview.html) environment powered by [Marlin](https://docs.marlin.org/oyster/introduction-to-marlin/), meaning all interactions are private and hardware-level secure.
- We modified the existing community MCP servers to support [Cloudflare's Remote MCP](https://developers.cloudflare.com/agents/guides/remote-mcp-server/) protocol. This eliminates the need for running local proxy servers and allows users to access MCP servers from anywhere, rather than requiring them to be on the same machine as the client.


So imagine a scenario like this which can be built with just a few clicks:

🔥 An AI powered on-call engineer that can:

1. Access your GitHub repository and fetch a new issue/on-call ticket.
2. Look at your runbooks and documents using nilRAG.
3. Search the web using Brave Search.
4. Look at past issues and pull requests in GitHub.
5. Look at your organisation's Slack messages related to the issue.
6. Post a summary of the triage on Slack.

All of this being secure and private.

## 🛠️ Local Setup and Configuration

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

3. Start the frontend development server:
```bash
npm run dev
```

4. Install dependencies for each service as needed.

```bash
cd mcp-servers/<name-of-the-server>
npm install
```

5. Start the MCP server:
```bash
npm run dev
```

6. You might need to edit the ports exposed for each MCP Server in `frontend/src/components/Sidebar.tsx` to match the ports you have exposed for each MCP Server.

```
export const MCP_SERVERS: Record<string, ServerConfig> = {
  "Brave Search": {
    url: "http://localhost:5177/mcp",
    enabled: false,
    description: "Search the web using Brave",
    icon: "🦁",
  },
  Slack: {
    url: "http://localhost:5176/mcp",
    enabled: false,
    description: "Chat with your team on Slack",
    icon: "💬",
  },
  // Add more server configurations here
};
```

## Using our remote MCP servers with Claude Desktop

It is not necessary to use our MCP Servers with our client only. You can use our remote MCP servers with any other client that supports the MCP protocol, for instance Claude Desktop.

Edit the `claude_desktop_config.json` file to add the MCP servers you want to use.

```
{
  "mcpServers": {
    "nilrag-brave": {
      "command": "npx",
      "args": ["mcp-remote", "https://lz9og6rxzckr.share.zrok.io/mcp"] // 
    }
  }
}
```

## 📂 Project Structure

- `/frontend` - The MCP Client with the UI to access the MCP servers
- `/mcp-servers` - Contains the remote MCP servers
- `/marlin` - Docker files to deploy servers onto TEEs powered by Marlin

## 🤝 Team

- [Abhiraj Mengade](https://github.com/abhiraj-mengade)
- [Asim Jawahir](https://github.com/CommanderAstern)
- [Parht Mittal](https://github.com/mittal-parth)

## 📚 References

- [Cloudflare's Remote MCP](https://developers.cloudflare.com/agents/guides/remote-mcp-server/)
- [Marlin](https://docs.marlin.org/oyster/introduction-to-marlin/)
- [Nillion](https://docs.nillion.com/)
- [MCP Example Servers](https://modelcontextprotocol.io/examples)
- [GitHub's MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/github)
- [Brave's MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search)
- [Slack's MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/slack)
- [nilRAG](https://github.com/NillionNetwork/nilrag/tree/main)
- [lovable.dev](https://lovable.dev/)
- [zrok](https://zrok.io/)
