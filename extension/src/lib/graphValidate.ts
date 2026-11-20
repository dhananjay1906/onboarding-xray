// Validation for a graph.json the user loads from disk (it is untrusted input).
import type { Graph } from "./graph";

const NODE_TYPES = ["component", "api_function", "endpoint", "handler", "function", "table"];
export const MAX_GRAPH_BYTES = 25 * 1024 * 1024;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Returns the graph if it has the shape the panel needs; throws an Error that says what is wrong. */
export function validateGraph(raw: unknown): Graph {
  const problems: string[] = [];
  const bad = (msg: string) => {
    if (problems.length < 5) problems.push(msg);
  };

  if (!isObj(raw)) throw new Error("This is not a graph.json file (expected a JSON object).");
  if (raw.schema_version !== 1) {
    throw new Error(`Invalid graph.json: schema_version must be 1 (found ${JSON.stringify(raw.schema_version)}). Regenerate it with npm run analyze.`);
  }
  for (const key of ["components", "nodes"] as const) if (!isObj(raw[key])) bad(`"${key}" must be an object`);
  for (const key of ["chains", "edges"] as const) if (!Array.isArray(raw[key])) bad(`"${key}" must be an array`);

  if (!problems.length) {
    const nodes = raw.nodes as Record<string, unknown>;
    const components = raw.components as Record<string, unknown>;
    const chains = raw.chains as unknown[];

    if (Object.keys(components).length === 0) bad("it has no components");

    for (const [id, n] of Object.entries(nodes)) {
      if (!isObj(n) || n.id !== id || !isStr(n.name) || !isStr(n.file) || !isStr(n.snippet) || !isNum(n.line) || !isNum(n.end_line) || !NODE_TYPES.includes(n.type as string)) {
        bad(`node "${id}" is malformed`);
      }
    }
    for (const [id, c] of Object.entries(components)) {
      if (!isObj(c) || c.id !== id || !isStr(c.name) || !isStr(c.file) || !isStr(c.source_file) || !isNum(c.line) || !isNum(c.end_line) || !Array.isArray(c.chains)) {
        bad(`component "${id}" is malformed`);
      }
    }
    const chainIds = new Set<string>();
    for (const c of chains) {
      if (!isObj(c) || !isStr(c.id) || !isStr(c.component) || !isStr(c.endpoint) || !isStr(c.handler) || !Array.isArray(c.path) || !c.path.every((p) => isStr(p) && p in nodes)) {
        bad("a chain is malformed or points at a node that does not exist");
      } else chainIds.add(c.id);
    }
    for (const c of Object.values(components)) {
      if (isObj(c) && Array.isArray(c.chains) && !c.chains.every((id) => chainIds.has(id as string))) bad(`component "${String(c.name)}" lists a chain that does not exist`);
    }
    for (const e of raw.edges as unknown[]) {
      if (!isObj(e) || !isStr(e.from) || !isStr(e.to)) {
        bad("an edge is malformed");
        break;
      }
    }
  }

  if (problems.length) throw new Error(`Invalid graph.json: ${problems.join("; ")}.`);
  return raw as unknown as Graph;
}
