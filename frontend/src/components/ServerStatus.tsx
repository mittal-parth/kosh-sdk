import React, { useState, useEffect } from "react";
import {
  Server,
  ServerCog,
  X,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { MCPClient, MCP_SERVERS, getServerDisplayName, Tool } from "./Sidebar";
import {
  Table,
  TableHeader,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Server configuration from Sidebar
interface ServerConfig {
  url: string;
  enabled?: boolean;
  description?: string;
  icon?: string;
}

// Import server configurations from Sidebar instead of redefining them
// const MCP_SERVERS: Record<string, ServerConfig> = { ... }

// Use getServerDisplayName imported from Sidebar
// const getServerDisplayName = (serverName: string): string => { ... };

// Define our extended tool type instead of redefining Tool
interface ExtendedTool extends Tool {
  server?: string;
  serverIcon?: React.ReactNode;
}

export interface ServerStatusProps {
  mcpClient: MCPClient;
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
  const [availableTools, setAvailableTools] = useState<ExtendedTool[]>([]);
  const { toast } = useToast();

  // Update connected servers when mcpClient changes
  useEffect(() => {
    if (mcpClient) {
      setAvailableTools(mcpClient.getToolsWithServers());
      setConnectedServers(mcpClient.getConnectedServers());
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

    try {
      let success = false;

      if (!isCurrentlyConnected) {
        // Connect to the server
        success = await mcpClient.connectToServer(serverName);
        if (success) {
          // Update available tools and connected servers
          setAvailableTools(mcpClient.getToolsWithServers());
          setConnectedServers(mcpClient.getConnectedServers());

          // Update server status
          setServerStatus((prev) => ({
            ...prev,
            [serverName]: true,
          }));

          toast({
            title: "Server connected",
            description: `Successfully connected to ${serverName}.`,
          });
        } else {
          toast({
            title: "Connection failed",
            description: `Failed to connect to server: ${serverName}`,
            variant: "destructive",
          });
        }
      } else {
        // Disconnect from the server
        success = await mcpClient.disconnectFromServer(serverName);
        if (success) {
          // Update available tools and connected servers
          setAvailableTools(mcpClient.getToolsWithServers());
          setConnectedServers(mcpClient.getConnectedServers());

          // Update server status
          setServerStatus((prev) => ({
            ...prev,
            [serverName]: false,
          }));

          toast({
            title: "Server disconnected",
            description: `Disconnected from ${serverName}.`,
          });
        } else {
          toast({
            title: "Disconnection failed",
            description: `Failed to disconnect from server: ${serverName}`,
            variant: "destructive",
          });
        }
      }

      // If operation was not successful, don't update UI state
      if (!success) {
        // Revert server status on error
        setServerStatus((prev) => ({
          ...prev,
          [serverName]: isCurrentlyConnected,
        }));
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
          <div className="flex flex-col gap-6">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Server Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Connection</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(MCP_SERVERS).map(([serverName, config]) => {
                    const isConnected = serverStatus[serverName] || false;
                    const isLoading = serverLoadingStates[serverName] || false;
                    const healthInfo = serverHealthInfo[serverName];

                    return (
                      <TableRow key={serverName}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{config.icon}</span>
                            <span>{serverName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isConnected ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="text-green-600">Connected</span>
                              {healthInfo && (
                                <Badge variant="outline" className="ml-2">
                                  {healthInfo.latency}ms
                                </Badge>
                              )}
                            </div>
                          ) : healthInfo ? (
                            <div className="flex items-center gap-2">
                              {healthInfo.status === "timeout" ? (
                                <>
                                  <AlertCircle className="h-4 w-4 text-amber-600" />
                                  <span className="text-amber-600">
                                    Timeout
                                  </span>
                                </>
                              ) : healthInfo.status === "error" ? (
                                <>
                                  <AlertCircle className="h-4 w-4 text-red-600" />
                                  <span className="text-red-600">Error</span>
                                </>
                              ) : healthInfo.status === "unknown" ? (
                                <>
                                  <Info className="h-4 w-4 text-blue-600" />
                                  <span className="text-blue-600">Unknown</span>
                                </>
                              ) : (
                                <>
                                  <Info className="h-4 w-4 text-slate-600" />
                                  <span className="text-slate-600">
                                    Disconnected
                                  </span>
                                </>
                              )}
                              {healthInfo &&
                                healthInfo.latency !== undefined && (
                                  <Badge variant="outline" className="ml-2">
                                    {healthInfo.latency}ms
                                  </Badge>
                                )}
                            </div>
                          ) : (
                            <span className="text-slate-600">Not checked</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={isConnected}
                              disabled={isLoading}
                              onCheckedChange={() =>
                                toggleServerConnection(serverName)
                              }
                            />
                            {isLoading && (
                              <RefreshCw className="h-4 w-4 animate-spin text-slate-500" />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-md border p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Available Tools</h3>
                {connectedServers.length > 0 && (
                  <Badge variant="outline">
                    {connectedServers.length} server
                    {connectedServers.length !== 1 ? "s" : ""} connected
                  </Badge>
                )}
              </div>

              {availableTools.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Server</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableTools.map((tool) => (
                      <TableRow key={tool.name}>
                        <TableCell className="font-medium">
                          {tool.name}
                        </TableCell>
                        <TableCell>{tool.description}</TableCell>
                        <TableCell>
                          {(() => {
                            // Get server info for this tool
                            const serverInfo = mcpClient.getServerForTool(
                              tool.name
                            );
                            if (serverInfo) {
                              return (
                                <div className="flex items-center gap-2">
                                  <span>{serverInfo.icon}</span>
                                  <span>{serverInfo.name}</span>
                                </div>
                              );
                            }
                            return <Badge variant="outline">Unknown</Badge>;
                          })()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : connectedServers.length > 0 ? (
                <div className="rounded-md bg-amber-50 p-4 text-amber-800">
                  <div className="flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    <span>
                      No tools available from the connected server(s).
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-slate-50 p-4 text-slate-800">
                  <div className="flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    <span>Connect to a server to see available tools.</span>
                  </div>
                </div>
              )}
            </div>
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
