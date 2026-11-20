import { useCallback, useEffect, useMemo, useState } from "react";
import { SELECT_MESSAGE, type SelectMessage } from "../lib/messages";
import { clearCustomGraph, onGraphChanged } from "../lib/customGraph";
import {
  chainsFor,
  findComponentBySource,
  listComponents,
  loadActiveGraph,
  type Graph,
} from "../lib/graph";
import { openTour } from "../lib/links";
import { readStoredMode, storeMode, type PrivacyMode } from "../lib/modes";
import { loadSettings } from "../lib/settings";
import ChainDiagram from "./components/ChainDiagram";
import ErrorBoundary from "./components/ErrorBoundary";
import ExplanationBox from "./components/ExplanationBox";
import RepoMap from "./components/RepoMap";
import StatusBar from "./components/StatusBar";
import StepList from "./components/StepList";
import { flowRequest, stepRequest } from "./prompts";
import { setSharedCacheAllowed, useExplanations } from "./useExplanations";
import { useOnDevice } from "../lib/useOnDevice";

type Tab = "xray" | "map";

export default function App() {
  const [mode, setModeState] = useState<PrivacyMode>(() => readStoredMode() ?? "auto");
  const onDevice = useOnDevice();
  const { states, run } = useExplanations(mode);

  const setMode = useCallback((m: PrivacyMode) => {
    setModeState(m);
    storeMode(m);
  }, []);

  // Remote Config (prompt limits, default mode, cloud model). Private only skips the fetch: no network at all.
  useEffect(() => {
    if (mode === "private") return;
    void loadSettings().then((s) => {
      if (!readStoredMode()) setModeState(s.defaultMode); // default_mode applies until the user picks one
    });
  }, [mode]);

  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("xray");
  const [componentId, setComponentId] = useState("");
  const [chainId, setChainId] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [custom, setCustom] = useState<{ name: string } | null>(null);

  const load = useCallback(() => {
    setError(null);
    setGraph(null);
    setComponentId("");
    setChainId(null);
    setNodeId(null);
    loadActiveGraph()
      .then(({ graph, custom }) => {
        setSharedCacheAllowed(!custom); // the user's own code never goes to the shared cache
        setCustom(custom);
        setGraph(graph);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  // The welcome page can load or clear the user's own graph.json while the panel is open.
  useEffect(() => onGraphChanged(load), [load]);

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
    <div className="flex min-h-screen w-full flex-col">
      <header className="bg-surface px-4 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-base font-semibold">Onboarding X-Ray</h1>
          <button
            type="button"
            onClick={openTour}
            aria-label="Replay the tour"
            title="Replay the tour"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            ?
          </button>
        </div>
        <StatusBar
          mode={mode}
          onModeChange={setMode}
          state={onDevice.state}
          checked={onDevice.checked}
          progress={onDevice.progress}
          error={onDevice.error}
          onDownload={() => void onDevice.download()}
        />
      </header>
      <nav className="sticky top-0 z-10 border-b border-slate-200 bg-surface px-4">
        <div role="tablist" className="flex gap-4">
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
      </nav>

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
          <div className="rounded border border-slate-200 bg-surface p-4 text-sm text-slate-600">
            <p className="font-semibold">graph.json has no components.</p>
            <p className="mt-1">
              Run <code className="rounded bg-slate-100 px-1">npm run analyze</code> at the repo root, then rebuild the
              extension.
            </p>
          </div>
        )}

        {graph && components.length > 0 && (
          <ErrorBoundary onReset={() => selectComponent("")}>
            {custom && (
              <div className="flex items-center justify-between gap-2 rounded bg-indigo-50 p-2 text-xs text-indigo-900" data-testid="custom-graph-banner">
                <span>
                  Showing your graph: <strong>{custom.name}</strong>. Your code is not added to the shared cache.
                </span>
                <button type="button" onClick={() => void clearCustomGraph().then(load)} className="whitespace-nowrap font-semibold underline">
                  Use demo graph
                </button>
              </div>
            )}

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
                    className="rounded border border-slate-300 bg-surface p-2 text-sm font-normal"
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
                  <div className="rounded border border-dashed border-slate-300 bg-surface p-4 text-sm text-slate-500">
                    Alt+click an element in the demo app, pick a component above, or open the Repo map. Good first click: <strong className="font-semibold text-indigo-700">Place order</strong> on the checkout page.
                  </div>
                )}

                {component && (
                  <>
                    {chains.length > 1 && (
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Chain ({chains.length})
                        <select
                          className="rounded border border-slate-300 bg-surface p-2 text-sm font-normal"
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
                    {chain && (
                      <section aria-label="Whole flow" className="rounded border border-slate-200 bg-surface p-3">
                        <h2 className="mb-2 text-sm font-semibold">Whole flow</h2>
                        {(() => {
                          const req = flowRequest(graph, nodeIds);
                          return req ? (
                            <ExplanationBox
                              label="Summarize whole flow"
                              state={states[`flow:${chain.id}`]}
                              onExplain={() => void run(`flow:${chain.id}`, req)}
                              onDeviceState={onDevice.state}
                              onDownload={() => void onDevice.download()}
                              downloading={onDevice.progress !== null || onDevice.state === "downloading"}
                              onSwitchToAuto={() => setMode("auto")}
                            />
                          ) : null;
                        })()}
                      </section>
                    )}
                    <StepList
                      graph={graph}
                      nodeIds={nodeIds}
                      selectedId={nodeId}
                      onSelect={setNodeId}
                      renderExplanation={(id, index) => {
                        const req = stepRequest(graph, nodeIds, index);
                        return req ? (
                          <ExplanationBox
                            state={states[`step:${id}`]}
                            onExplain={() => void run(`step:${id}`, req)}
                            onDeviceState={onDevice.state}
                            onDownload={() => void onDevice.download()}
                            downloading={onDevice.progress !== null || onDevice.state === "downloading"}
                            onSwitchToAuto={() => setMode("auto")}
                          />
                        ) : null;
                      }}
                    />
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
