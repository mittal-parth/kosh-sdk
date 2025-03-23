import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import Message from "./Message";
import SidebarChatInput from "./SidebarChatInput";
import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Tool } from "@anthropic-ai/sdk/resources";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  mcpClient: MCPClient | null;
}

// Server configuration
export interface ServerConfig {
  url: string;
  enabled?: boolean;
  description?: string;
  icon?: string;
}

// MCP Server configurations
export const MCP_SERVERS: Record<string, ServerConfig> = {
  "Brave Search": {
    url: "http://localhost:5173/mcp",
    enabled: false,
    description: "Search the web using Brave",
    icon: "🦁",
  },
  // Sample servers - these are configured with the same URL to make them work with the existing server
  "vector-search": {
    url: "http://localhost:5173/mcp", // Using same URL as nilrag-brave to make it work
    enabled: false,
    description: "Vector Search Server",
    icon: "🔍",
  },
  Slack: {
    url: "http://localhost:5176/mcp",
    enabled: false,
    description: "Chat with your team on Slack",
    icon: "💬",
  },
  // Add more server configurations here
};

// Display server in a more user-friendly way
export const getServerDisplayName = (serverName: string): string => {
  const config = MCP_SERVERS[serverName];
  if (!config || !config.icon) {
    return serverName;
  }
  return `${config.icon} ${serverName}`;
};

