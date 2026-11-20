// Runs the whole analyzer pipeline: backend -> frontend -> merge -> copy to the extension.
// Usage (from the repo root): npm run analyze [-- --backend <dir> --frontend <dir>]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const analyzerDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(analyzerDir);
const outDir = path.join(analyzerDir, "out");

let backend = path.join(repoRoot, "demo-app", "backend");
let frontend = path.join(repoRoot, "demo-app", "frontend");
let copy = true; // copy graph.json into the extension (--no-copy keeps the bundled demo graph untouched)
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--backend") backend = path.resolve(args[++i]);
  else if (args[i] === "--frontend") frontend = path.resolve(args[++i]);
  else if (args[i] === "--no-copy") copy = false;
  else {
    console.error(`unknown argument: ${args[i]}\nusage: npm run analyze [-- --backend DIR --frontend DIR --no-copy]`);
    process.exit(2);
  }
}

function run(label, cmd, cmdArgs, cwd = repoRoot) {
  console.log(`\n> ${label}`);
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit", shell: false });
  if (r.error || r.status !== 0) {
    console.error(`\nFailed: ${label}${r.error ? ` (${r.error.message})` : ` (exit ${r.status})`}`);
    process.exit(r.status || 1);
  }
}

function findPython() {
  const candidates = [
    process.env.PYTHON,
    path.join(repoRoot, ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, ".venv", "bin", "python"),
    "python3",
    "python",
  ].filter(Boolean);
  for (const c of candidates) {
    if (path.isAbsolute(c) && !fs.existsSync(c)) continue;
    const probe = spawnSync(c, ["--version"], { stdio: "ignore" });
    if (!probe.error && probe.status === 0) return c;
  }
  console.error("Python not found. Create the venv (python -m venv .venv) or set the PYTHON env var.");
  process.exit(1);
}

const python = findPython();
const tsx = path.join(analyzerDir, "node_modules", "tsx", "dist", "cli.mjs");
if (!fs.existsSync(tsx)) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(npm, ["install", "--no-audit", "--no-fund"], { cwd: analyzerDir, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error("npm install failed in analyzer/");
    process.exit(r.status || 1);
  }
}

const rel = (p) => path.relative(repoRoot, p) || ".";
run("1/3 backend analyzer", python, [path.join(analyzerDir, "backend_ast.py"), backend, "--repo-root", repoRoot, "-o", path.join(outDir, "backend.json")]);
run("2/3 frontend analyzer", process.execPath, [tsx, path.join(analyzerDir, "frontend_calls.ts"), frontend, "--repo-root", repoRoot, "-o", path.join(outDir, "frontend.json")]);
run(copy ? "3/3 merge graph + copy to extension" : "3/3 merge graph", python, [path.join(analyzerDir, "merge_graph.py"), ...(copy ? [] : ["--copy-to", ""])]);

console.log(
  copy
    ? `\nDone: ${rel(path.join(repoRoot, "extension", "public", "graph.json"))} updated (backend: ${rel(backend)}, frontend: ${rel(frontend)}).`
    : `\nDone: ${rel(path.join(outDir, "graph.json"))} written (backend: ${rel(backend)}, frontend: ${rel(frontend)}). ` +
        "The extension's bundled graph was not changed; load this file from the welcome page.",
);
