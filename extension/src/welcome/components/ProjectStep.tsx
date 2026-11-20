import { useCallback, useEffect, useState } from "react";
import { clearCustomGraph, readCustomGraph, saveCustomGraph } from "../../lib/customGraph";
import { MAX_GRAPH_BYTES, validateGraph } from "../../lib/graphValidate";
import { builtInSites, disableSite, enableSite, extensionApisAvailable, listEnabledSites, parseSiteOrigin } from "../../lib/sites";
import Step, { CopyBlock } from "./Step";

const ANALYZE = "npm run analyze -- --backend path/to/backend --frontend path/to/frontend --no-copy";
const TAG_PLUGIN = "demo-app/frontend/plugins/dataSource.ts";

/** Step 3: run the analyzer on your own app, load its graph.json, and enable the extension on your app's site. */
export default function ProjectStep() {
  const [loaded, setLoaded] = useState<{ name: string; savedAt: number } | null>(null);
  const [fileMessage, setFileMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [siteInput, setSiteInput] = useState("");
  const [siteMessage, setSiteMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sites, setSites] = useState<string[]>([]);
  const inExtension = extensionApisAvailable();

  useEffect(() => {
    void readCustomGraph().then((c) => setLoaded(c ? { name: c.name, savedAt: c.savedAt } : null)).catch(() => setLoaded(null));
  }, []);

  const refreshSites = useCallback(() => {
    if (inExtension) void listEnabledSites().then(setSites).catch(() => setSites([]));
  }, [inExtension]);
  useEffect(refreshSites, [refreshSites]);

  async function onFile(file: File | undefined) {
    setFileMessage(null);
    if (!file) return;
    if (file.size > MAX_GRAPH_BYTES) return setFileMessage({ ok: false, text: "That file is larger than 25 MB, so it is probably not a graph.json." });
    try {
      const graph = validateGraph(JSON.parse(await file.text()));
      await saveCustomGraph(file.name, graph);
      setLoaded({ name: file.name, savedAt: Date.now() });
      const n = Object.keys(graph.components).length;
      setFileMessage({ ok: true, text: `Loaded ${file.name}: ${n} component${n === 1 ? "" : "s"}, ${graph.chains.length} chain${graph.chains.length === 1 ? "" : "s"}. The side panel now shows your project.` });
    } catch (e) {
      setFileMessage({ ok: false, text: e instanceof SyntaxError ? "That file is not valid JSON." : (e as Error).message });
    }
  }

  async function onEnable() {
    setSiteMessage(null);
    const parsed = parseSiteOrigin(siteInput);
    if (!parsed.ok) return setSiteMessage({ ok: false, text: parsed.error });
    try {
      await enableSite(parsed.pattern);
      setSiteMessage({ ok: true, text: `Enabled on ${parsed.origin}. Reload that tab, then hold Alt and click.` });
      setSiteInput("");
      refreshSites();
    } catch (e) {
      setSiteMessage({ ok: false, text: (e as Error).message });
    }
  }

  const input = "rounded border border-slate-300 px-2 py-1 text-sm";
  const btn = "rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";

  return (
    <Step n={3} title="Use your own project" status={loaded ? "done" : "optional"}>
      <div>
        <p className="font-medium">A. Analyze your app</p>
        <p className="text-xs text-slate-500">
          From the root of the Onboarding X-Ray repo. It supports a FastAPI backend and a React (Vite) frontend. <code>--no-copy</code> keeps the
          bundled demo graph untouched.
        </p>
        <div className="mt-1">
          <CopyBlock text={ANALYZE} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          It writes <code>analyzer/out/graph.json</code>.
        </p>
      </div>

      <div>
        <p className="font-medium">B. Tag your frontend</p>
        <p className="text-xs text-slate-500">
          Alt+click needs <code>data-source</code> attributes on your elements. Copy <code>{TAG_PLUGIN}</code> into your Vite project and add it first in
          <code> plugins</code> (<code>plugins: [dataSource(), react()]</code>). It tags both dev and production builds; set <code>VITE_XRAY_TAGS=false</code> to
          turn it off.
        </p>
      </div>

      <div>
        <p className="font-medium">C. Load your graph.json</p>
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Choose your graph.json"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="block w-full text-xs file:mr-3 file:rounded file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
        />
        {fileMessage && (
          <p role={fileMessage.ok ? "status" : "alert"} data-testid="file-message" className={`mt-1 text-xs ${fileMessage.ok ? "text-emerald-700" : "text-red-700"}`}>
            {fileMessage.text}
          </p>
        )}
        {loaded && (
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-600" data-testid="loaded-graph">
            Using your graph: <strong>{loaded.name}</strong>. Explanations of your code are never added to the shared cache.
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => void clearCustomGraph().then(() => { setLoaded(null); setFileMessage(null); })}
            >
              Use demo graph
            </button>
          </p>
        )}
      </div>

      <div>
        <p className="font-medium">D. Enable the extension on your app</p>
        {!inExtension ? (
          <p className="text-xs text-amber-700">This works only inside the installed extension.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              The extension only runs on the demo store until you allow a site. Enter your app's address; Chrome asks for permission on that one site.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                value={siteInput}
                onChange={(e) => setSiteInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void onEnable()}
                placeholder="http://localhost:3000"
                aria-label="Your app's address"
                className={`${input} min-w-0 flex-1`}
              />
              <button type="button" onClick={() => void onEnable()} className={btn}>
                Enable on this site
              </button>
            </div>
            {siteMessage && (
              <p role={siteMessage.ok ? "status" : "alert"} data-testid="site-message" className={`mt-1 text-xs ${siteMessage.ok ? "text-emerald-700" : "text-red-700"}`}>
                {siteMessage.text}
              </p>
            )}
            <ul className="mt-2 flex flex-col gap-1 text-xs" data-testid="site-list">
              {builtInSites().map((s) => (
                <li key={s} className="flex justify-between rounded bg-slate-50 px-2 py-1 text-slate-500">
                  <code>{s}</code>
                  <span>demo, always on</span>
                </li>
              ))}
              {sites.map((s) => (
                <li key={s} className="flex items-center justify-between rounded bg-indigo-50 px-2 py-1">
                  <code>{s}</code>
                  <button type="button" className="font-semibold underline" onClick={() => void disableSite(s).then(refreshSites)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Step>
  );
}
