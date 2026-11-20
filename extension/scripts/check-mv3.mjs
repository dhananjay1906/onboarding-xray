// Checks that dist/ is Manifest V3 clean and, with --submission, that it is a correct submission build.
// Usage (from extension/): node scripts/check-mv3.mjs [--submission]
// Exits 1 with a list of problems; prints no secret values.
import fs from "node:fs";
import path from "node:path";
import { parseAst } from "rollup/parseAst";

const submission = process.argv.includes("--submission");
const dist = path.resolve(process.cwd(), "dist");
const problems = [];
const fail = (msg) => problems.push(msg);

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

if (!fs.existsSync(path.join(dist, "manifest.json"))) {
  console.error("dist/manifest.json not found. Build first.");
  process.exit(1);
}

// --- manifest
const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) fail("manifest_version is not 3");

const csp = manifest.content_security_policy;
if (csp) {
  const policy = typeof csp === "string" ? csp : (csp.extension_pages ?? "");
  if (/unsafe-eval|unsafe-inline|wasm-unsafe-eval|https?:\/\//.test(policy)) fail(`content_security_policy loosens the default: ${policy}`);
}
if (manifest.host_permissions?.some((h) => h === "<all_urls>" || h === "*://*/*")) fail("host_permissions requests all sites");

const referenced = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...(manifest.content_scripts ?? []).flatMap((c) => [...(c.js ?? []), ...(c.css ?? [])]),
].filter(Boolean);
for (const file of referenced) if (!fs.existsSync(path.join(dist, file))) fail(`manifest references a missing file: ${file}`);

// --- code
const files = walk(dist);
const js = files.filter((f) => f.endsWith(".js"));
const html = files.filter((f) => f.endsWith(".html"));
const rel = (f) => path.relative(dist, f).split(path.sep).join("/");

for (const f of html) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!src) fail(`${rel(f)}: inline <script> (blocked by the MV3 content security policy)`);
    else if (/^(https?:)?\/\//i.test(src)) fail(`${rel(f)}: remote script ${src}`);
  }
}

// Text patterns for remote code. (Plain "recaptcha" is not one: Firebase Auth has error-code strings with that
// word. What matters is the App Check reCAPTCHA providers and any reCAPTCHA / Google script URL.)
const forbiddenText = [
  [/https?:\/\/[^"'`\s)]+\.js(\?[^"'`\s)]*)?["'`]/i, "remote .js URL"],
  [/ReCaptcha(Enterprise|V3)Provider|grecaptcha|recaptcha\/(api|enterprise)\.js/i, "reCAPTCHA provider or script"],
  [/googletagmanager|gtag\/js/i, "Google Tag Manager reference"],
  [/apis\.google\.com\/js/i, "Google API loader (gapi) URL"],
];

// Code patterns, found by parsing (a regex would flag harmless methods that happen to be named `eval`).
const isIdent = (n, name) => n?.type === "Identifier" && n.name === name;
function findDynamicCode(node, parent, hits) {
  if (!node || typeof node.type !== "string") return;
  if (node.type === "Identifier" && node.name === "eval") {
    const isPropName =
      (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) ||
      (parent?.type === "MethodDefinition" && parent.key === node && !parent.computed) ||
      (parent?.type === "Property" && parent.key === node && !parent.computed && !parent.shorthand) ||
      (parent?.type === "PropertyDefinition" && parent.key === node && !parent.computed);
    if (!isPropName) hits.add("eval");
  }
  if ((node.type === "NewExpression" || node.type === "CallExpression") && isIdent(node.callee, "Function")) hits.add("Function constructor");
  if (node.type === "CallExpression") {
    if (isIdent(node.callee, "importScripts")) hits.add("importScripts");
    const c = node.callee;
    if (c.type === "MemberExpression" && !c.computed && isIdent(c.property, "createElement") && node.arguments[0]?.value === "script") {
      hits.add('createElement("script")');
    }
    if ((isIdent(c, "setTimeout") || isIdent(c, "setInterval")) && typeof node.arguments[0]?.value === "string") hits.add("string passed to setTimeout/setInterval");
  }
  if (node.type === "ImportExpression" && typeof node.source?.value === "string" && /^https?:/.test(node.source.value)) hits.add("dynamic import of a remote URL");
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) for (const item of v) findDynamicCode(item, node, hits);
    else if (v && typeof v === "object") findDynamicCode(v, node, hits);
  }
}

for (const f of js) {
  const text = fs.readFileSync(f, "utf8");
  for (const [re, label] of forbiddenText) if (re.test(text)) fail(`${rel(f)}: ${label}`);
  const hits = new Set();
  findDynamicCode(parseAst(text), null, hits);
  for (const label of hits) fail(`${rel(f)}: ${label}`);
}

// --- submission build
if (submission) {
  const rootEnv = (() => {
    const out = {};
    const file = path.resolve(process.cwd(), "..", ".env");
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
      }
    }
    return out;
  })();
  const token = (process.env.XRAY_APPCHECK_DEBUG_TOKEN ?? rootEnv.XRAY_APPCHECK_DEBUG_TOKEN ?? "").trim();
  const blob = js.map((f) => fs.readFileSync(f, "utf8")).join("\n");

  if (!token) fail("XRAY_APPCHECK_DEBUG_TOKEN is not set, so the injected token cannot be verified");
  else if (!blob.includes(token)) fail("the judges debug token is not in the bundle: this is not a submission build");

  // Values that must not ship in a submission build (read from .env, never printed).
  for (const key of ["VITE_RECAPTCHA_ENTERPRISE_SITE_KEY", "VITE_APPCHECK_DEBUG_TOKEN"]) {
    const value = rootEnv[key] ?? process.env[key];
    if (value && value !== token && blob.includes(value)) fail(`${key} value is in the bundle`);
  }
  if (token && token.length >= 16) {
    const copies = files.filter((f) => !f.endsWith(".js") && fs.readFileSync(f).includes(token));
    if (copies.length) fail(`the debug token appears outside the JS bundle: ${copies.map(rel).join(", ")}`);
  }
}

if (problems.length) {
  console.error(`MV3 check failed (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `MV3 check passed: manifest v3, ${js.length} scripts, ${html.length} pages, no remote or dynamic code` +
    (submission ? ", debug token injected, no reCAPTCHA." : "."),
);
