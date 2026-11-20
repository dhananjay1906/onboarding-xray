import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fileLine, type Graph, type GraphNode } from "../../lib/graph";
import { LAYER_ORDER, LAYER_STYLE } from "../../lib/layers";

type LayerNodeData = { node: GraphNode; selected: boolean };
type LayerFlowNode = Node<LayerNodeData, "layer">;

const NODE_W = 180;
const GAP_X = 20;
const ROW_H = 104;

function LayerNode({ data }: NodeProps<LayerFlowNode>) {
  const { node, selected } = data;
  const style = LAYER_STYLE[node.type];
  const location = fileLine(node);
  return (
    <div
      className="rounded-lg border-2 px-3 py-2 text-left"
      style={{
        width: NODE_W,
        borderColor: style.color,
        background: selected ? `color-mix(in srgb, ${style.color} 18%, var(--color-surface))` : "var(--color-surface)",
        boxShadow: selected ? `0 0 0 3px ${style.color}33` : "0 1px 2px rgba(0,0,0,.08)",
        cursor: "pointer",
      }}
      title={location}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: style.color }}>
        {style.label}
      </div>
      <div className="truncate text-base font-semibold text-slate-900">{node.name}</div>
      <div className="truncate font-mono text-xs text-slate-500">{location.split("/").pop()}</div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { layer: LayerNode };

interface Props {
  graph: Graph;
  nodeIds: string[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}

/** Re-fits the diagram whenever the container width (and so the layout) changes: panel resize, tab switch, window snap. */
function FitOnWidth({ width }: { width: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const frame = requestAnimationFrame(() => void fitView({ padding: 0.1, maxZoom: 1.4, duration: 200 }));
    return () => cancelAnimationFrame(frame);
  }, [fitView, width]);
  return null;
}

/** One row per layer (component, API call, endpoint, handler, functions, tables), colored by layer. */
export default function ChainDiagram({ graph, nodeIds, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // How many nodes fit side by side at full size; wider rows wrap so nodes stay large in a narrow panel.
  const perRow = Math.max(1, Math.floor((width + GAP_X) / (NODE_W + GAP_X)));
  const { nodes, edges } = useMemo(() => {
    const present = new Set(nodeIds);
    const rows = LAYER_ORDER.flatMap((type) => {
      const ids = nodeIds.filter((id) => graph.nodes[id]?.type === type);
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += perRow) chunks.push(ids.slice(i, i + perRow));
      return chunks;
    });
    const nodes: LayerFlowNode[] = rows.flatMap((row, r) =>
      row.map((id, i) => ({
        id,
        type: "layer" as const,
        position: { x: (i - (row.length - 1) / 2) * (NODE_W + GAP_X), y: r * ROW_H },
        data: { node: graph.nodes[id], selected: id === selectedId },
        draggable: false,
        connectable: false,
      })),
    );
    const edges: Edge[] = graph.edges
      .filter((e) => present.has(e.from) && present.has(e.to))
      .map((e, i) => ({
        id: `e${i}`,
        source: e.from,
        target: e.to,
        label: e.op,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        style: { stroke: "#94a3b8", strokeWidth: 2 },
        labelStyle: { fontSize: 12, fill: "var(--color-slate-600)" },
        labelBgStyle: { fill: "var(--color-surface)" },
      }));
    return { nodes, edges };
  }, [graph, nodeIds, selectedId, perRow]);

  return (
    <div ref={container} className="h-[40rem] overflow-hidden rounded border border-slate-200 bg-surface" data-testid="chain-diagram">
      <ReactFlow
        key={nodeIds.join("|")}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id)}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1.4 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        style={{ background: "var(--color-surface)" }}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={16} color="var(--color-slate-200)" />
        <Controls showInteractive={false} />
        <FitOnWidth width={width} />
      </ReactFlow>
    </div>
  );
}
