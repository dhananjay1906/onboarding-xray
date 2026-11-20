import type { Source } from "../../lib/cache";

/** Green chip for on-device answers, blue chip (with the reason) for cloud answers. */
export default function SourceBadge({ source, reason, cached }: { source: Source; reason: string | null; cached: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      {source === "on_device" ? (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800" data-testid="badge">
          On-device · private
        </span>
      ) : (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800" data-testid="badge">
          Cloud{reason ? ` · ${reason}` : ""}
        </span>
      )}
      {cached && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">cached</span>}
    </span>
  );
}
