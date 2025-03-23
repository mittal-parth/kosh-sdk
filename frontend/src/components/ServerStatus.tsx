import React, { useState, useEffect } from "react";
import { Server, ServerCog, X, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { MCPClient } from "./Sidebar";
import { Tool } from "@anthropic-ai/sdk/resources";

// Server configuration from Sidebar
interface ServerConfig {
  url: string;
  enabled?: boolean;
  description?: string;
  icon?: string;
}

// MCP Server configurations
const MCP_SERVERS: Record<string, ServerConfig> = {
  "nilrag-brave": {
    url: "http://localhost:5173/mcp",
    enabled: false,
    description: "Brave nilRAG Server (localhost)",
    icon: "🦁",
  },
  // Add sample servers for demonstration
  "vector-search": {
    url: "http://localhost:5174/mcp",
    enabled: false,
    description: "Vector Search Server",
    icon: "🔍",
  },
  "knowledge-base": {
    url: "http://localhost:5175/mcp",
    enabled: false,
    description: "Knowledge Base Server",
    icon: "📚",
  },
  // Add more server configurations here
};

// Display server in a more user-friendly way
const getServerDisplayName = (serverName: string): string => {
  const config = MCP_SERVERS[serverName];
  if (!config || !config.icon) {
    return serverName;
  }
  return `${config.icon} ${serverName}`;
};

interface ServerStatusProps {
  mcpClient: MCPClient | null;
  onServerConnectionChange?: (connectedServers: string[]) => void;
}

const ServerStatus: React.FC<ServerStatusProps> = ({
  mcpClient,
  onServerConnectionChange,
}) => {
  const [connectedServers, setConnectedServers] = useState<string[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<Record<string, boolean>>(
    Object.keys(MCP_SERVERS).reduce((acc, server) => {
      acc[server] = MCP_SERVERS[server].enabled || false;
      return acc;
    }, {} as Record<string, boolean>)
  );
  const [serverLoadingStates, setServerLoadingStates] = useState<
    Record<string, boolean>
  >(
    Object.keys(MCP_SERVERS).reduce((acc, server) => {
      acc[server] = false;
      return acc;
    }, {} as Record<string, boolean>)
  );
  const [serverHealthInfo, setServerHealthInfo] = useState<
    Record<string, { status: string; latency: number } | null>
  >({});
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const { toast } = useToast();

  // Update connected servers when mcpClient changes
  useEffect(() => {
    if (mcpClient) {
      const currentConnectedServers = mcpClient.getConnectedServers();
      setConnectedServers(currentConnectedServers);
      setAvailableTools(mcpClient.getTools());
    }
  }, [mcpClient]);

  // Update server status when connected servers change
  useEffect(() => {
    if (mcpClient) {
      // Sync server status with connected servers
      const updatedStatus = Object.keys(serverStatus).reduce((acc, server) => {
        // Initialize all to false
        acc[server] = false;
        return acc;
      }, {} as Record<string, boolean>);

      // Set connected ones to true
      connectedServers.forEach((server) => {
        if (Object.prototype.hasOwnProperty.call(updatedStatus, server)) {
          updatedStatus[server] = true;
        }
      });

      setServerStatus(updatedStatus);

      // Notify parent component of connection changes
      if (onServerConnectionChange) {
        onServerConnectionChange(connectedServers);
      }
    }
  }, [mcpClient, connectedServers]);

  // Connect or disconnect from a server
  const toggleServerConnection = async (serverName: string) => {
    if (!mcpClient) {
      toast({
        title: "Client not initialized",
        description: "MCP Client is not initialized yet.",
        variant: "destructive",
      });
      return;
    }

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

      // Update server health info
      if (availabilityCheck.health) {
        setServerHealthInfo((prev) => ({
          ...prev,
          [serverName]: availabilityCheck.health,
        }));
      }

      if (!availabilityCheck.available) {
        toast({
          title: "Server unavailable",
          description: availabilityCheck.message,
          variant: "destructive",
        });

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
          // Update available tools and connected servers
          setAvailableTools(mcpClient.getTools());
          setConnectedServers(mcpClient.getConnectedServers());

          toast({
            title: "Server connected",
            description: `Successfully connected to ${serverName}.`,
          });
        } else {
          // Connection failed, revert status
          setServerStatus((prev) => ({
            ...prev,
            [serverName]: false,
          }));

          toast({
            title: "Connection failed",
            description: `Failed to connect to server: ${serverName}`,
            variant: "destructive",
          });
        }
      } else {
        // Disconnect from the server
        const success = await mcpClient.disconnectFromServer(serverName);
        if (success) {
          // Update available tools and connected servers
          setAvailableTools(mcpClient.getTools());
          setConnectedServers(mcpClient.getConnectedServers());

          toast({
            title: "Server disconnected",
            description: `Disconnected from ${serverName}.`,
          });
        } else {
          // Disconnection failed, revert status
          setServerStatus((prev) => ({
            ...prev,
            [serverName]: true,
          }));

          toast({
            title: "Disconnection failed",
            description: `Failed to disconnect from server: ${serverName}`,
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error(`Error toggling server ${serverName} connection:`, error);
      // Revert status on error
      setServerStatus((prev) => ({
        ...prev,
        [serverName]: isCurrentlyConnected,
      }));

      toast({
        title: "Error",
        description: `Error with server ${serverName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        variant: "destructive",
      });
    } finally {
      // Reset loading state
      setServerLoadingStates((prev) => ({
        ...prev,
        [serverName]: false,
      }));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-panel rounded-lg overflow-hidden">
        <div className="border-b border-app-border px-6 py-4">
          <h2 className="text-xl font-medium">Available Servers</h2>
        </div>

        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="pb-2 text-left font-medium text-gray-500 text-sm">
                    Server
                  </th>
                  <th className="pb-2 text-left font-medium text-gray-500 text-sm">
                    URL
                  </th>
                  <th className="pb-2 text-left font-medium text-gray-500 text-sm">
                    Status
                  </th>
                  <th className="pb-2 text-right font-medium text-gray-500 text-sm">
                    Connection
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(MCP_SERVERS).map((serverName) => (
                  <tr
                    key={serverName}
                    className={cn(
                      "border-b border-gray-100 hover:bg-gray-50 cursor-pointer",
                      selectedServerId === serverName ? "bg-app-accent/5" : ""
                    )}
                    onClick={() =>
                      setSelectedServerId(
                        selectedServerId === serverName ? null : serverName
                      )
                    }
                  >
                    <td className="py-3">
                      <div className="flex items-center">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center mr-2",
                            serverStatus[serverName]
                              ? "bg-green-100"
                              : "bg-gray-100"
                          )}
                        >
                          <Server
                            className={cn(
                              "h-4 w-4",
                              serverStatus[serverName]
                                ? "text-green-600"
                                : "text-gray-600"
                            )}
                          />
                        </div>
                        <div>
                          <div className="font-medium">
                            {getServerDisplayName(serverName)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {MCP_SERVERS[serverName].description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-sm font-mono text-gray-600">
                      {MCP_SERVERS[serverName].url}
                    </td>
                    <td className="py-3">
                      {serverHealthInfo[serverName] ? (
                        <div className="flex items-center">
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full mr-2",
                              serverHealthInfo[serverName]?.status === "healthy"
                                ? "bg-green-500"
                                : serverHealthInfo[serverName]?.status ===
                                  "unhealthy"
                                ? "bg-yellow-500"
                                : "bg-red-500"
                            )}
                          ></span>
                          <span className="text-sm">
                            {serverHealthInfo[serverName]?.status === "healthy"
                              ? "Healthy"
                              : serverHealthInfo[serverName]?.status ===
                                "unhealthy"
                              ? "Unhealthy"
                              : "Error"}
                          </span>
                          <span className="text-xs text-gray-500 ml-1">
                            ({serverHealthInfo[serverName]?.latency}ms)
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">Unknown</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end">
                        {serverLoadingStates[serverName] ? (
                          <div className="flex items-center text-yellow-600">
                            <svg
                              className="animate-spin -ml-1 mr-2 h-4 w-4"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            <span className="text-sm">Connecting...</span>
                          </div>
                        ) : (
                          <Switch
                            checked={serverStatus[serverName]}
                            onCheckedChange={() =>
                              toggleServerConnection(serverName)
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedServerId && (
        <div className="glass-panel rounded-lg overflow-hidden">
          <div className="border-b border-app-border px-6 py-4">
            <h2 className="text-xl font-medium">
              Server Details: {getServerDisplayName(selectedServerId)}
            </h2>
          </div>
          <div className="p-6 space-y-8">
            {(() => {
              if (!selectedServerId || !MCP_SERVERS[selectedServerId])
                return null;

              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="text-sm uppercase tracking-wider text-gray-500 mb-3">
                          Server Details
                        </h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">URL</span>
                            <span className="font-mono">
                              {MCP_SERVERS[selectedServerId].url}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Status</span>
                            <span className="flex items-center">
                              {serverStatus[selectedServerId] ? (
                                <>
                                  <span className="h-2 w-2 rounded-full bg-green-500 mr-2"></span>
                                  Connected
                                </>
                              ) : (
                                <>
                                  <span className="h-2 w-2 rounded-full bg-gray-300 mr-2"></span>
                                  Disconnected
                                </>
                              )}
                            </span>
                          </div>
                          {serverHealthInfo[selectedServerId] && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Latency</span>
                              <span>
                                {serverHealthInfo[selectedServerId]?.latency}ms
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm uppercase tracking-wider text-gray-500 mb-3">
                      Available Tools
                    </h4>

                    {serverStatus[selectedServerId] ? (
                      availableTools.length > 0 ? (
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="pb-2 text-left font-medium text-gray-500 text-sm">
                                Tool
                              </th>
                              <th className="pb-2 text-left font-medium text-gray-500 text-sm">
                                Description
                              </th>
                              <th className="pb-2 text-right font-medium text-gray-500 text-sm">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {availableTools.map((tool, index) => (
                              <tr
                                key={index}
                                className="border-b border-gray-100 last:border-0"
                              >
                                <td className="py-2 font-medium">
                                  {tool.name}
                                </td>
                                <td className="py-2 text-sm text-gray-600">
                                  {tool.description}
                                </td>
                                <td className="py-2 text-right">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Active
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <p>No tools available from this server.</p>
                        </div>
                      )
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <p>Connect to server to view available tools.</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerStatus;
