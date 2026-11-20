import { useCallback, useMemo, useState } from "react";
import type { CachedExplanation } from "../lib/cache";
import { createExplainer, ExplainError, type ExplainErrorCode, type ExplainRequest, type ExplainResult } from "../lib/explain";
import { generate } from "../lib/firebaseModel";
import { firestoreCache } from "../lib/cacheFirestore";
import type { PrivacyMode } from "../lib/modes";
import { checkOnDevice } from "../lib/onDevice";
import { getSettings } from "../lib/settings";

export type ExplanationState =
  | { status: "loading" }
  | { status: "done"; result: ExplainResult }
  | { status: "error"; message: string; code: ExplainErrorCode | "UNKNOWN" };

// One explainer for the whole panel. Only the bundled demo graph is ever shown, and its code is public,
// so the shared Firestore cache is allowed here. Private only mode skips it entirely (see explain.ts).
const memory = new Map<string, CachedExplanation>();
const explainer = createExplainer({
  settings: getSettings,
  onDeviceState: checkOnDevice,
  generate,
  memory,
  remote: firestoreCache,
});

/** Explanation state per key ("step:<nodeId>" or "flow:<chainId>"). Requests only start from a click. */
export function useExplanations(mode: PrivacyMode) {
  const [states, setStates] = useState<Record<string, ExplanationState>>({});

  const run = useCallback(
    async (key: string, req: ExplainRequest) => {
      setStates((s) => ({ ...s, [key]: { status: "loading" } }));
      try {
        const result = await explainer.explain(req, mode);
        setStates((s) => ({ ...s, [key]: { status: "done", result } }));
      } catch (e) {
        const code = e instanceof ExplainError ? e.code : "UNKNOWN";
        setStates((s) => ({ ...s, [key]: { status: "error", message: (e as Error).message, code } }));
      }
    },
    [mode],
  );

  return useMemo(() => ({ states, run }), [states, run]);
}
