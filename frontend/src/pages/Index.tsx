import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import Layout from "@/components/Layout";
import ServerStatus from "@/components/ServerStatus";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { MCPClient } from "@/components/Sidebar";

interface SystemConfig {
  name: string;
  version: string;
  status: string;
}

const Index = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [mcpClient, setMcpClient] = useState<MCPClient | null>(null);

  useEffect(() => {
    // Initialize MCP client
    const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (ANTHROPIC_API_KEY) {
      setMcpClient(new MCPClient(ANTHROPIC_API_KEY as string));
    }

    // Simulate loading configuration
    const timer = setTimeout(() => {
      setConfig({
        name: "Kosh MCP",
        version: "1.0.0",
        status: "Ready",
      });
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Layout mcpClient={mcpClient}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div className="animate-fade-in">
            <h1 className="text-3xl font-semibold mb-2">Kosh MCP</h1>
            <p className="text-gray-500">
              A Secure MCP Solution powered by TEEs
            </p>
          </div>
          <div className="flex space-x-3">
            <Button variant="outline" className="flex items-center gap-2">
              <MessageCircle size={18} />
              <span>New Chat</span>
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {isLoading ? <LoadingState /> : <ConfigDisplay config={config} />}

          {!isLoading && (
            <ServerStatus
              mcpClient={mcpClient}
              onServerConnectionChange={(servers) => {
                console.log("Connected servers changed:", servers);
              }}
            />
          )}
        </div>
      </div>
    </Layout>
  );
};

const LoadingState = () => {
  return (
    <div className="glass-panel rounded-lg p-6 space-y-4">
      <div className="flex items-center space-x-4">
        <div className="h-12 w-12 rounded-full bg-gray-200 animate-pulse"></div>
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6"></div>
        </div>
      </div>
      <div className="h-32 bg-gray-200 rounded animate-pulse"></div>
      <div className="grid grid-cols-3 gap-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
      </div>
    </div>
  );
};

interface ConfigDisplayProps {
  config: SystemConfig | null;
}

const ConfigDisplay: React.FC<ConfigDisplayProps> = ({ config }) => {
  if (!config) return null;

  return (
    <div className="glass-panel rounded-lg overflow-hidden animate-fade-in">
      <div className="border-b border-app-border px-6 py-4">
        <h2 className="text-xl font-medium">System Status</h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 gap-6">
          <div>
            <h3 className="text-sm text-gray-500 uppercase tracking-wider mb-3">
              Information
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Name</span>
                <span className="font-medium">{config.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Version</span>
                <span className="font-medium">{config.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status</span>
                <span className="font-medium text-green-500">
                  {config.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
