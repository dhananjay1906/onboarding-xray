// Remote Config settings: shape, defaults and validation (no Firebase imports, so it is easy to test).
import { isPrivacyMode, type PrivacyMode } from "./modes";

export interface Settings {
  /** Prompts longer than this skip the on-device model. */
  onDeviceMaxChars: number;
  /** Part of the cache key: bump it to invalidate cached explanations. */
  promptVersion: string;
  /** Mode used until the user picks one. */
  defaultMode: PrivacyMode;
  /** Cloud model id for Firebase AI Logic (Gemini Developer API). */
  cloudModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  onDeviceMaxChars: 4000,
  promptVersion: "v1",
  defaultMode: "auto",
  cloudModel: "gemini-3.5-flash-lite",
};

export const REMOTE_KEYS = {
  onDeviceMaxChars: "on_device_max_chars",
  promptVersion: "prompt_version",
  defaultMode: "default_mode",
  cloudModel: "cloud_model",
} as const;

/** Turns raw Remote Config strings into Settings, ignoring invalid values. */
export function parseSettings(read: (key: string) => string | undefined): Settings {
  const max = Number(read(REMOTE_KEYS.onDeviceMaxChars));
  const version = read(REMOTE_KEYS.promptVersion)?.trim();
  const mode = read(REMOTE_KEYS.defaultMode)?.trim();
  const model = read(REMOTE_KEYS.cloudModel)?.trim();
  return {
    onDeviceMaxChars: Number.isFinite(max) && max >= 200 ? Math.floor(max) : DEFAULT_SETTINGS.onDeviceMaxChars,
    promptVersion: version && version.length <= 32 ? version : DEFAULT_SETTINGS.promptVersion,
    defaultMode: isPrivacyMode(mode) ? mode : DEFAULT_SETTINGS.defaultMode,
    cloudModel: model && /^[a-z0-9.-]+$/i.test(model) ? model : DEFAULT_SETTINGS.cloudModel,
  };
}