// MCP Client implementation
export class MCPClient {
  private anthropic: Anthropic;
  private mcp: Client;
  private transports: Record<string, SSEClientTransport> = {};
  private tools: Tool[] = [];
  private connectedServers: string[] = [];
  private serverTools: Record<string, Tool[]> = {};

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });
    this.mcp = new Client({ name: "mcp-client-web", version: "1.0.0" });
  }

  // Connect to an MCP server
  async connectToServer(serverName: string) {
    try {
      // Check if already connected to this server
      if (this.connectedServers.includes(serverName)) {
        console.log(`Already connected to server: ${serverName}`);
        return true;
      }

      const serverConfig = MCP_SERVERS[serverName];
      if (!serverConfig) {
        console.error(`Unknown server: ${serverName}`);
        return false;
      }

      // Create transport for this specific server
      console.log(`Creating SSE transport for URL: ${serverConfig.url}`);
      try {
        const transport = new SSEClientTransport(new URL(serverConfig.url));
        this.transports[serverName] = transport;
      } catch (error) {
        console.error("Error creating SSE transport:", error);
        throw new Error(
          `Failed to create SSE transport: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      // Connect to the server
      console.log(`Connecting to MCP server ${serverName}...`);
      try {
        await this.mcp.connect(this.transports[serverName]);
        console.log(`Successfully connected to MCP server ${serverName}`);
      } catch (error) {
        console.error(`Error connecting to MCP server ${serverName}:`, error);

        // Clean up the transport on connection failure
        if (this.transports[serverName]) {
          try {
            await this.transports[serverName].close();
            delete this.transports[serverName];
          } catch (closeError) {
            console.error(
              "Error closing transport after connection failure:",
              closeError
            );
          }
        }

        throw new Error(
          `Failed to connect to MCP server: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      // Get tools from the server
      console.log(`Fetching tools from server ${serverName}...`);
      let toolsResult;
      try {
        toolsResult = await this.mcp.listTools();
        console.log(
          `Received ${toolsResult.tools.length} tools from server ${serverName}`
        );
      } catch (error) {
        console.error(`Error fetching tools from server ${serverName}:`, error);

        // Clean up the transport on tool fetch failure
        if (this.transports[serverName]) {
          try {
            await this.transports[serverName].close();
            delete this.transports[serverName];
          } catch (closeError) {
            console.error(
              "Error closing transport after tool fetch failure:",
              closeError
            );
          }
        }

        throw new Error(
          `Failed to fetch tools: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      // Format tools for this server
      const formattedTools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: {
            type: "object",
            properties: tool.inputSchema.properties || {},
            required: tool.inputSchema.required || [],
          },
        };
      });

      // Store tools for this specific server
      this.serverTools[serverName] = formattedTools;

      // Update combined tools list
      this.tools = Object.values(this.serverTools).flat();

      // Add to connected servers
      this.connectedServers.push(serverName);

      console.log(
        `Connected to server ${serverName} with tools:`,
        formattedTools.map(({ name }) => name)
      );

      return true;
    } catch (e) {
      console.error(`Failed to connect to MCP server ${serverName}:`, e);
      // Clean up any remaining transport
      if (this.transports[serverName]) {
        try {
          await this.transports[serverName].close();
        } catch (closeError) {
          console.error(
            "Error closing transport after connection failure:",
            closeError
          );
        }
        delete this.transports[serverName];
      }
      return false;
    }
  }

  // Disconnect from a server
  async disconnectFromServer(serverName: string) {
    try {
      if (!this.connectedServers.includes(serverName)) {
        console.log(`Server ${serverName} is not connected`);
        return true;
      }

      // Close the specific transport
      if (this.transports[serverName]) {
        await this.transports[serverName].close();
        delete this.transports[serverName];
      }

      // Remove server tools
      delete this.serverTools[serverName];

      // Update combined tools list
      this.tools = Object.values(this.serverTools).flat();

      // Remove from connected servers list
      this.connectedServers = this.connectedServers.filter(
        (name) => name !== serverName
      );

      console.log(`Disconnected from server: ${serverName}`);
      return true;
    } catch (e) {
      console.error(`Failed to disconnect from MCP server ${serverName}:`, e);
      return false;
    }
  }

  // Disconnect from all servers
  async disconnectFromAllServers() {
    try {
      // Close all transports
      for (const serverName of Object.keys(this.transports)) {
        try {
          await this.transports[serverName].close();
        } catch (e) {
          console.error(`Error closing transport for ${serverName}:`, e);
        }
      }

      // Reset all state
      this.transports = {};
      this.connectedServers = [];
      this.serverTools = {};
      this.tools = [];

      console.log("Disconnected from all servers");
      return true;
    } catch (e) {
      console.error("Failed to disconnect from all MCP servers:", e);
      return false;
    }
  }

  // Get connected servers
  getConnectedServers() {
    return this.connectedServers;
  }

  // Get available tools
  getTools() {
    return this.tools;
  }

  async processQuery(query: string) {
    if (this.tools.length === 0) {
      return "Please connect to an MCP server to use tools. Go to the Servers tab to connect to a server.";
    }

    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    const finalText: string[] = [];

    try {
      // Process the query using a recursive approach to handle tool calls
      await this.processToolChain(messages, finalText);
      return finalText.join("\n\n");
    } catch (error) {
      console.error("Error processing query:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `Error processing your query: ${errorMessage}`;
    }
  }

  // Recursive method to handle arbitrary chains of tool calls
  private async processToolChain(messages: MessageParam[], finalText: string[], depth: number = 0, maxDepth: number = 10) {
    // Safety check to prevent infinite recursion
    if (depth >= maxDepth) {
      finalText.push(`⚠️ Maximum tool call depth (${maxDepth}) reached. Some operations may be incomplete.`);
      return;
    }

    // Call Claude API with current messages and tools
    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      messages,
      tools: this.tools,
    });

    // Process each content item in the response
    for (const content of response.content) {
      if (content.type === "text") {
        // For text content, add it to the final output
        finalText.push(content.text);
      } else if (content.type === "tool_use") {
        // For tool use, process the tool call
        const toolName = content.name;
        const toolArgs = content.input as Record<string, unknown>;
        const toolUseId = content.id;

        // Log the tool call in the UI
        finalText.push(`🔧 Using tool: ${toolName}`);

        try {
          // Call the tool with retry logic
          const result = await this.callToolWithRetry(toolName, toolArgs);
          
          // Format the tool response for display
          const toolResponse = this.formatToolResponse(result.content);
          finalText.push(`📊 Tool result: \n${toolResponse}`);

          // Add the tool use and result to the conversation history
          messages.push({
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: toolUseId,
                name: toolName,
                input: toolArgs,
              },
            ],
          });

          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUseId,
                content: toolResponse,
              },
            ],
          });

          // Recursively process the next set of messages (handling nested tool calls)
          await this.processToolChain(messages, finalText, depth + 1, maxDepth);
        } catch (error) {
          // Handle tool call errors
          console.error(`Error calling tool ${toolName}:`, error);
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          finalText.push(
            `❌ Error calling tool ${toolName}: ${errorMessage}`
          );

          // Inform the model about the error and continue
          messages.push({
            role: "user",
            content: `Error using tool ${toolName}: ${errorMessage}. Please continue without this tool.`,
          });

          // Recursively process with the error message added
          await this.processToolChain(messages, finalText, depth + 1, maxDepth);
        }
      }
    }
  }

  // Helper method to call a tool with retry logic
  private async callToolWithRetry(toolName: string, toolArgs: Record<string, unknown>, maxRetries: number = 2) {
    let retries = maxRetries;
    let lastError;

    while (retries >= 0) {
      try {
        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });
        return result; // Success, return the result
      } catch (error) {
        lastError = error;
        console.warn(
          `Tool call attempt failed (${maxRetries - retries}/${maxRetries}): ${toolName}`,
          error
        );

        if (retries > 0) {
          // Wait before retrying (exponential backoff)
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, maxRetries - retries))
          );
        }
        retries--;
      }
    }

    // If all retries failed, throw the last error
    throw lastError;
  }

  // Helper method to format tool responses for display
  private formatToolResponse(content: any): string {
    if (typeof content === "string") {
      return content;
    } else if (content !== null && typeof content === "object") {
      // Format the object as JSON string with indentation for better readability
      try {
        // Handle both arrays and objects consistently
        if (Array.isArray(content)) {
          // For arrays, determine if it's a simple array or contains complex objects
          const isSimpleArray = content.every(
            (item) => typeof item !== "object" || item === null
          );

          if (isSimpleArray && content.length < 10) {
            // For small simple arrays, use a compact format
            return JSON.stringify(content);
          } else {
            // For complex or larger arrays, use indented format
            return JSON.stringify(content, null, 2);
          }
        } else {
          // For objects, always use indented format
          return JSON.stringify(content, null, 2);
        }
      } catch (err) {
        return `[Complex object: ${Object.prototype.toString.call(content)}]`;
      }
    } else if (content === null) {
      return "null";
    } else if (content === undefined) {
      return "undefined";
    } else {
      // Handle other primitive types
      return String(content);
    }
  }

  // Check if the server is available
  async checkServerAvailability(serverName: string): Promise<{
    available: boolean;
    message: string;
    health?: { status: string; latency: number };
  }> {
    const serverConfig = MCP_SERVERS[serverName];
    if (!serverConfig) {
      return {
        available: false,
        message: `Unknown server: ${serverName}`,
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const startTime = performance.now();

      // Try to actually connect to the MCP endpoint
      try {
        // Just check if the server URL is accessible with a HEAD request
        const response = await fetch(serverConfig.url, {
          method: "HEAD",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latency = Math.round(performance.now() - startTime);

        if (response.ok) {
          return {
            available: true,
            message: `Server ${serverName} is available`,
            health: {
              status: "healthy",
              latency: latency,
            },
          };
        } else {
          return {
            available: false,
            message: `Server responded with status: ${response.status}`,
            health: {
              status: "unhealthy",
              latency: latency,
            },
          };
        }
      } catch (fetchError) {
        // Handle fetch errors
        clearTimeout(timeoutId);
        const latency = Math.round(performance.now() - startTime);

        // Special case for CORS errors which often happen in browser environments
        const errorMessage =
          fetchError instanceof Error ? fetchError.message : String(fetchError);
        if (
          errorMessage.includes("CORS") ||
          errorMessage.includes("cross-origin")
        ) {
          // If it's a CORS error, we might still be able to connect via MCP
          console.warn(
            "CORS error detected during availability check, will attempt connection anyway"
          );
          return {
            available: true,
            message: `Server ${serverName} might be available (CORS error during check)`,
            health: {
              status: "unknown",
              latency: latency,
            },
          };
        }

        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
          return {
            available: false,
            message: `Connection to server ${serverName} timed out after 5 seconds`,
            health: {
              status: "timeout",
              latency: 5000,
            },
          };
        }

        return {
          available: false,
          message: `Error checking server availability: ${errorMessage}`,
          health: {
            status: "error",
            latency: latency,
          },
        };
      }
    } catch (error) {
      return {
        available: false,
        message: `Error checking server availability: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, mcpClient }) => {
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      content: string;
      isUser: boolean;
      timestamp: string;
      status?: "sending" | "sent" | "error";
    }>
  >([
    {
      id: "1",
      content: "Need any help? Connect to a server to use tools.",
      isUser: false,
      timestamp: formatTime(new Date()),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);

  // Update available tools when the client changes or when the client's state changes
  useEffect(() => {
    if (mcpClient) {
      setAvailableTools(mcpClient.getTools());
    }
  }, [mcpClient]);

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const handleSendMessage = async (content: string) => {
    const newMessage = {
      id: Date.now().toString(),
      content,
      isUser: true,
      timestamp: formatTime(new Date()),
      status: "sending" as const,
    };

    setMessages((prev) => [...prev, newMessage]);
    setIsLoading(true);

    try {
      // Update message status to sent
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === newMessage.id ? { ...msg, status: "sent" as const } : msg
        )
      );

      let assistantContent = "I'm sorry, I couldn't process your request.";

      if (mcpClient) {
        assistantContent = await mcpClient.processQuery(content);

        // Update tools in case they changed
        setAvailableTools(mcpClient.getTools());
      } else {
        throw new Error("MCP Client not initialized");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          content: assistantContent,
          isUser: false,
          timestamp: formatTime(new Date()),
        },
      ]);
    } catch (error) {
      console.error("Error calling Anthropic API:", error);

      // Update message status to error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === newMessage.id ? { ...msg, status: "error" as const } : msg
        )
      );

      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          content: "Sorry, I encountered an error. Please try again later.",
          isUser: false,
          timestamp: formatTime(new Date()),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isOpen && window.innerWidth < 1024 && !target.closest(".sidebar")) {
        onClose();
      }
    };

    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <div
      className={cn(
        "sidebar fixed top-0 right-0 h-full w-full md:w-[80vw] lg:w-[30vw] border-l bg-white shadow-md transition-all duration-300",
        isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-app-border">
          <h2 className="font-medium text-lg">Assistant</h2>
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18"></path>
              <path d="M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        {/* Available Tools Info */}
        {availableTools.length > 0 && (
          <div className="p-4 border-b border-app-border">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                Available Tools ({availableTools.length})
              </h3>
              {availableTools.length > 0 && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                  Connected
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <Message
              key={message.id}
              content={message.content}
              isUser={message.isUser}
              timestamp={message.timestamp}
              status={message.status}
            />
          ))}
        </div>

        <SidebarChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder={
            availableTools.length > 0
              ? "Ask me anything. I can use tools from the connected server..."
              : "Connect to a server in the Servers tab to enable tools..."
          }
        />
      </div>
    </div>
  );
};

export default Sidebar;
