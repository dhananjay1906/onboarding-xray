import path from "node:path";
import { defineConfig } from "vite";

// Content scripts cannot use ES module imports, so build one self-contained IIFE.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: path.resolve(process.cwd(), "src/content/index.ts"),
      formats: ["iife"],
      name: "XRayContent",
      fileName: () => "content.js",
    },
  },
});
