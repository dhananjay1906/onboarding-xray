// Shared explanation cache in Firestore (collection "explanations", document id = cache key).
// Rules (firestore.rules): signed-in users may read one document and create new ones; no updates or deletes.
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { CachedExplanation, RemoteCache } from "./cache";
import { ensureSignedIn, getDb } from "./firebase";

const COLLECTION = "explanations";

export const firestoreCache: RemoteCache = {
  async get(key) {
    await ensureSignedIn();
    const snap = await getDoc(doc(getDb(), COLLECTION, key));
    if (!snap.exists()) return undefined;
    const d = snap.data();
    if (typeof d.text !== "string" || (d.source !== "on_device" && d.source !== "cloud")) return undefined;
    return {
      text: d.text,
      source: d.source,
      reason: typeof d.reason === "string" ? d.reason : null,
      promptVersion: String(d.promptVersion ?? ""),
    } satisfies CachedExplanation;
  },

  async set(key, value) {
    await ensureSignedIn();
    await setDoc(doc(getDb(), COLLECTION, key), {
      text: value.text,
      source: value.source,
      reason: value.reason,
      promptVersion: value.promptVersion,
      createdAt: serverTimestamp(),
    });
  },
};
