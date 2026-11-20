// Privacy modes shown in the side panel, and how they map to Firebase AI Logic inference modes.
export type PrivacyMode = "private" | "auto" | "quality";

/** Values of the SDK's InferenceMode enum (kept as literals so this file does not import the SDK). */
export type SdkMode = "only_on_device" | "prefer_on_device" | "prefer_in_cloud" | "only_in_cloud";

export const MODES: { id: PrivacyMode; label: string; hint: string; sdk: SdkMode }[] = [
  { id: "private", label: "Private only", hint: "On-device model only. Nothing is sent to the cloud.", sdk: "only_on_device" },
  { id: "auto", label: "Auto", hint: "On-device when available, cloud otherwise.", sdk: "prefer_on_device" },
  { id: "quality", label: "Best quality", hint: "Cloud model, on-device as a fallback.", sdk: "prefer_in_cloud" },
];

export const isPrivacyMode = (v: unknown): v is PrivacyMode => v === "private" || v === "auto" || v === "quality";

const STORAGE_KEY = "xray.privacyMode";

export function readStoredMode(): PrivacyMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isPrivacyMode(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeMode(mode: PrivacyMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* storage unavailable: the choice just will not persist */
  }
}
