
import React, { useState } from 'react';
import { Server, ServerCog, ToggleLeft, ToggleRight, Plus, X, Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";

type ServerTool = {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  lastUpdated: string;
  description: string;
};

type ServerData = {
  id: string;
  name: string;
  ipAddress: string;
  status: 'online' | 'offline' | 'maintenance';
  region: string;
  lastUpdated: string;
  tools: ServerTool[];
  connectionStatus?: 'connecting' | 'connected' | 'disconnected';
};

const AVAILABLE_SERVERS: ServerData[] = [
  {
    id: "server-1",
    name: "Main Production",
    ipAddress: "192.168.1.101",
    status: "online",
    region: "US East",
    lastUpdated: "5 minutes ago",
    tools: [
      { id: "tool-1-1", name: "Load Balancer", status: "active", lastUpdated: "10 minutes ago", description: "Distributes network traffic across servers" },
      { id: "tool-1-2", name: "Firewall", status: "active", lastUpdated: "15 minutes ago", description: "Network security system" },
      { id: "tool-1-3", name: "Monitoring", status: "active", lastUpdated: "5 minutes ago", description: "System health and performance monitoring" }
    ]
  },
  {
    id: "server-2",
    name: "Backup Server",
    ipAddress: "192.168.1.102",
    status: "online",
    region: "US West",
    lastUpdated: "10 minutes ago",
    tools: [
      { id: "tool-2-1", name: "Backup Service", status: "active", lastUpdated: "20 minutes ago", description: "Automated data backup and recovery" },
      { id: "tool-2-2", name: "File Synchronization", status: "active", lastUpdated: "25 minutes ago", description: "Keeps files in sync across instances" }
    ]
  },
  {
    id: "server-3",
    name: "Development",
    ipAddress: "192.168.1.103",
    status: "maintenance",
    region: "Europe",
    lastUpdated: "1 hour ago",
    tools: [
      { id: "tool-3-1", name: "CI/CD Pipeline", status: "inactive", lastUpdated: "2 hours ago", description: "Continuous integration and deployment" },
      { id: "tool-3-2", name: "Test Environment", status: "inactive", lastUpdated: "2 hours ago", description: "Isolated environment for testing" },
      { id: "tool-3-3", name: "Code Repository", status: "active", lastUpdated: "30 minutes ago", description: "Version control system" }
    ]
  },
  {
    id: "server-4",
    name: "Analytics",
    ipAddress: "192.168.1.104",
    status: "offline",
    region: "Asia Pacific",
    lastUpdated: "2 days ago",
    tools: [
      { id: "tool-4-1", name: "Data Warehouse", status: "inactive", lastUpdated: "2 days ago", description: "Large-scale data storage and analysis" },
      { id: "tool-4-2", name: "Report Generator", status: "inactive", lastUpdated: "2 days ago", description: "Creates reports from analytics data" },
      { id: "tool-4-3", name: "Data Processing", status: "inactive", lastUpdated: "2 days ago", description: "Processes raw data for analytics" }
    ]
  }
];

const ServerStatus = () => {
  const [connectedServers, setConnectedServers] = useState<ServerData[]>([]);
  const [connectingServer, setConnectingServer] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const { toast } = useToast();
  
  const addServer = (server: ServerData) => {
    // Check if server is already added
    if (connectedServers.some(s => s.id === server.id)) {
      toast({
        title: "Server already added",
        description: `${server.name} is already in your server list.`,
        variant: "destructive",
      });
      return;
    }

    // Set connecting status
    setConnectingServer(server.id);
    
    // Simulate connection process
    setTimeout(() => {
      const serverWithStatus: ServerData = {
        ...server,
        connectionStatus: 'connected'
      };
      
      setConnectedServers(prev => [...prev, serverWithStatus]);
      setConnectingServer(null);
      
      toast({
        title: "Server connected",
        description: `Successfully connected to ${server.name}.`,
      });
    }, 2000);
  };
  
  const removeServer = (serverId: string) => {
    setConnectedServers(prev => prev.filter(server => server.id !== serverId));
    if (selectedServerId === serverId) {
      setSelectedServerId(null);
    }
    
    toast({
      title: "Server removed",
      description: "Server has been disconnected and removed from your list.",
    });
  };
  
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-panel rounded-lg overflow-hidden">
        <div className="border-b border-app-border px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-medium">Connected Servers</h2>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Plus size={16} />
                <span>Add Server</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Available Servers</DialogTitle>
                <DialogDescription>
                  Select a server to connect to your instance.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-1 gap-4 mt-4">
                {AVAILABLE_SERVERS.map((server) => (
                  <div 
                    key={server.id}
                    className="border rounded-lg p-4 hover:border-app-accent/50 cursor-pointer"
                    onClick={() => addServer(server)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className={cn(
                          "p-2 rounded-md",
                          server.status === "online" ? "bg-green-100 text-green-800" :
                          server.status === "maintenance" ? "bg-yellow-100 text-yellow-800" :
                          "bg-red-100 text-red-800"
                        )}>
                          <Server className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-medium">{server.name}</h3>
                          <p className="text-sm text-gray-500">{server.ipAddress}</p>
                          <p className="text-xs text-gray-400 mt-1">Region: {server.region}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="p-6">
          {connectedServers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <ServerCog className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <p>No servers connected. Add a server to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connectedServers.map((server) => (
                <div 
                  key={server.id}
                  className={cn(
                    "border rounded-lg p-4 transition-all duration-300",
                    selectedServerId === server.id ? "border-app-accent bg-app-accent/5" : "border-app-border hover:border-app-accent/50",
                    "cursor-pointer"
                  )}
                  onClick={() => setSelectedServerId(selectedServerId === server.id ? null : server.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className={cn(
                        "p-2 rounded-md",
                        server.status === "online" ? "bg-green-100 text-green-800" :
                        server.status === "maintenance" ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      )}>
                        <Server className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-medium">{server.name}</h3>
                        <p className="text-sm text-gray-500">{server.ipAddress}</p>
                        <div className="flex items-center mt-1">
                          <span 
                            className={cn(
                              "h-2 w-2 rounded-full mr-2",
                              server.connectionStatus === "connected" ? "bg-green-500" : "bg-yellow-500"
                            )}
                          ></span>
                          <span className="text-xs text-gray-500">
                            {server.connectionStatus === "connecting" ? "Connecting..." : "Connected"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeServer(server.id);
                      }}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                </div>
              ))}
              
              {connectingServer && (
                <div className="border rounded-lg p-4 border-yellow-300 bg-yellow-50">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-md bg-yellow-100 text-yellow-800">
                      <Server className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium">
                        {AVAILABLE_SERVERS.find(s => s.id === connectingServer)?.name}
                      </h3>
                      <div className="flex items-center">
                        <span className="h-2 w-2 rounded-full bg-yellow-500 mr-2 animate-pulse"></span>
                        <span className="text-sm text-yellow-700">Connecting...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {selectedServerId && (
        <div className="glass-panel rounded-lg overflow-hidden">
          <div className="border-b border-app-border px-6 py-4">
            <h2 className="text-xl font-medium">Server Details</h2>
          </div>
          <div className="p-6 space-y-8">
            {(() => {
              const server = connectedServers.find(s => s.id === selectedServerId);
              if (!server) return null;
              
              return (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Server className="h-6 w-6 text-app-accent" />
                    <h3 className="text-lg font-medium">{server.name}</h3>
                    <span 
                      className={cn(
                        "text-xs px-2 py-1 rounded-full",
                        server.status === "online" ? "bg-green-100 text-green-800" :
                        server.status === "maintenance" ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      )}
                    >
                      {server.status}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="text-sm uppercase tracking-wider text-gray-500 mb-3">Server Details</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">IP Address</span>
                            <span className="font-mono">{server.ipAddress}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Region</span>
                            <span>{server.region}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Last Updated</span>
                            <span>{server.lastUpdated}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Connection</span>
                            <span className="flex items-center">
                              <span 
                                className={cn(
                                  "h-2 w-2 rounded-full mr-2",
                                  "bg-green-500"
                                )}
                              ></span>
                              Connected
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="text-sm uppercase tracking-wider text-gray-500 mb-3">Available Tools</h4>
                        <div className="space-y-3">
                          {server.tools.map(tool => (
                            <div key={tool.id} className="flex items-center justify-between pb-2 border-b border-gray-200 last:border-0">
                              <div>
                                <div className="font-medium">{tool.name}</div>
                                <div className="text-xs text-gray-500">{tool.description}</div>
                              </div>
                              <div className="flex items-center">
                                <span 
                                  className={cn(
                                    "h-2 w-2 rounded-full mr-2",
                                    tool.status === "active" ? "bg-green-500" : "bg-red-500"
                                  )}
                                ></span>
                                <span className="text-xs text-gray-500">{tool.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
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
