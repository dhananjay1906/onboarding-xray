// Packs dist/ into a Web Store-ready zip (manifest.json at the zip root).
// Usage (from extension/): node scripts/make-zip.mjs   -> release/onboarding-xray-submission-v<version>.zip
import { zipSync } from "fflate";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(process.cwd(), "dist");
const manifestPath = path.join(dist, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("dist/manifest.json not found. Run the build first.");
  process.exit(1);
}
const { version } = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

const entries = {};
for (const file of walk(dist).sort()) {
  if (file.endsWith(".map")) continue;
  const name = path.relative(dist, file).split(path.sep).join("/");
  // Fixed timestamp: the same input always gives the same zip.
  entries[name] = [fs.readFileSync(file), { level: 9, mtime: new Date("2026-01-01T00:00:00Z") }];
}

const outDir = path.resolve(process.cwd(), "release");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `onboarding-xray-submission-v${version}.zip`);
const zip = zipSync(entries);
fs.writeFileSync(out, zip);

const sha = createHash("sha256").update(zip).digest("hex");
console.log(`zip: ${path.relative(process.cwd(), out)} (${Object.keys(entries).length} files, ${(zip.length / 1024).toFixed(0)} KB)`);
console.log(`sha256: ${sha}`);
console.log("This zip contains the judges debug token. Do not commit or share it publicly; revoke the token after judging.");
