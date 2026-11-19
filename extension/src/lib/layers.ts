import type { NodeType } from "./graph";

export const LAYER_ORDER: NodeType[] = ["component", "api_function", "endpoint", "handler", "function", "table"];

export const LAYER_STYLE: Record<NodeType, { label: string; color: string; tint: string }> = {
  component: { label: "Component", color: "#6366f1", tint: "#eef2ff" },
  api_function: { label: "API call", color: "#8b5cf6", tint: "#f5f3ff" },
  endpoint: { label: "Endpoint", color: "#0ea5e9", tint: "#f0f9ff" },
  handler: { label: "Route handler", color: "#14b8a6", tint: "#f0fdfa" },
  function: { label: "Function", color: "#22c55e", tint: "#f0fdf4" },
  table: { label: "Table", color: "#f59e0b", tint: "#fffbeb" },
};
