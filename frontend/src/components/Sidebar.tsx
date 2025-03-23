import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import Message from "./Message";
import SidebarChatInput from "./SidebarChatInput";
import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// MCP Client implementation
class MCPClient {
  private anthropic: Anthropic;
  private mcp: Client;
  private tools = [];

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });
    this.mcp = new Client({ name: "mcp-client-web", version: "1.0.0" });

    // Initialize with available tools from the MCP protocol
    this.setupTools();
  }

  private setupTools() {
    // Define the tools that can be called by Claude
    // In a real implementation, this would come from MCP
    this.tools = [
      {
        name: "search",
        description: "Search for information on a given topic",
        input_schema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "calculator",
        description: "Perform calculations",
        input_schema: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "The mathematical expression to evaluate",
            },
          },
          required: ["expression"],
        },
      },
    ];
  }

  async processQuery(query: string) {
    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

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

        // In a real implementation, these tool calls would be handled by MCP
        // This is a simplified version for demonstration
        finalText.push(`[Using tool: ${toolName}]`);

        try {
          // Simulate tool response
          let toolResponse = "Tool result not available in this demo.";

          if (
            toolName === "calculator" &&
            typeof toolInput.expression === "string"
          ) {
            try {
              // Simple eval for demonstration - in real use, use a safer calculation method
              toolResponse = `Result: ${eval(toolInput.expression)}`;
            } catch (error) {
              toolResponse = "Error calculating result.";
            }
          } else if (
            toolName === "search" &&
            typeof toolInput.query === "string"
          ) {
            toolResponse = `Search results for "${toolInput.query}" would appear here.`;
          }

          // Add the tool use to messages for context
          messages.push({
            role: "assistant",
            content: `I'll use the ${toolName} tool to help with that.`,
          });

          // Add the tool response to messages
          messages.push({
            role: "user",
            content: toolResponse,
          });

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
          finalText.push("Error processing tool call.");
        }
      }
    }

    return finalText.join("\n");
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
      content: "Need any help?",
      isUser: false,
      timestamp: formatTime(new Date()),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [mcpClient, setMcpClient] = useState<MCPClient | null>(null);

  useEffect(() => {
    // Initialize MCP client
    const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (ANTHROPIC_API_KEY) {
      setMcpClient(new MCPClient(ANTHROPIC_API_KEY as string));
    }
  }, []);

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
        />
      </div>
    </div>
  );
};

export default Sidebar;
