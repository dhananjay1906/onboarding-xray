import { useMemo } from "react";
import { endpointsFor, listComponents, type Graph } from "../../lib/graph";

/** Every component in the graph and the endpoints it reaches. Click a row to open its chain. */
export default function RepoMap({ graph, onOpen }: { graph: Graph; onOpen: (componentId: string) => void }) {
  const rows = useMemo(
    () => listComponents(graph).map((c) => ({ component: c, endpoints: endpointsFor(graph, c.id) })),
    [graph],
  );
  const withBackend = rows.filter((r) => r.endpoints.length > 0).length;

  if (rows.length === 0) return null;

  return (
    <section aria-label="Repo map" className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">
        {rows.length} components · {withBackend} reach the backend
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map(({ component, endpoints }) => (
          <li key={component.id}>
            <button
              type="button"
              onClick={() => onOpen(component.id)}
              className="w-full rounded border border-slate-200 bg-white p-2 text-left hover:border-indigo-300 hover:bg-indigo-50"
            >
              <span className="block text-sm font-semibold">{component.name}</span>
              <span className="block truncate font-mono text-[11px] text-slate-500">
                {component.file}:{component.line}-{component.end_line}
              </span>
              {endpoints.length === 0 ? (
                <span className="mt-1 block text-xs text-slate-400">No backend calls</span>
              ) : (
                <span className="mt-1 flex flex-wrap gap-1">
                  {endpoints.map((e) => (
                    <span key={e} className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[11px] text-sky-800">
                      {e}
                    </span>
                  ))}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
