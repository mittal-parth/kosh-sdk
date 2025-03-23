import React, { useState } from "react";
import Sidebar, { MCPClient } from "@/components/Sidebar";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
  mcpClient: MCPClient | null;
}

const Layout: React.FC<LayoutProps> = ({ children, mcpClient }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-app-light flex relative">
      {/* Main content area */}
      <div className="flex-1 p-4 md:p-8 lg:mr-[30vw] transition-all duration-300">
        {children}
      </div>

      {/* Toggle button for mobile */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="fixed bottom-4 right-4 z-50 p-3 bg-app-accent text-white rounded-full shadow-lg lg:hidden hover:bg-app-accent/90 transition-colors"
        aria-label="Toggle chat"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </button>

      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        mcpClient={mcpClient}
      />
    </div>
  );
};

export default Layout;
