import { useEffect, useMemo, useState } from "react";
import { SELECT_MESSAGE, type SelectMessage } from "../lib/messages";
import {
  chainsFor,
  findComponentBySource,
  listComponents,
  loadGraph,
  type Graph,
} from "../lib/graph";

export default function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [lastClick, setLastClick] = useState<SelectMessage | null>(null);

  useEffect(() => {
    loadGraph().then(setGraph).catch((e: Error) => setError(e.message));
  }, []);

  // Alt+click from the content script selects the matching component.
  useEffect(() => {
    if (!graph || typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    const listener = (msg: SelectMessage) => {
      if (msg?.type !== SELECT_MESSAGE) return;
      setLastClick(msg);
      const match = msg.source ? findComponentBySource(graph, msg.source) : undefined;
      if (match) setSelectedId(match.id);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [graph]);

  const components = useMemo(() => (graph ? listComponents(graph) : []), [graph]);
  const selected = graph && selectedId ? graph.components[selectedId] : undefined;
  const chains = graph && selected ? chainsFor(graph, selected.id) : [];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-lg font-semibold">Onboarding X-Ray</h1>
        <p className="text-sm text-slate-500">Alt+click an element in the demo app, or pick a component.</p>
      </header>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">Could not load graph: {error}</p>}
      {!graph && !error && <p className="text-sm text-slate-500">Loading graph…</p>}

      {graph && (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Component ({components.length})
            <select
              className="rounded border border-slate-300 bg-white p-2 text-sm font-normal"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select a component…</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.source_file}
                </option>
              ))}
            </select>
          </label>

          {!selected && <p className="text-sm text-slate-500">No component selected.</p>}

          {selected && (
            <section className="rounded border border-slate-200 bg-white p-3 text-sm">
              <h2 className="font-semibold">{selected.name}</h2>
              <p className="font-mono text-xs text-slate-500">
                {selected.file}:{selected.line}-{selected.end_line}
              </p>
              {chains.length === 0 ? (
                <p className="mt-2 text-slate-500">This component makes no backend calls.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {chains.map((chain) => (
                    <li key={chain.id} className="rounded bg-slate-50 p-2">
                      {chain.path.map((id) => graph.nodes[id]?.name ?? id).join(" → ")}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {lastClick && (
            <p className="text-xs text-slate-500">
              Last Alt+click:{" "}
              {lastClick.source ? (
                <code>{lastClick.source}</code>
              ) : (
                "element not traced (no data-source)"
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
