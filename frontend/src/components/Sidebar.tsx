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
}

// Server configuration
interface ServerConfig {
  url: string;
  enabled?: boolean;
}

// MCP Server configurations
const MCP_SERVERS: Record<string, ServerConfig> = {
  "nilrag-brave": {
    url: "http://localhost:5173/mcp",
    enabled: false,
  },
};

// MCP Client implementation
class MCPClient {
  private anthropic: Anthropic;
  private mcp: Client;
  private transport: SSEClientTransport | null = null;
  private tools: Tool[] = [];
  private connectedServers: string[] = [];

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
        throw new Error(`Unknown server: ${serverName}`);
      }

      // Close any existing transport
      if (this.transport) {
        await this.disconnectFromAllServers();
      }

      // Create transport - use SSEClientTransport for browser environments
      console.log(`Creating SSE transport for URL: ${serverConfig.url}`);
      try {
        this.transport = new SSEClientTransport(new URL(serverConfig.url));
      } catch (error) {
        console.error("Error creating SSE transport:", error);
        throw new Error(
          `Failed to create SSE transport: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      // Connect to the server
      console.log("Connecting to MCP server...");
      try {
        await this.mcp.connect(this.transport);
        console.log("Successfully connected to MCP server");
      } catch (error) {
        console.error("Error connecting to MCP server:", error);
        throw new Error(
          `Failed to connect to MCP server: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      // Get tools from the server
      console.log("Fetching tools from server...");
      let toolsResult;
      try {
        toolsResult = await this.mcp.listTools();
        console.log(`Received ${toolsResult.tools.length} tools from server`);
      } catch (error) {
        console.error("Error fetching tools from server:", error);
        throw new Error(
          `Failed to fetch tools: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      this.tools = toolsResult.tools.map((tool) => {
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

      // Add to connected servers
      this.connectedServers.push(serverName);

      console.log(
        "Connected to server with tools:",
        this.tools.map(({ name }) => name)
      );

      return true;
    } catch (e) {
      console.error(`Failed to connect to MCP server ${serverName}:`, e);
      return false;
    }
  }

  // Disconnect from a server
  async disconnectFromServer(serverName: string) {
    try {
      // Remove from connected servers list
      this.connectedServers = this.connectedServers.filter(
        (name) => name !== serverName
      );

      // If no more connected servers, disconnect from everything
      if (this.connectedServers.length === 0) {
        return this.disconnectFromAllServers();
      }

      console.log(`Disconnected from server: ${serverName}`);

      // Clear tools when disconnecting
      this.tools = [];

      return true;
    } catch (e) {
      console.error(`Failed to disconnect from MCP server ${serverName}:`, e);
      return false;
    }
  }

  // Disconnect from all servers
  async disconnectFromAllServers() {
    try {
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }

      this.connectedServers = [];
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
      return "Please connect to an MCP server to use tools. Use the 'Connect' button above to connect to a server.";
    }

    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        messages,
        tools: this.tools,
      });

      const finalText = [];

      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          const toolName = content.name;
          const toolInput = content.input as Record<
            string,
            string | number | boolean
          >;

          finalText.push(`🔧 Using tool: ${toolName}`);

          try {
            if (!this.mcp) {
              throw new Error("MCP client is not initialized");
            }

            // Call the tool through MCP
            const result = await this.mcp.callTool({
              name: toolName,
              arguments: toolInput,
            });

            // Add the tool call to the conversation
            messages.push({
              role: "assistant",
              content: `I'll use the ${toolName} tool to help with that.`,
            });

            // Add the result of the tool call to the conversation
            const toolResponse = result.content as string;
            messages.push({
              role: "user",
              content: toolResponse,
            });

            finalText.push(`📊 Tool result: ${toolResponse}`);

            // Get a follow-up response from Claude with the tool result
            const followUpResponse = await this.anthropic.messages.create({
              model: "claude-3-5-sonnet-20241022",
              max_tokens: 1000,
              messages,
            });

            // Add follow-up response to final text
            for (const content of followUpResponse.content) {
              if (content.type === "text") {
                finalText.push(content.text);
              }
            }
          } catch (error) {
            console.error(`Error calling tool ${toolName}:`, error);
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            finalText.push(
              `❌ Error calling tool ${toolName}: ${errorMessage}`
            );

            // Inform the model about the error
            messages.push({
              role: "user",
              content: `The tool ${toolName} failed with error: ${errorMessage}. Please continue without using this tool.`,
            });

            // Get a response from Claude after the error
            const errorFollowUpResponse = await this.anthropic.messages.create({
              model: "claude-3-5-sonnet-20241022",
              max_tokens: 1000,
              messages,
            });

            // Add error follow-up response
            for (const content of errorFollowUpResponse.content) {
              if (content.type === "text") {
                finalText.push(content.text);
              }
            }
          }
        }
      }

      return finalText.join("\n\n");
    } catch (error) {
      console.error("Error processing query:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `Error processing your query: ${errorMessage}`;
    }
  }

  // Check if the server is available
  async checkServerAvailability(
    serverName: string
  ): Promise<{ available: boolean; message: string }> {
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

      // Just check if the server URL is accessible with a HEAD request
      const response = await fetch(serverConfig.url, {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return {
          available: true,
          message: `Server ${serverName} is available`,
        };
      } else {
        return {
          available: false,
          message: `Server responded with status: ${response.status}`,
        };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          available: false,
          message: `Connection to server ${serverName} timed out after 5 seconds`,
        };
      }

      return {
        available: false,
        message: `Error checking server availability: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
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
  const [mcpClient, setMcpClient] = useState<MCPClient | null>(null);
  const [serverStatus, setServerStatus] = useState<Record<string, boolean>>(
    Object.keys(MCP_SERVERS).reduce((acc, server) => {
      acc[server] = MCP_SERVERS[server].enabled || false;
      return acc;
    }, {} as Record<string, boolean>)
  );
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [showTools, setShowTools] = useState(false);
  const [serverLoadingStates, setServerLoadingStates] = useState<
    Record<string, boolean>
  >(
    Object.keys(MCP_SERVERS).reduce((acc, server) => {
      acc[server] = false;
      return acc;
    }, {} as Record<string, boolean>)
  );

  useEffect(() => {
    // Initialize MCP client
    const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (ANTHROPIC_API_KEY) {
      setMcpClient(new MCPClient(ANTHROPIC_API_KEY as string));
    }
  }, []);

  // Update available tools when client changes
  useEffect(() => {
    if (mcpClient) {
      setAvailableTools(mcpClient.getTools());

      // Sync server status with connected servers
      const connectedServers = mcpClient.getConnectedServers();
      const updatedStatus = { ...serverStatus };

      // Reset all to false first
      Object.keys(updatedStatus).forEach((server) => {
        updatedStatus[server] = false;
      });

      // Set connected ones to true
      connectedServers.forEach((server) => {
        if (Object.prototype.hasOwnProperty.call(updatedStatus, server)) {
          updatedStatus[server] = true;
        }
      });

      setServerStatus(updatedStatus);
    }
  }, [mcpClient, serverStatus]);

  // Connect or disconnect from a server when its status changes
  const toggleServerConnection = async (serverName: string) => {
    if (!mcpClient) return;

    const isCurrentlyConnected = serverStatus[serverName];

    // Set loading state for this specific server
    setServerLoadingStates((prev) => ({
      ...prev,
      [serverName]: true,
    }));

    // Only check availability when connecting
    if (!isCurrentlyConnected) {
      // Check server availability first
      const availabilityCheck = await mcpClient.checkServerAvailability(
        serverName
      );
      if (!availabilityCheck.available) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            content: `Server unavailable: ${availabilityCheck.message}`,
            isUser: false,
            timestamp: formatTime(new Date()),
          },
        ]);

        // Reset loading state
        setServerLoadingStates((prev) => ({
          ...prev,
          [serverName]: false,
        }));

        return;
      }
    }

    // Update UI state
    setServerStatus((prev) => ({
      ...prev,
      [serverName]: !isCurrentlyConnected,
    }));

    try {
      if (!isCurrentlyConnected) {
        // Connect to the server
        const success = await mcpClient.connectToServer(serverName);
        if (success) {
          // Update available tools
          setAvailableTools(mcpClient.getTools());

          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              content: `Connected to server: ${serverName}`,
              isUser: false,
              timestamp: formatTime(new Date()),
            },
          ]);
        } else {
          // Connection failed, revert status
          setServerStatus((prev) => ({
            ...prev,
            [serverName]: false,
          }));

          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              content: `Failed to connect to server: ${serverName}`,
              isUser: false,
              timestamp: formatTime(new Date()),
            },
          ]);
        }
      } else {
        // Disconnect from the server
        const success = await mcpClient.disconnectFromServer(serverName);
        if (success) {
          // Update available tools
          setAvailableTools(mcpClient.getTools());

          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              content: `Disconnected from server: ${serverName}`,
              isUser: false,
              timestamp: formatTime(new Date()),
            },
          ]);
        } else {
          // Disconnection failed, revert status
          setServerStatus((prev) => ({
            ...prev,
            [serverName]: true,
          }));
        }
      }
    } catch (error) {
      console.error(`Error toggling server ${serverName} connection:`, error);
      // Revert status on error
      setServerStatus((prev) => ({
        ...prev,
        [serverName]: isCurrentlyConnected,
      }));
    } finally {
      // Reset loading state
      setServerLoadingStates((prev) => ({
        ...prev,
        [serverName]: false,
      }));
    }
  };

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

        // Update tools after the query in case they changed
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

        {/* Server Connection Controls */}
        <div className="p-4 border-b border-app-border">
          <h3 className="text-sm font-medium mb-2">Connected Servers</h3>
          <div className="space-y-2">
            {Object.keys(MCP_SERVERS).map((serverName) => (
              <div
                key={serverName}
                className="flex items-center justify-between"
              >
                <span className="text-sm">{serverName}</span>
                <button
                  onClick={() => toggleServerConnection(serverName)}
                  disabled={serverLoadingStates[serverName]}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full flex items-center gap-1",
                    serverLoadingStates[serverName]
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                      : serverStatus[serverName]
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-700"
                  )}
                >
                  {serverLoadingStates[serverName] && (
                    <span className="inline-block h-3 w-3 mr-1">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    </span>
                  )}
                  {serverLoadingStates[serverName]
                    ? "Connecting..."
                    : serverStatus[serverName]
                    ? "Disconnect"
                    : "Connect"}
                </button>
              </div>
            ))}
          </div>

          {/* Available Tools */}
          {availableTools.length > 0 && (
            <div className="mt-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowTools(!showTools)}
              >
                <h3 className="text-sm font-medium">
                  Available Tools ({availableTools.length})
                </h3>
                <button className="text-xs text-blue-500">
                  {showTools ? "Hide" : "Show"}
                </button>
              </div>

              {showTools && (
                <div className="mt-2 space-y-2 text-xs bg-gray-50 p-2 rounded">
                  {availableTools.map((tool, index) => (
                    <div
                      key={index}
                      className="border-b border-gray-100 pb-2 last:border-b-0 last:pb-0"
                    >
                      <div className="font-medium">{tool.name}</div>
                      <div className="text-gray-500">{tool.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

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
              ? "Message with tools enabled..."
              : "Connect to a server to enable tools..."
          }
        />
      </div>
    </div>
  );
};

export default Sidebar;
