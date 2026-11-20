import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

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

// Submission build only. @firebase/app ships an allowlist of remote script URLs (gtag, gapi, reCAPTCHA).
// Manifest V3 forbids remotely hosted code and this build never loads any, so empty the list: no remote
// script URL stays in the bundle, and the SDK's script-URL check would reject every URL anyway.
function emptyRemoteScriptAllowlist(): Plugin {
  const pattern = /const ALLOWED_SCRIPT_URLS = \[[\s\S]*?\];/;
  return {
    name: "xray-empty-remote-script-allowlist",
    transform(code) {
      return pattern.test(code) ? { code: code.replace(pattern, "const ALLOWED_SCRIPT_URLS = [];"), map: null } : null;
    },
  };
}

// Main build: side panel + welcome pages and the service worker (an ES module worker).
// The content script is built separately (vite.content.config.ts) because it must be one classic script.
export default defineConfig(({ mode }) => {
  const submission = mode === "submission";
  const envDir = path.resolve(process.cwd(), ".."); // the shared .env lives at the repo root

  // Submission only: the App Check debug token for judges comes from XRAY_APPCHECK_DEBUG_TOKEN (shell
  // environment or the git-ignored root .env). It is injected at build time and never read from the repo.
  let token = "";
  if (submission) {
    token = (process.env.XRAY_APPCHECK_DEBUG_TOKEN ?? loadEnv(mode, envDir, "XRAY_").XRAY_APPCHECK_DEBUG_TOKEN ?? "").trim();
    if (!/^[A-Za-z0-9-]{16,64}$/.test(token)) {
      throw new Error(
        "Submission build needs XRAY_APPCHECK_DEBUG_TOKEN (the judges debug token, 16-64 letters, digits or dashes). " +
          "Set it in your shell or in the git-ignored root .env. See extension/README.md, 'Submission build'.",
      );
    }
  }

  return {
    plugins: [react(), tailwindcss(), manifest(), ...(submission ? [emptyRemoteScriptAllowlist()] : [])],
    envDir, // only VITE_* variables reach the bundle; XRAY_* never does
    define: {
      // Empty outside submission builds, so the debug token can only ever come from the explicit variable above.
      __XRAY_APPCHECK_DEBUG_TOKEN__: JSON.stringify(token),
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
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
  };
});
