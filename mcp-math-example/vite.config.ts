import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    host: true, // Allow all hosts
    allowedHosts: true,
    cors: true,
    hmr: {
      clientPort: 443,
      protocol: "wss",
    },
  },
});
