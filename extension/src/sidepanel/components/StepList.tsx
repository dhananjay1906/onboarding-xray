import { useEffect, useRef, type ReactNode } from "react";
import { fileLine, type Graph } from "../../lib/graph";
import { LAYER_STYLE } from "../../lib/layers";
import CodeBlock from "./CodeBlock";

interface Props {
  graph: Graph;
  nodeIds: string[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  /** The Explanation area for one step. */
  renderExplanation: (nodeId: string, index: number) => ReactNode;
}

/** Ordered steps of the chain. The selected step shows its code; every step has an Explanation area. */
export default function StepList({ graph, nodeIds, selectedId, onSelect, renderExplanation }: Props) {
  const selectedRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <ol className="flex flex-col gap-2" aria-label="Chain steps">
      {nodeIds.map((id, i) => {
        const node = graph.nodes[id];
        if (!node) return null;
        const style = LAYER_STYLE[node.type];
        const selected = id === selectedId;
        return (
          <li
            key={id}
            ref={selected ? selectedRef : undefined}
            className="rounded border bg-white"
            style={{ borderColor: selected ? style.color : "#e2e8f0" }}
          >
            <button
              type="button"
              className="flex w-full items-start gap-2 p-2 text-left"
              aria-expanded={selected}
              onClick={() => onSelect(id)}
            >
              <span
                className="mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                style={{ background: style.color }}
              >
                {i + 1}. {style.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{node.name}</span>
                <span className="block truncate font-mono text-[11px] text-slate-500">{fileLine(node)}</span>
              </span>
            </button>

            <div className="px-2 pb-2">
              {selected && (
                <div className="mb-2">
                  <CodeBlock node={node} />
                </div>
              )}
              {renderExplanation(id, i)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
