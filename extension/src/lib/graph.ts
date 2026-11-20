// Load and query graph.json (produced by `npm run analyze` at the repo root): the bundled demo graph,
// or one the user loaded from their own project.
import { readCustomGraph } from "./customGraph";
import { validateGraph } from "./graphValidate";

export interface GraphNode {
  id: string;
  type: "component" | "api_function" | "endpoint" | "handler" | "function" | "table";
  name: string;
  file: string;
  line: number;
  end_line: number;
  snippet: string;
}

export interface GraphComponent {
  id: string;
  name: string;
  file: string;
  source_file: string; // relative to the frontend root: matches data-source attributes
  line: number;
  end_line: number;
  chains: string[];
}

export interface GraphChain {
  id: string;
  component: string;
  api_function: string | null;
  endpoint: string;
  handler: string;
  path: string[]; // node ids in layer order
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: string;
  op?: string; // table edges: create / get / select ...
  line?: number;
}

export interface Graph {
  schema_version: number;
  frontend_root: string;
  backend_root: string;
  layers: string[];
  components: Record<string, GraphComponent>;
  chains: GraphChain[];
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

export type NodeType = GraphNode["type"];

/** "path/file.py:12-40", or "path/file.py:12" for a single line. */
export function fileLine(node: Pick<GraphNode, "file" | "line" | "end_line">): string {
  return node.end_line > node.line ? `${node.file}:${node.line}-${node.end_line}` : `${node.file}:${node.line}`;
}

/** Distinct endpoints (e.g. "POST /api/orders") a component reaches. */
export function endpointsFor(graph: Graph, componentId: string): string[] {
  const names = chainsFor(graph, componentId).map((c) => graph.nodes[c.endpoint]?.name ?? c.endpoint);
  return [...new Set(names)];
}

export async function loadGraph(): Promise<Graph> {
  // Relative to the page, so it works inside the extension and on a plain static server.
  const res = await fetch(new URL("graph.json", location.href));
  if (!res.ok) throw new Error(`Could not load graph.json (${res.status})`);
  const graph = (await res.json()) as Graph;
  if (graph.schema_version !== 1) throw new Error(`Unsupported graph schema ${graph.schema_version}`);
  return graph;
}

export interface ActiveGraph {
  graph: Graph;
  /** Set when the user loaded their own graph.json from the welcome page. */
  custom: { name: string; savedAt: number } | null;
}

/** The user's own graph.json if they loaded one (and it is still valid), otherwise the bundled demo graph. */
export async function loadActiveGraph(): Promise<ActiveGraph> {
  try {
    const stored = await readCustomGraph();
    if (stored) return { graph: validateGraph(stored.graph), custom: { name: stored.name, savedAt: stored.savedAt } };
  } catch {
    /* unreadable or invalid stored graph: fall back to the bundled one */
  }
  return { graph: await loadGraph(), custom: null };
}

export function listComponents(graph: Graph): GraphComponent[] {
  return Object.values(graph.components).sort(
    (a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file),
  );
}

export function chainsFor(graph: Graph, componentId: string): GraphChain[] {
  const component = graph.components[componentId];
  if (!component) return [];
  const byId = new Map(graph.chains.map((c) => [c.id, c]));
  return component.chains.flatMap((id) => byId.get(id) ?? []);
}

/** Resolve a data-source value ("src/pages/Checkout.tsx:52") to a component by file and line range. */
export function findComponentBySource(graph: Graph, source: string): GraphComponent | undefined {
  const sep = source.lastIndexOf(":");
  const file = sep === -1 ? source : source.slice(0, sep);
  const line = sep === -1 ? NaN : Number(source.slice(sep + 1));
  return Object.values(graph.components).find(
    (c) => c.source_file === file && (Number.isNaN(line) || (line >= c.line && line <= c.end_line)),
  );
}
