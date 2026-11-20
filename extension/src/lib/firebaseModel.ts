// Firebase AI Logic hybrid inference: the real `generate` used by explain.ts.
import { getAI, getGenerativeModel, GoogleAIBackend, type GenerativeModel } from "firebase/ai";
import type { Source } from "./cache";
import { getFirebase } from "./firebase";
import type { ModelCall } from "./explain";
import { LANGUAGE_OPTIONS } from "./onDevice";

const models = new Map<string, GenerativeModel>();

function modelFor(mode: ModelCall["mode"], cloudModel: string): GenerativeModel {
  const key = `${mode}|${cloudModel}`;
  let model = models.get(key);
  if (!model) {
    const ai = getAI(getFirebase().app, { backend: new GoogleAIBackend() });
    model = getGenerativeModel(ai, {
      mode,
      onDeviceParams: { createOptions: LANGUAGE_OPTIONS },
      inCloudParams: { model: cloudModel, generationConfig: { temperature: 0.2, maxOutputTokens: 400 } },
    });
    models.set(key, model);
  }
  return model;
}

/** Runs one prompt and reports which source answered (read from the SDK's inferenceSource). */
export async function generate(call: ModelCall): Promise<{ text: string; source: Source }> {
  try {
    const result = await modelFor(call.mode, call.cloudModel).generateContent(call.prompt);
    const source: Source =
      result.response.inferenceSource === "on_device" || (call.mode === "only_on_device" && !result.response.inferenceSource)
        ? "on_device"
        : "cloud";
    return { text: result.response.text(), source };
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    if (/app ?check/i.test(message)) {
      if (import.meta.env.MODE === "submission") {
        throw new Error(
          "The cloud service rejected this build's access token (it may have expired or been revoked). " +
            "Private only mode still works if your Chrome has the on-device model.",
        );
      }
      throw new Error(
        "Firebase rejected the request because the App Check token is not valid. In development, copy the " +
          '"Firebase App Check debug token" from this panel\'s console and add it in the Firebase console: ' +
          "App Check, Apps, xray-extension, Manage debug tokens.",
      );
    }
    if (/not found|404/i.test(message)) {
      throw new Error(`Model "${call.cloudModel}" was not found. Set a valid cloud_model in Remote Config. (${message})`);
    }
    throw e;
  }
}
