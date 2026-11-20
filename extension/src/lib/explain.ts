// Hybrid explanations: chooses on-device or cloud, checks the caches, and reports which source answered.
// The model, the caches and the settings are injected, so this file has no Firebase imports and is unit-tested.
import { cacheKey, type CacheTier, type CachedExplanation, type RemoteCache, type Source } from "./cache";
import { MODES, type PrivacyMode, type SdkMode } from "./modes";
import type { OnDeviceState } from "./onDevice";
import type { Settings } from "./settingsCore";

export type CloudReason =
  | "model not downloaded"
  | "on-device unavailable"
  | "too long for on-device"
  | "Best quality mode"
  | "on-device failed";

export interface ExplainRequest {
  kind: "step" | "flow";
  /** Code (a step's snippet, or the combined snippets of the whole flow). */
  code: string;
  /** Plain-English role of this step in the chain, e.g. "Step 5 of 8: Function (place_order)". */
  role: string;
  /** Layer of the step, used in the cache key. */
  layer: string;
}

export interface ExplainResult {
  text: string;
  source: Source;
  reason: CloudReason | null;
  cached: boolean;
}

export type ExplainErrorCode = "NO_ON_DEVICE_MODEL" | "TOO_LONG_FOR_PRIVATE" | "EMPTY" | "FAILED";

export class ExplainError extends Error {
  constructor(
    public code: ExplainErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ModelCall {
  mode: SdkMode;
  prompt: string;
  cloudModel: string;
}

export interface ExplainDeps {
  settings: () => Settings;
  onDeviceState: () => Promise<OnDeviceState>;
  generate: (call: ModelCall) => Promise<{ text: string; source: Source }>;
  memory: Map<string, CachedExplanation>;
  /** Shared cache (Firestore). Never used in Private only mode. */
  remote?: RemoteCache;
  /** Return false to keep this graph's explanations out of the shared cache (e.g. the user's private code). */
  canShare?: () => boolean;
}

const RULES =
  "Explain only the code provided below. Do not invent files, functions, tables or behavior that are not shown. " +
  "Answer in plain English with no markdown.";

export function buildPrompt(req: ExplainRequest): string {
  if (req.kind === "flow") {
    return [
      "You are helping a developer who is new to this codebase understand how one user action flows through the code.",
      RULES,
      "Summarize the whole flow in 4 to 6 sentences, following the steps in order.",
      req.role,
      "Steps and code:",
      req.code,
    ].join("\n\n");
  }
  return [
    "You are explaining one step of a code path to a developer who is new to this codebase.",
    RULES,
    'Answer in 1 to 2 sentences about what this code does, then one sentence starting with "Why it exists:" about why this step is needed in the flow.',
    `This step: ${req.role}`,
    "Code:",
    req.code,
  ].join("\n\n");
}

const tierOf = (mode: PrivacyMode): CacheTier => (mode === "private" ? "p" : mode === "auto" ? "a" : "q");

function cloudReason(mode: PrivacyMode, tooLong: boolean, state: OnDeviceState): CloudReason {
  if (mode === "quality") return "Best quality mode";
  if (tooLong) return "too long for on-device";
  if (state === "available") return "on-device failed";
  return state === "unavailable" ? "on-device unavailable" : "model not downloaded";
}

export function createExplainer(deps: ExplainDeps) {
  async function explain(req: ExplainRequest, mode: PrivacyMode): Promise<ExplainResult> {
    const settings = deps.settings();
    const prompt = buildPrompt(req);
    const tier = tierOf(mode);
    const key = await cacheKey({ snippet: req.code, promptVersion: settings.promptVersion, tier, kind: `${req.kind}:${req.layer}` });

    const fromCache = (c: CachedExplanation): ExplainResult => ({
      text: c.text,
      source: c.source,
      reason: (c.reason as CloudReason | null) ?? null,
      cached: true,
    });

    const hit = deps.memory.get(key);
    if (hit) return fromCache(hit);
    const useShared = mode !== "private" && !!deps.remote && (deps.canShare?.() ?? true);
    if (useShared && deps.remote) {
      const shared = await deps.remote.get(key).catch(() => undefined); // a cache problem never blocks an explanation
      if (shared && shared.promptVersion === settings.promptVersion) {
        deps.memory.set(key, shared);
        return fromCache(shared);
      }
    }

    const state = await deps.onDeviceState();
    const tooLong = prompt.length > settings.onDeviceMaxChars;

    let sdkMode: SdkMode;
    if (mode === "private") {
      if (tooLong) {
        throw new ExplainError(
          "TOO_LONG_FOR_PRIVATE",
          "This is too long for the on-device model, and Private only never uses the cloud. Switch to Auto to use the cloud for this request.",
        );
      }
      if (state !== "available") {
        throw new ExplainError(
          "NO_ON_DEVICE_MODEL",
          state === "unavailable"
            ? "This Chrome or device cannot run the on-device model, so Private only cannot answer. Switch to Auto to use the cloud."
            : "The on-device model is not ready yet. Download it, or switch to Auto to use the cloud meanwhile.",
        );
      }
      sdkMode = MODES[0].sdk; // only_on_device
    } else if (mode === "auto") {
      // Use the on-device model only when it is ready and the prompt fits; otherwise go straight to the cloud.
      sdkMode = state === "available" && !tooLong ? MODES[1].sdk : "only_in_cloud";
    } else {
      sdkMode = tooLong ? "only_in_cloud" : MODES[2].sdk; // prefer_in_cloud
    }

    let out: { text: string; source: Source };
    try {
      out = await deps.generate({ mode: sdkMode, prompt, cloudModel: settings.cloudModel });
    } catch (e) {
      throw new ExplainError("FAILED", (e as Error).message || "The model request failed.");
    }
    const text = out.text.trim();
    if (!text) throw new ExplainError("EMPTY", "The model returned an empty answer. Try again.");

    const reason = out.source === "cloud" ? cloudReason(mode, tooLong, state) : null;
    const entry: CachedExplanation = { text, source: out.source, reason, promptVersion: settings.promptVersion };
    deps.memory.set(key, entry);
    if (useShared && deps.remote) {
      void deps.remote.set(key, entry).catch(() => {}); // best effort
    }
    return { text, source: out.source, reason, cached: false };
  }

  return { explain };
}
