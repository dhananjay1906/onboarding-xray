// "Enable on this site": lets the content script run on the user's own app (their origin only).
// Uses optional host permissions plus dynamically registered content scripts; no site is enabled by default
// except the demo origins listed in manifest.json.
const PREFIX = "xray-site-";

export type ParsedSite = { ok: true; origin: string; pattern: string } | { ok: false; error: string };

/** "localhost:3000" or "https://app.example.com/some/page" -> the origin and its match pattern. */
export function parseSiteOrigin(input: string): ParsedSite {
  let text = input.trim();
  if (!text) return { ok: false, error: "Enter the address of your app, for example http://localhost:3000" };
  if (/[*<>\s]/.test(text)) return { ok: false, error: "Enter one exact address, without wildcards or spaces." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    text = `${/^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(text) ? "http" : "https"}://${text}`;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "That does not look like a web address." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "Only http and https sites can be enabled." };
  if (!url.hostname) return { ok: false, error: "That address has no host name." };
  return { ok: true, origin: url.origin, pattern: `${url.origin}/*` };
}

export const idFor = (pattern: string) => PREFIX + pattern.replace(/[^a-z0-9]/gi, "-");

/** True when running inside the extension (not a plain web page). */
export const extensionApisAvailable = (): boolean =>
  typeof chrome !== "undefined" && !!chrome.scripting?.registerContentScripts && !!chrome.permissions?.request;

/** Origins that always run the content script (from the manifest). */
export function builtInSites(): string[] {
  if (typeof chrome === "undefined" || !chrome.runtime?.getManifest) return [];
  return (chrome.runtime.getManifest().content_scripts ?? []).flatMap((c) => c.matches ?? []);
}

export async function listEnabledSites(): Promise<string[]> {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  return scripts.filter((s) => s.id.startsWith(PREFIX)).flatMap((s) => s.matches ?? []);
}

/** Asks for permission on one origin (must be called from a click) and registers the content script there. */
export async function enableSite(pattern: string): Promise<void> {
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) throw new Error("Permission was not granted, so nothing was enabled.");
  const script = { id: idFor(pattern), matches: [pattern], js: ["content.js"], runAt: "document_idle" as const, persistAcrossSessions: true };
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [script.id] });
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}

export async function disableSite(pattern: string): Promise<void> {
  await chrome.scripting.unregisterContentScripts({ ids: [idFor(pattern)] }).catch(() => {});
  await chrome.permissions.remove({ origins: [pattern] }).catch(() => {});
}
