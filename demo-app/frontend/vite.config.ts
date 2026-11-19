import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import dataSource from "./plugins/dataSource";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // On by default (dev and production builds); set VITE_XRAY_TAGS=false to disable.
  const xrayTags = env.VITE_XRAY_TAGS !== "false";

  return {
    plugins: [...(xrayTags ? [dataSource()] : []), react()],
    server: {
      port: 5173,
      proxy: { "/api": "http://127.0.0.1:8000" },
    },
  };
});
