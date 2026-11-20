import type { OnDeviceState } from "../../lib/onDevice";
import type { ExplanationState } from "../useExplanations";
import SourceBadge from "./SourceBadge";

interface Props {
  state: ExplanationState | undefined;
  onExplain: () => void;
  /** Error recovery for Private only mode. */
  onDeviceState: OnDeviceState;
  onDownload: () => void;
  downloading: boolean;
  onSwitchToAuto: () => void;
  label?: string;
}

/** The Explanation area under each step: a button, a spinner, the answer with its badge, or a clear error. */
export default function ExplanationBox({ state, onExplain, onDeviceState, onDownload, downloading, onSwitchToAuto, label = "Explain this step" }: Props) {
  const button = "rounded px-2 py-1 text-xs font-medium";

  return (
    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-2 text-sm">
      <div className="mb-1 text-xs font-semibold text-slate-600">Explanation</div>

      {!state && (
        <button type="button" onClick={onExplain} className={`${button} bg-indigo-600 text-white hover:bg-indigo-700`}>
          {label}
        </button>
      )}

      {state?.status === "loading" && (
        <p role="status" className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
          Thinking…
        </p>
      )}

      {state?.status === "done" && (
        <div className="flex flex-col gap-2">
          <p className="whitespace-pre-wrap text-slate-800">{state.result.text}</p>
          <SourceBadge source={state.result.source} reason={state.result.reason} cached={state.result.cached} />
        </div>
      )}

      {state?.status === "error" && (
        <div role="alert" className="flex flex-col gap-2 text-xs text-red-700">
          <p>{state.message}</p>
          <div className="flex flex-wrap gap-2">
            {state.code === "NO_ON_DEVICE_MODEL" && onDeviceState === "downloadable" && (
              <button type="button" onClick={onDownload} disabled={downloading} className={`${button} bg-emerald-600 text-white disabled:opacity-50`}>
                Download on-device model
              </button>
            )}
            {(state.code === "NO_ON_DEVICE_MODEL" || state.code === "TOO_LONG_FOR_PRIVATE") && (
              <button type="button" onClick={onSwitchToAuto} className={`${button} bg-slate-700 text-white`}>
                Switch to Auto
              </button>
            )}
            <button type="button" onClick={onExplain} className={`${button} bg-white text-slate-700 ring-1 ring-slate-300`}>
              Try again
            </button>
          </div>
        </div>
      )}

      {state?.status === "done" && (
        <button type="button" onClick={onExplain} className="mt-2 text-xs text-slate-500 underline">
          Explain again
        </button>
      )}
    </div>
  );
}
