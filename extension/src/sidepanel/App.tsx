import { useCallback, useEffect, useMemo, useState } from "react";
import { SELECT_MESSAGE, type SelectMessage } from "../lib/messages";
import {
  chainsFor,
  findComponentBySource,
  listComponents,
  loadGraph,
  type Graph,
} from "../lib/graph";
import ChainDiagram from "./components/ChainDiagram";
import ErrorBoundary from "./components/ErrorBoundary";
import RepoMap from "./components/RepoMap";
import StepList from "./components/StepList";

type Tab = "xray" | "map";

export default function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("xray");
  const [componentId, setComponentId] = useState("");
  const [chainId, setChainId] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setGraph(null);
    loadGraph().then(setGraph).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const selectComponent = useCallback(
    (id: string) => {
      setComponentId(id);
      setChainId(graph && id ? (chainsFor(graph, id)[0]?.id ?? null) : null);
      setNodeId(id || null);
    },
    [graph],
  );

  // Alt+click in the page selects the matching component; untraced elements get a notice.
  useEffect(() => {
    if (!graph || typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    const listener = (msg: SelectMessage) => {
      if (msg?.type !== SELECT_MESSAGE) return;
      const match = msg.source ? findComponentBySource(graph, msg.source) : undefined;
      if (match) {
        setNotice(null);
        selectComponent(match.id);
        setTab("xray");
      } else if (msg.source) {
        setNotice(`"${msg.source}" is not in graph.json. Re-run the analyzer if the app changed.`);
      } else {
        setNotice("Not traced: that element has no data-source tag.");
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [graph, selectComponent]);

  const components = useMemo(() => (graph ? listComponents(graph) : []), [graph]);
  const component = graph && componentId ? graph.components[componentId] : undefined;
  const chains = useMemo(() => (graph && component ? chainsFor(graph, component.id) : []), [graph, component]);
  const chain = chains.find((c) => c.id === chainId) ?? chains[0];
  const nodeIds = chain ? chain.path : component ? [component.id] : [];

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 pt-3">
        <h1 className="text-base font-semibold">Onboarding X-Ray</h1>
        <div role="tablist" className="mt-2 flex gap-4">
          {(
            [
              ["xray", "X-Ray"],
              ["map", "Repo map"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`border-b-2 pb-2 text-sm ${
                tab === id ? "border-indigo-600 font-semibold text-indigo-700" : "border-transparent text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">
        {error && (
          <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-semibold">Could not load graph.json</p>
            <p className="mt-1 font-mono text-xs">{error}</p>
            <button type="button" onClick={load} className="mt-2 rounded bg-red-600 px-2 py-1 text-xs text-white">
              Retry
            </button>
          </div>
        )}

        {!graph && !error && (
          <div role="status" className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
            Loading graph…
          </div>
        )}

        {graph && components.length === 0 && (
          <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <p className="font-semibold">graph.json has no components.</p>
            <p className="mt-1">
              Run <code className="rounded bg-slate-100 px-1">npm run analyze</code> at the repo root, then rebuild the
              extension.
            </p>
          </div>
        )}

        {graph && components.length > 0 && (
          <ErrorBoundary onReset={() => selectComponent("")}>
            {notice && (
              <div role="status" className="flex items-start justify-between gap-2 rounded bg-amber-50 p-2 text-xs text-amber-800">
                <span>{notice}</span>
                <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="font-bold">
                  ×
                </button>
              </div>
            )}

            {tab === "map" && (
              <RepoMap
                graph={graph}
                onOpen={(id) => {
                  setNotice(null);
                  selectComponent(id);
                  setTab("xray");
                }}
              />
            )}

            {tab === "xray" && (
              <>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Component ({components.length})
                  <select
                    className="rounded border border-slate-300 bg-white p-2 text-sm font-normal"
                    value={componentId}
                    onChange={(e) => {
                      setNotice(null);
                      selectComponent(e.target.value);
                    }}
                  >
                    <option value="">Select a component…</option>
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.source_file}
                      </option>
                    ))}
                  </select>
                </label>

                {!component && (
                  <div className="rounded border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                    Alt+click an element in the demo app, pick a component above, or open the Repo map.
                  </div>
                )}

                {component && (
                  <>
                    {chains.length > 1 && (
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Chain ({chains.length})
                        <select
                          className="rounded border border-slate-300 bg-white p-2 text-sm font-normal"
                          value={chain?.id}
                          onChange={(e) => {
                            setChainId(e.target.value);
                            setNodeId(component.id);
                          }}
                        >
                          {chains.map((c) => (
                            <option key={c.id} value={c.id}>
                              {graph.nodes[c.endpoint]?.name ?? c.id}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {chains.length === 0 && (
                      <p className="rounded bg-slate-100 p-2 text-sm text-slate-600">
                        {component.name} makes no backend calls, so there is no chain beyond the component itself.
                      </p>
                    )}

                    <ChainDiagram graph={graph} nodeIds={nodeIds} selectedId={nodeId} onSelect={setNodeId} />
                    <StepList graph={graph} nodeIds={nodeIds} selectedId={nodeId} onSelect={setNodeId} />
                  </>
                )}
              </>
            )}
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
