import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useMemo } from "react";
import { fileLine, type Graph, type GraphNode } from "../../lib/graph";
import { LAYER_ORDER, LAYER_STYLE } from "../../lib/layers";

type LayerNodeData = { node: GraphNode; selected: boolean };
type LayerFlowNode = Node<LayerNodeData, "layer">;

const NODE_W = 150;
const GAP_X = 12;
const ROW_H = 82;

function LayerNode({ data }: NodeProps<LayerFlowNode>) {
  const { node, selected } = data;
  const style = LAYER_STYLE[node.type];
  const location = fileLine(node);
  return (
    <div
      className="rounded-md border-2 px-2 py-1.5 text-left"
      style={{
        width: NODE_W,
        borderColor: style.color,
        background: selected ? style.tint : "#fff",
        boxShadow: selected ? `0 0 0 3px ${style.color}33` : "0 1px 2px rgba(0,0,0,.08)",
        cursor: "pointer",
      }}
      title={location}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: style.color }}>
        {style.label}
      </div>
      <div className="truncate text-xs font-semibold text-slate-900">{node.name}</div>
      <div className="truncate font-mono text-[9px] text-slate-500">{location.split("/").pop()}</div>
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

/** One row per layer (component, API call, endpoint, handler, functions, tables), colored by layer. */
export default function ChainDiagram({ graph, nodeIds, selectedId, onSelect }: Props) {
  const { nodes, edges } = useMemo(() => {
    const present = new Set(nodeIds);
    const rows = LAYER_ORDER.map((type) => nodeIds.filter((id) => graph.nodes[id]?.type === type)).filter(
      (row) => row.length > 0,
    );
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
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        labelStyle: { fontSize: 9, fill: "#475569" },
      }));
    return { nodes, edges };
  }, [graph, nodeIds, selectedId]);

  return (
    <div className="h-[26rem] overflow-hidden rounded border border-slate-200 bg-white" data-testid="chain-diagram">
      <ReactFlow
        key={nodeIds.join("|")}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id)}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        style={{ background: "#fff" }}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={16} color="#e2e8f0" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
