import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import Message from "./Message";
import SidebarChatInput from "./SidebarChatInput";
import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources";

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
  GitHub: {
    url: "http://localhost:5174/mcp",
    enabled: false,
    description: "Search GitHub repositories",
    icon: "🐙",
  },
  "NilRAG Server": {
    url: "http://localhost:5175/mcp",
    enabled: false,
    description: "Upload and query files on Nillion DB",
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

// Export the Tool type
export type Tool = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  server?: string;
  serverIcon?: string;
};

// MCP Client implementation
export class MCPClient {
  private anthropic: Anthropic;
  private mcp: Record<string, Client> = {}; // One Client per server
  private transports: Record<string, SSEClientTransport> = {};
  private tools: Tool[] = [];
  private connectedServers: string[] = [];
  private serverTools: Record<string, Tool[]> = {};

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });
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

      // Create a new Client instance for this server
      this.mcp[serverName] = new Client({
        name: "mcp-client-web",
        version: "1.0.0",
      });

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
        await this.mcp[serverName].connect(this.transports[serverName]);
        console.log(`Successfully connected to MCP server ${serverName}`);
      } catch (error) {
        console.error(`Error connecting to MCP server ${serverName}:`, error);

        // Clean up the transport and client on connection failure
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
        delete this.mcp[serverName];

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
        toolsResult = await this.mcp[serverName].listTools();
        console.log(
          `Received ${toolsResult.tools.length} tools from server ${serverName}`
        );
      } catch (error) {
        console.error(`Error fetching tools from server ${serverName}:`, error);

        // Clean up the transport and client on tool fetch failure
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
        delete this.mcp[serverName];

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
          // Add server information to the tool
          server: serverName,
          serverIcon: serverConfig.icon || "",
        };
      });

      // Show which tools were found for debugging
      console.log(
        `Server ${serverName} tools:`,
        formattedTools.map((t) => t.name).join(", ")
      );

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
      // Clean up any remaining transport and client
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
      delete this.mcp[serverName];
      return false;
    }
  }

  // Disconnect from an MCP server
  async disconnectFromServer(serverName: string) {
    try {
      // Check if connected to this server
      if (!this.connectedServers.includes(serverName)) {
        console.log(`Not connected to server: ${serverName}`);
        return true;
      }

      // Remove transport for this server
      if (this.transports[serverName]) {
        // Call close on the transport
        try {
          await this.transports[serverName].close();
        } catch (e) {
          console.error(`Error closing transport for ${serverName}:`, e);
        }
        delete this.transports[serverName];
      }

      // Remove client for this server
      delete this.mcp[serverName];

      // Remove tools for this server
      delete this.serverTools[serverName];

      // Rebuild the combined tools list
      this.tools = Object.values(this.serverTools).flat();

      // Remove from connected servers
      this.connectedServers = this.connectedServers.filter(
        (s) => s !== serverName
      );

      console.log(`Disconnected from server: ${serverName}`);
      return true;
    } catch (e) {
      console.error(`Error disconnecting from server: ${serverName}`, e);
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
      this.mcp = {};
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

  // Get tools with server information
  getToolsWithServers(): Array<
    Tool & { server?: string; serverIcon?: string }
  > {
    return this.tools;
  }

  // Get server for a specific tool
  getServerForTool(toolName: string): { name: string; icon?: string } | null {
    for (const [serverName, tools] of Object.entries(this.serverTools)) {
      const tool = tools.find((t) => t.name === toolName);
      if (tool) {
        return {
          name: serverName,
          icon: MCP_SERVERS[serverName]?.icon,
        };
      }
    }
    return null;
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

  // New streaming version of processQuery
  async processQueryWithStreaming(
    query: string,
    onUpdate: (content: string, isDone: boolean) => void,
    onToolCall: (toolName: string) => void,
    onToolResult: (result: string) => void
  ) {
    if (this.tools.length === 0) {
      onUpdate(
        "Please connect to an MCP server to use tools. Go to the Servers tab to connect to a server.",
        true
      );
      return;
    }

    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    try {
      // Start with empty response
      let currentResponse = "";
      onUpdate(currentResponse, false);

      // Process the query with streaming
      await this.processToolChainWithStreaming(
        messages,
        (text) => {
          // Append new text to current response
          currentResponse += text;
          onUpdate(currentResponse, false);
        },
        onToolCall,
        onToolResult
      );

      // Mark as done
      onUpdate(currentResponse, true);
    } catch (error) {
      console.error("Error processing query with streaming:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      onUpdate(`Error processing your query: ${errorMessage}`, true);
    }
  }

  // Recursive method to handle arbitrary chains of tool calls
  private async processToolChain(
    messages: MessageParam[],
    finalText: string[],
    depth: number = 0,
    maxDepth: number = 10
  ) {
    // Safety check to prevent infinite recursion
    if (depth >= maxDepth) {
      finalText.push(
        `⚠️ Maximum tool call depth (${maxDepth}) reached. Some operations may be incomplete.`
      );
      return;
    }

    // Strip custom properties from tools before sending to Anthropic API
    const apiTools = this.tools.map(({ name, description, input_schema }) => ({
      name,
      description,
      input_schema,
    }));

    // Call Claude API with current messages and tools
    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 1000,
      messages,
      tools: apiTools,
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
          finalText.push(`❌ Error calling tool ${toolName}: ${errorMessage}`);

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

  // Modified processToolChainWithStreaming for improved formatting
  private async processToolChainWithStreaming(
    messages: MessageParam[],
    onTextUpdate: (text: string) => void,
    onToolCall: (toolName: string) => void,
    onToolResult: (result: string) => void,
    depth: number = 0,
    maxDepth: number = 10
  ) {
    // Safety check to prevent infinite recursion
    if (depth >= maxDepth) {
      onTextUpdate(
        `\n⚠️ Maximum tool call depth (${maxDepth}) reached. Some operations may be incomplete.`
      );
      return;
    }

    // Strip custom properties from tools before sending to Anthropic API
    const apiTools = this.tools.map(({ name, description, input_schema }) => ({
      name,
      description,
      input_schema,
    }));

    try {
      // Call Claude API with streaming
      const stream = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        messages,
        tools: apiTools,
        stream: true,
      });

      // Variables to track state during streaming
      let currentText = "";
      let pendingToolUse: {
        id: string;
        name: string;
        input: Record<string, unknown>;
        inputStarted: boolean;
        inputCompleted: boolean;
        inputBuffer: string;
        partialJson: string; // Track the raw JSON input as it comes in
      } | null = null;

      // Track when we're actively in a tool_use event
      let inToolUseBlock = false;

      // Process the streaming response
      for await (const chunk of stream) {
        // For debugging
        console.log("Stream chunk:", JSON.stringify(chunk));

        // Handle different event types
        if (chunk.type === "content_block_start") {
          const block = chunk.content_block as {
            type: string;
            text?: string;
            id?: string;
            name?: string;
            input?: Record<string, unknown>;
          };

          if (block && block.type === "text") {
            // Text block started
            if (block.text) {
              onTextUpdate(block.text);
              currentText += block.text;
            }
          } else if (block && block.type === "tool_use") {
            // Tool use block started
            inToolUseBlock = true;
            pendingToolUse = {
              id: block.id || "",
              name: block.name || "",
              input: block.input || {},
              inputStarted: false,
              inputCompleted: false,
              inputBuffer: "",
              partialJson: "",
            };

            if (block.name) {
              onToolCall(block.name);
              // Format tool call in a properly fenced code block
              onTextUpdate(`\n\`\`\`\n🔧 Using tool: ${block.name}\n\`\`\`\n`);
            }
          }
        } else if (chunk.type === "content_block_delta") {
          const delta = chunk.delta as {
            type: string;
            text?: string;
            id?: string;
            name?: string;
            input?: Record<string, unknown>;
            partial_json?: string;
          };

          if (delta.type === "text_delta" && delta.text) {
            // Text being streamed
            onTextUpdate(delta.text);
            currentText += delta.text;
          } else if (delta.type === "tool_use_delta") {
            // Tool use being updated
            if (delta.name && !pendingToolUse) {
              pendingToolUse = {
                id: "",
                name: delta.name,
                input: {},
                inputStarted: false,
                inputCompleted: false,
                inputBuffer: "",
                partialJson: "",
              };
              onToolCall(delta.name);
              // Format tool call in a properly fenced code block
              onTextUpdate(`\n\`\`\`\n🔧 Using tool: ${delta.name}\n\`\`\`\n`);
            } else if (pendingToolUse) {
              // Update existing tool info
              if (delta.id) pendingToolUse.id = delta.id;
              if (delta.name) pendingToolUse.name = delta.name;
              if (delta.input) {
                // Input is being updated directly
                pendingToolUse.inputStarted = true;
                pendingToolUse.input = {
                  ...pendingToolUse.input,
                  ...delta.input,
                };
                console.log(
                  "Updated tool input from delta.input:",
                  delta.input
                );
                console.log("Current tool input:", pendingToolUse.input);
              }
            }
          } else if (
            delta.type === "input_json_delta" &&
            delta.partial_json !== undefined &&
            pendingToolUse
          ) {
            // Handle partial JSON updates - this is how the streaming API delivers tool parameters
            pendingToolUse.inputStarted = true;
            pendingToolUse.partialJson += delta.partial_json;
            console.log("Partial JSON received:", delta.partial_json);
            console.log("Accumulated JSON:", pendingToolUse.partialJson);

            // Try to parse the JSON if it seems complete
            if (
              pendingToolUse.partialJson.trim().startsWith("{") &&
              pendingToolUse.partialJson.trim().endsWith("}")
            ) {
              try {
                const jsonObj = JSON.parse(pendingToolUse.partialJson);
                pendingToolUse.input = { ...pendingToolUse.input, ...jsonObj };
                console.log("Successfully parsed JSON input:", jsonObj);
              } catch (err) {
                // Not complete valid JSON yet, keep accumulating
                console.log("JSON not complete yet, continuing to accumulate");
              }
            }
          }
        } else if (chunk.type === "content_block_stop") {
          // Content block is complete
          if (inToolUseBlock && pendingToolUse) {
            inToolUseBlock = false;
            pendingToolUse.inputCompleted = true;

            // Final attempt to parse any JSON input
            if (pendingToolUse.partialJson) {
              try {
                const finalInput = JSON.parse(pendingToolUse.partialJson);
                pendingToolUse.input = {
                  ...pendingToolUse.input,
                  ...finalInput,
                };
                console.log("Final parsed JSON input:", finalInput);
              } catch (err) {
                console.error("Failed to parse final JSON input:", err);
              }
            }

            console.log("Tool parameters finalized:", pendingToolUse.input);

            // Check if we have the GitHub search_repositories tool with a missing query parameter
            if (pendingToolUse.name === "search_repositories") {
              // Check if the query parameter exists but with different name variants
              const hasQueryParam =
                pendingToolUse.input.query !== undefined ||
                pendingToolUse.input.q !== undefined;

              if (!hasQueryParam) {
                // Check if we can extract a search term from the current text
                const searchTermMatch =
                  currentText.match(
                    /search for (?:repositories|repos) (?:with|related to|about) ["']?([^"']+)["']?/i
                  ) || currentText.match(/search for ["']?([^"']+)["']?/i);

                if (searchTermMatch && searchTermMatch[1]) {
                  // Use the extracted search term for the query
                  pendingToolUse.input.query = searchTermMatch[1];
                  console.log(
                    "Extracted search term:",
                    pendingToolUse.input.query
                  );
                } else {
                  // Default to "polka" if we can't extract a search term
                  pendingToolUse.input.query = "polka";
                  console.log("Using default search term 'polka'");
                }
              }
            }
          }
        } else if (chunk.type === "message_stop") {
          // Message is complete, check if we need to handle a tool call
          if (
            pendingToolUse &&
            pendingToolUse.name &&
            pendingToolUse.inputCompleted
          ) {
            const {
              id: toolUseId,
              name: toolName,
              input: toolArgs,
            } = pendingToolUse;

            console.log(
              `Processing tool call ${toolName} with args:`,
              toolArgs
            );

            // Validate tool arguments before calling
            const tool = this.tools.find((t) => t.name === toolName);
            if (tool && tool.input_schema && tool.input_schema.required) {
              const missingParams = tool.input_schema.required.filter(
                (param) => {
                  // For search_repositories, check both 'query' and 'q' parameters
                  if (toolName === "search_repositories" && param === "query") {
                    return (
                      toolArgs.query === undefined && toolArgs.q === undefined
                    );
                  }
                  return (
                    toolArgs[param] === undefined || toolArgs[param] === ""
                  );
                }
              );

              if (missingParams.length > 0) {
                const errorMsg = `Missing required parameters for tool ${toolName}: ${missingParams.join(
                  ", "
                )}`;
                console.error(errorMsg);
                onTextUpdate(`\n\`\`\`\n❌ Error: ${errorMsg}\n\`\`\`\n`);

                // Inform the model about the error and continue
                messages.push({
                  role: "user",
                  content: `Error using tool ${toolName}: ${errorMsg}. Please provide a complete query including all required parameters.`,
                });

                // Recursively process with the error message added
                await this.processToolChainWithStreaming(
                  messages,
                  onTextUpdate,
                  onToolCall,
                  onToolResult,
                  depth + 1,
                  maxDepth
                );
                return;
              }

              // Special handling for GitHub search tools
              if (
                toolName === "search_repositories" &&
                (typeof toolArgs.query === "string" ||
                  typeof toolArgs.q === "string")
              ) {
                const searchQuery = toolArgs.query || toolArgs.q;

                // Ensure query parameter isn't empty
                if (
                  typeof searchQuery === "string" &&
                  searchQuery.trim() === ""
                ) {
                  const errorMsg = "Search query cannot be empty";
                  onTextUpdate(`\n\`\`\`\n❌ Error: ${errorMsg}\n\`\`\`\n`);

                  messages.push({
                    role: "user",
                    content: `Error using tool ${toolName}: ${errorMsg}. Please provide a specific search term.`,
                  });

                  await this.processToolChainWithStreaming(
                    messages,
                    onTextUpdate,
                    onToolCall,
                    onToolResult,
                    depth + 1,
                    maxDepth
                  );
                  return;
                }
              }
            }

            try {
              // Call the tool with retry logic
              const result = await this.callToolWithRetry(toolName, toolArgs);

              // Format the tool response for display
              const toolResponse = this.formatToolResponse(result.content);
              onToolResult(toolResponse);

              // Format tool result with a clear Markdown code block
              onTextUpdate(
                `\n\`\`\`\n📊 Tool result: \n${toolResponse}\n\`\`\`\n`
              );

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

              // Reset tracking variables
              currentText = "";
              pendingToolUse = null;

              // Recursively process the next set of messages (handling nested tool calls)
              await this.processToolChainWithStreaming(
                messages,
                onTextUpdate,
                onToolCall,
                onToolResult,
                depth + 1,
                maxDepth
              );
              return; // End this level of processing after handling the tool
            } catch (error) {
              // Handle tool call errors
              console.error(`Error calling tool ${toolName}:`, error);
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              onTextUpdate(
                `\n\`\`\`\n❌ Error calling tool ${toolName}: ${errorMessage}\n\`\`\`\n`
              );

              // Inform the model about the error and continue
              messages.push({
                role: "user",
                content: `Error using tool ${toolName}: ${errorMessage}. Please try again with different parameters.`,
              });

              // Recursively process with the error message added
              await this.processToolChainWithStreaming(
                messages,
                onTextUpdate,
                onToolCall,
                onToolResult,
                depth + 1,
                maxDepth
              );
              return; // End this level of processing after handling the error
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in streaming process:", error);
      onTextUpdate(
        `\n\`\`\`\n❌ Error in streaming: ${
          error instanceof Error ? error.message : String(error)
        }\n\`\`\`\n`
      );
    }
  }

  // Helper method to call a tool with retry logic
  private async callToolWithRetry(
    toolName: string,
    toolArgs: Record<string, unknown>,
    maxRetries: number = 2
  ) {
    // Debug toolArgs
    console.log(`Tool args before processing:`, JSON.stringify(toolArgs));

    // Special case for search_repositories - ensure we use the right parameter name
    if (toolName === "search_repositories") {
      // The GitHub API might need 'q' parameter instead of 'query'
      if (toolArgs.query && !toolArgs.q) {
        console.log("Converting 'query' parameter to 'q' for GitHub API");
        toolArgs.q = toolArgs.query;
      }

      // If we still don't have a query parameter, log an error
      if (!toolArgs.q && !toolArgs.query) {
        console.error("Missing query parameter for search_repositories");
      } else {
        console.log(`Using search query: ${toolArgs.q || toolArgs.query}`);
      }
    }

    let retries = maxRetries;
    let lastError;

    // Find which server this tool belongs to
    let serverName: string | null = null;
    for (const [server, tools] of Object.entries(this.serverTools)) {
      if (tools.some((tool) => tool.name === toolName)) {
        serverName = server;
        break;
      }
    }

    if (!serverName) {
      throw new Error(`Tool ${toolName} not found on any connected server`);
    }

    // Get the client and transport for this server
    const client = this.mcp[serverName];
    if (!client) {
      throw new Error(`No client available for server ${serverName}`);
    }

    console.log(
      `Calling tool ${toolName} on server ${serverName} with args:`,
      toolArgs
    );

    while (retries >= 0) {
      try {
        // Use server-specific client
        const result = await client.callTool({
          name: toolName,
          arguments: toolArgs,
        });

        console.log(`Tool ${toolName} returned result:`, result);
        return result; // Success, return the result
      } catch (error) {
        lastError = error;
        console.warn(
          `Tool call attempt failed (${
            maxRetries - retries
          }/${maxRetries}): ${toolName} on server ${serverName}`,
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
  private formatToolResponse(content: unknown): string {
    if (typeof content === "string") {
      return content;
    } else if (content !== null && typeof content === "object") {
      // Handle specific formatting for GitHub search results
      if (
        Array.isArray(content) &&
        content.length > 0 &&
        content[0]?.type === "text"
      ) {
        try {
          // For GitHub API responses that come back as an array with text content
          const textContent = content[0].text;
          if (typeof textContent === "string") {
            // Try to parse and prettify JSON responses
            try {
              const jsonObject = JSON.parse(textContent);

              // Special handling for search_repositories results
              if (jsonObject.items && Array.isArray(jsonObject.items)) {
                const totalCount = jsonObject.total_count || 0;
                let formattedResults = `Found ${totalCount} repositories:\n\n`;

                // Define a proper type for GitHub repository objects
                interface GitHubRepo {
                  full_name: string;
                  description: string | null;
                  stargazers_count: number;
                  forks_count?: number;
                  forks?: number;
                  html_url: string;
                }

                jsonObject.items
                  .slice(0, 10)
                  .forEach((repo: GitHubRepo, index: number) => {
                    // Ensure proper formatting with line breaks and indentation
                    formattedResults += `${index + 1}. **${repo.full_name}**\n`;
                    formattedResults += `   ${
                      repo.description || "No description"
                    }\n`;

                    // Handle different ways the API might return fork counts
                    const forks =
                      repo.forks_count !== undefined
                        ? repo.forks_count
                        : repo.forks !== undefined
                        ? repo.forks
                        : 0;

                    formattedResults += `   ⭐ ${
                      repo.stargazers_count || 0
                    } | 🍴 ${forks}\n`;
                    formattedResults += `   ${repo.html_url}\n\n`;
                  });

                if (jsonObject.items.length > 10) {
                  formattedResults += `*...and ${
                    jsonObject.items.length - 10
                  } more results*\n`;
                }

                return formattedResults;
              }

              // Default formatting for other JSON responses
              return JSON.stringify(jsonObject, null, 2);
            } catch (e) {
              // If not valid JSON, return text as is
              return textContent;
            }
          }
        } catch (err) {
          console.error("Error parsing tool response:", err);
        }
      }

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

  // Get available tools
  getTools() {
    return this.getToolsWithServers();
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Update available tools when the client changes or when the client's state changes
  useEffect(() => {
    if (mcpClient) {
      setAvailableTools(mcpClient.getToolsWithServers());
    }
  }, [mcpClient]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

      if (!mcpClient) {
        throw new Error("MCP Client not initialized");
      }

      // Create a streaming assistant message with an initial empty content
      const assistantMessageId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          content: "",
          isUser: false,
          timestamp: formatTime(new Date()),
        },
      ]);

      // Process with streaming
      await mcpClient.processQueryWithStreaming(
        content,
        // Text update handler
        (updatedContent, isDone) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: updatedContent }
                : msg
            )
          );

          if (isDone) {
            setIsLoading(false);
          }
        },
        // Tool call handler
        (toolName) => {
          console.log(`Tool call started: ${toolName}`);
        },
        // Tool result handler
        (toolResult) => {
          console.log(`Tool result received`);
        }
      );

      // Update tools in case they changed
      setAvailableTools(mcpClient.getToolsWithServers());
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
          <div ref={messagesEndRef} />
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
