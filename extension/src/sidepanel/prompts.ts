// Builds the model requests for one step and for the whole flow from graph nodes.
import type { ExplainRequest } from "../lib/explain";
import { fileLine, type Graph } from "../lib/graph";
import { LAYER_STYLE } from "../lib/layers";

const MAX_SNIPPET_IN_FLOW = 1200;

export function stepRequest(graph: Graph, nodeIds: string[], index: number): ExplainRequest | null {
  const node = graph.nodes[nodeIds[index]];
  if (!node) return null;
  const chain = nodeIds.map((id) => graph.nodes[id]?.name ?? id).join(" → ");
  return {
    kind: "step",
    code: node.snippet,
    role: `Step ${index + 1} of ${nodeIds.length}, ${LAYER_STYLE[node.type].label} "${node.name}" (${fileLine(node)}). The full chain is: ${chain}.`,
    layer: node.type,
  };
}

export function flowRequest(graph: Graph, nodeIds: string[]): ExplainRequest | null {
  const nodes = nodeIds.map((id) => graph.nodes[id]).filter(Boolean);
  if (nodes.length < 2) return null;
  const code = nodes
    .map((n, i) => {
      const snippet = n.snippet.length > MAX_SNIPPET_IN_FLOW ? `${n.snippet.slice(0, MAX_SNIPPET_IN_FLOW)}\n… (truncated)` : n.snippet;
      return `### ${i + 1}. ${LAYER_STYLE[n.type].label}: ${n.name} (${fileLine(n)})\n${snippet}`;
    })
    .join("\n\n");
  return {
    kind: "flow",
    code,
    role: `The flow starts at the React component "${nodes[0].name}" and ends at the database: ${nodes.map((n) => n.name).join(" → ")}.`,
    layer: "flow",
  };
}
