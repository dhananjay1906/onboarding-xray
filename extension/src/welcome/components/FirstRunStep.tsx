import { useEffect, useState } from "react";
import { chainsFor, findComponentBySource, loadActiveGraph, type Graph } from "../../lib/graph";
import { DEMO_URL, LOCAL_DEMO_URL } from "../../lib/links";
import { SELECT_MESSAGE, type SelectMessage } from "../../lib/messages";
import Step from "./Step";

type Outcome =
  | { kind: "success"; component: string; chain: string }
  | { kind: "no-chain"; component: string }
  | { kind: "untraced"; source: string | null };

/** Step 2: open the demo store, Alt+click, and see the trace arrive. */
export default function FirstRunStep() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [success, setSuccess] = useState<Outcome | null>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const inExtension = typeof chrome !== "undefined" && !!chrome.runtime?.onMessage;

  useEffect(() => {
    void loadActiveGraph().then((a) => setGraph(a.graph)).catch(() => setGraph(null));
  }, []);

  // The content script sends every Alt+click here as well as to the side panel.
  useEffect(() => {
    if (!graph || !inExtension) return;
    const listener = (msg: SelectMessage) => {
      if (msg?.type !== SELECT_MESSAGE) return;
      const comp = msg.source ? findComponentBySource(graph, msg.source) : undefined;
      let next: Outcome;
      if (!comp) next = { kind: "untraced", source: msg.source };
      else {
        const chain = chainsFor(graph, comp.id)[0];
        next = chain
          ? { kind: "success", component: comp.name, chain: chain.path.map((id) => graph.nodes[id]?.name ?? id).join(" → ") }
          : { kind: "no-chain", component: comp.name };
      }
      setOutcome(next);
      if (next.kind === "success") setSuccess(next);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [graph, inExtension]);

  async function openPanel() {
    setPanelMessage(null);
    try {
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: win.id! });
    } catch {
      setPanelMessage("Could not open it from here. Click the Onboarding X-Ray icon in the Chrome toolbar instead.");
    }
  }

  const link = "rounded border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50";

  return (
    <Step n={2} title="Try it: your first trace" status={success ? "done" : "todo"}>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Open the demo store in a new tab.</li>
        <li>Add a product to the cart, open the cart, then go to the checkout page.</li>
        <li>
          Hold <kbd className="rounded border border-slate-300 bg-slate-100 px-1">Alt</kbd> and click the <strong>Place order</strong> button (the
          Checkout button).
        </li>
        <li>Watch this page, and open the side panel to see the whole chain.</li>
      </ol>

      <div className="flex flex-wrap gap-2">
        <a href={DEMO_URL} target="_blank" rel="noreferrer" className={link}>
          Open the demo store
        </a>
        <a href={LOCAL_DEMO_URL} target="_blank" rel="noreferrer" className={`${link} border-slate-300 text-slate-700`}>
          Open local demo (localhost:5173)
        </a>
        {inExtension && (
          <button type="button" onClick={() => void openPanel()} className={`${link} border-slate-300 text-slate-700`}>
            Open the side panel
          </button>
        )}
      </div>
      {panelMessage && <p className="text-xs text-amber-700">{panelMessage}</p>}

      {!inExtension && <p className="text-xs text-amber-700">Alt+click detection only works when this page runs inside the installed extension.</p>}

      <div role="status" aria-live="polite" data-testid="trace-status">
        {!success && !outcome && inExtension && (
          <p className="flex items-center gap-2 rounded bg-slate-50 p-3 text-xs text-slate-500">
            <span className="h-3 w-3 animate-pulse rounded-full bg-indigo-400" />
            Waiting for your Alt+click…
          </p>
        )}
        {outcome?.kind === "untraced" && !success && (
          <p className="rounded bg-amber-50 p-3 text-xs text-amber-800">
            That click arrived, but that element is not traced{outcome.source ? ` (${outcome.source} is not in the graph)` : " (it has no data-source tag)"}. Try the Place order
            button on the checkout page.
          </p>
        )}
        {outcome?.kind === "no-chain" && !success && (
          <p className="rounded bg-amber-50 p-3 text-xs text-amber-800">
            You clicked <strong>{outcome.component}</strong>, which makes no backend call. Go to the checkout page and Alt+click <strong>Place order</strong> instead.
          </p>
        )}
        {success?.kind === "success" && (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-900" data-testid="trace-success">
            <p className="font-semibold">It works: you traced {success.component}.</p>
            <p className="mt-1 font-mono text-xs">{success.chain}</p>
            <p className="mt-2 text-xs">Open the side panel to see the diagram, the code of each step and its explanation.</p>
          </div>
        )}
      </div>
    </Step>
  );
}
