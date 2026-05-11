import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "frontend",
  base: "/web/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:2333",
      "/__content": "http://127.0.0.1:2333",
    },
  },
  build: {
    outDir: "../web",
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-hook-form") || id.includes("@hookform") || id.includes("zod")) return "forms";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("react-day-picker") || id.includes("date-fns")) return "calendar";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("sonner")) return "feedback";
          return "vendor";
        },
      },
    },
  },
});
