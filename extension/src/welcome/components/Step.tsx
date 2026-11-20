import { useState, type ReactNode } from "react";

export type StepStatus = "todo" | "done" | "optional";

const BADGE: Record<StepStatus, { text: string; cls: string }> = {
  todo: { text: "To do", cls: "bg-slate-100 text-slate-600" },
  done: { text: "Done", cls: "bg-emerald-100 text-emerald-800" },
  optional: { text: "Optional", cls: "bg-slate-100 text-slate-500" },
};

export default function Step({ n, title, status, children }: { n: number; title: string; status: StepStatus; children: ReactNode }) {
  const badge = BADGE[status];
  return (
    <section aria-label={`Step ${n}: ${title}`} className="rounded-lg border border-slate-200 bg-white p-5">
      <header className="mb-3 flex items-center gap-3">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${status === "done" ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white"}`}>
          {status === "done" ? "✓" : n}
        </span>
        <h2 className="flex-1 text-lg font-semibold">{title}</h2>
        <span data-testid={`step-${n}-status`} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
          {badge.text}
        </span>
      </header>
      <div className="flex flex-col gap-3 text-sm text-slate-700">{children}</div>
    </section>
  );
}

/** A command or path with a Copy button. */
export function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text is selectable */
    }
  }
  return (
    <div className="flex items-start gap-2 rounded bg-slate-900 p-2 text-slate-100">
      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5">{text}</code>
      <button type="button" onClick={() => void copy()} className="rounded bg-slate-700 px-2 py-0.5 text-xs hover:bg-slate-600">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
