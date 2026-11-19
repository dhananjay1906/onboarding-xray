import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

// Emits manifest.json into dist/ (public/ already carries graph.json).
function manifest(): Plugin {
  const file = path.resolve(process.cwd(), "manifest.json");
  return {
    name: "xray-manifest",
    buildStart() {
      this.addWatchFile(file);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.json", source: fs.readFileSync(file, "utf8") });
    },
  };
}

// Main build: side panel + welcome pages and the service worker (an ES module worker).
// The content script is built separately (vite.content.config.ts) because it must be one classic script.
export default defineConfig({
  plugins: [react(), tailwindcss(), manifest()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: path.resolve(process.cwd(), "sidepanel.html"),
        welcome: path.resolve(process.cwd(), "welcome.html"),
        background: path.resolve(process.cwd(), "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
      },
    },
  },
});
