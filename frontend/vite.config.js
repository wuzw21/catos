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
  },
});
