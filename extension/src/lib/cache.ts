// Cache keys and the cache shapes used by explain.ts.
export type Source = "on_device" | "cloud";

export interface CachedExplanation {
  text: string;
  source: Source;
  reason: string | null; // why the cloud was used, null for on-device results
  promptVersion: string;
}

export interface RemoteCache {
  get(key: string): Promise<CachedExplanation | undefined>;
  set(key: string, value: CachedExplanation): Promise<void>;
}

/**
 * Cache tier. Best quality results are kept apart from Auto results so a cached
 * on-device answer is never served to someone who asked for cloud quality.
 * Private only has its own tier and never touches the shared cache.
 */
export type CacheTier = "p" | "a" | "q";

export async function cacheKey(parts: {
  snippet: string;
  promptVersion: string;
  tier: CacheTier;
  kind: string;
}): Promise<string> {
  const input = [parts.promptVersion, parts.tier, parts.kind, parts.snippet].join("\u0001");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
