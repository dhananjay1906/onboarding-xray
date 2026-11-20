import { chromeMajor, MIN_CHROME } from "../../lib/chromeVersion";
import { useOnDevice } from "../../lib/useOnDevice";
import Step, { CopyBlock, type StepStatus } from "./Step";

const Check = ({ ok, children }: { ok: boolean | null; children: React.ReactNode }) => (
  <li className="flex items-start gap-2">
    <span aria-hidden="true" className={ok === null ? "text-slate-400" : ok ? "text-emerald-600" : "text-amber-600"}>
      {ok === null ? "…" : ok ? "✓" : "!"}
    </span>
    <span>{children}</span>
  </li>
);

/** Step 1: Chrome version, on-device model status, download button with progress. */
export default function SetupStep() {
  const major = chromeMajor();
  const { state, checked, progress, error, download } = useOnDevice();
  const versionOk = major === null ? null : major >= MIN_CHROME;
  const downloading = progress !== null || state === "downloading";
  const pct = progress !== null ? Math.round(progress * 100) : null;
  const ready = checked && state === "available";
  const status: StepStatus = ready ? "done" : "optional";

  return (
    <Step n={1} title="Check your setup" status={status}>
      <ul className="flex flex-col gap-2" data-testid="setup-checks">
        <Check ok={versionOk}>
          {major === null ? "Could not detect your Chrome version." : `Chrome ${major}.`}{" "}
          {versionOk === false && `The on-device model needs Chrome ${MIN_CHROME} or newer. Update at chrome://settings/help.`}
          {versionOk && `Good: the on-device model needs Chrome ${MIN_CHROME}+.`}
        </Check>
        <Check ok={!checked ? null : ready}>
          {!checked && "Checking the on-device model…"}
          {checked && state === "available" && "On-device model is ready. Explanations can run privately on this computer."}
          {checked && state === "downloadable" && "On-device model is not downloaded yet (a few GB)."}
          {checked && state === "downloading" && !downloading && "On-device model is downloading…"}
          {checked && state === "unavailable" && "On-device model is not available in this Chrome or on this device."}
        </Check>
      </ul>

      {checked && state === "downloadable" && !downloading && (
        <div>
          <button type="button" onClick={() => void download()} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            Download on-device model
          </button>
          <p className="mt-1 text-xs text-slate-500">It is a few GB, so use a good connection. You can keep this page open.</p>
        </div>
      )}

      {downloading && (
        <div role="status" aria-live="polite" data-testid="download-progress">
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span>Downloading the on-device model…</span>
            <span>{pct !== null ? `${pct}%` : ""}</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-200">
            <div className={`h-full bg-emerald-500 transition-all ${pct === null ? "w-1/3 animate-pulse" : ""}`} style={pct === null ? undefined : { width: `${pct}%` }} />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}

      {checked && state === "unavailable" && (
        <div className="rounded bg-slate-50 p-3 text-xs text-slate-600">
          <p>If your Chrome is 139+, try enabling this flag, restart Chrome, then reopen this page:</p>
          <div className="mt-2">
            <CopyBlock text="chrome://flags/#prompt-api-for-gemini-nano-multimodal-input" />
          </div>
          <p className="mt-2">
            Details about your device: <code>chrome://on-device-internals</code>.
          </p>
        </div>
      )}

      <p className="rounded bg-sky-50 p-3 text-xs text-sky-900" data-testid="cloud-note">
        <strong>Cloud mode works meanwhile.</strong> Without the on-device model, explanations are generated in the cloud (the panel shows a blue
        “Cloud” badge). Pick <strong>Private only</strong> in the side panel if you want nothing to leave your computer; that mode needs the on-device
        model.
      </p>
    </Step>
  );
}
