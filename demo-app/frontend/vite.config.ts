import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dataSource from "./plugins/dataSource";

export default defineConfig({
  plugins: [dataSource(), react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
