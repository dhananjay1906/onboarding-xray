import { MODES, type PrivacyMode } from "../../lib/modes";
import type { OnDeviceState } from "../../lib/onDevice";

interface Props {
  mode: PrivacyMode;
  onModeChange: (mode: PrivacyMode) => void;
  state: OnDeviceState;
  checked: boolean;
  progress: number | null;
  error: string | null;
  onDownload: () => void;
}

/** Status pill (On-device ready / Downloading N% / Cloud only) and the privacy toggle. */
export default function StatusBar({ mode, onModeChange, state, checked, progress, error, onDownload }: Props) {
  const downloading = progress !== null || state === "downloading";
  const pct = progress !== null ? Math.round(progress * 100) : null;

  let pill = { text: "Checking…", cls: "bg-slate-100 text-slate-600" };
  if (checked) {
    if (state === "available" && !downloading) pill = { text: "On-device ready", cls: "bg-emerald-100 text-emerald-800" };
    else if (downloading) pill = { text: pct !== null ? `Downloading ${pct}%` : "Downloading…", cls: "bg-amber-100 text-amber-800" };
    else pill = { text: "Cloud only", cls: "bg-sky-100 text-sky-800" };
  }

  return (
    <div className="flex flex-col gap-2 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <span role="status" data-testid="status-pill" className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pill.cls}`}>
          {pill.text}
        </span>
        {checked && state === "downloadable" && !downloading && (
          <button type="button" onClick={onDownload} className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700">
            Download on-device model
          </button>
        )}
        {checked && state === "unavailable" && (
          <span className="text-[11px] text-slate-500">This Chrome or device cannot run the on-device model.</span>
        )}
      </div>

      <div role="radiogroup" aria-label="Privacy mode" className="inline-flex overflow-hidden rounded border border-slate-300 text-xs">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            title={m.hint}
            onClick={() => onModeChange(m.id)}
            className={`flex-1 px-2 py-1 ${mode === m.id ? "bg-indigo-600 font-semibold text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">{MODES.find((m) => m.id === mode)?.hint}</p>
      {error && <p role="alert" className="text-[11px] text-red-700">{error}</p>}
    </div>
  );
}
