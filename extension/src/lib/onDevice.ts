// Chrome's built-in model (Gemini Nano) via the Prompt API: availability and download.
export type OnDeviceState = "available" | "downloadable" | "downloading" | "unavailable";

/** English text in and out. Chrome warns, and may refuse, when the languages are not declared. */
export const LANGUAGE_OPTIONS = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

interface LanguageModelApi {
  availability(options?: object): Promise<string>;
  create(options?: object): Promise<{ destroy(): void }>;
}

const api = (): LanguageModelApi | undefined => (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel;

export async function checkOnDevice(): Promise<OnDeviceState> {
  const lm = api();
  if (!lm) return "unavailable"; // Chrome too old, or the feature is off for this device
  try {
    const s = await lm.availability(LANGUAGE_OPTIONS);
    return s === "available" || s === "downloadable" || s === "downloading" ? s : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Downloads the model. Must be called from a click handler: Chrome requires a user gesture. */
export async function downloadOnDeviceModel(onProgress: (fraction: number) => void): Promise<void> {
  const lm = api();
  if (!lm) throw new Error("This Chrome does not support the on-device model.");
  const session = await lm.create({
    ...LANGUAGE_OPTIONS,
    monitor(m: EventTarget) {
      m.addEventListener("downloadprogress", (e) => onProgress((e as Event & { loaded: number }).loaded));
    },
  });
  session.destroy(); // the model stays downloaded; we only needed it to start the download
}
