import { describe, expect, it, vi } from "vitest";
import type { CachedExplanation, RemoteCache } from "../cache";
import { parseChromeMajor } from "../chromeVersion";
import { createExplainer, type ExplainRequest } from "../explain";
import { validateGraph } from "../graphValidate";
import { DEFAULT_SETTINGS } from "../settingsCore";
import { idFor, parseSiteOrigin } from "../sites";

describe("parseChromeMajor", () => {
  it("prefers Google Chrome client hints", () => {
    const brands = [{ brand: "Not.A/Brand", version: "99" }, { brand: "Chromium", version: "140" }, { brand: "Google Chrome", version: "141" }];
    expect(parseChromeMajor("anything", brands)).toBe(141);
  });
  it("falls back to Chromium, then to the user agent string", () => {
    expect(parseChromeMajor("x", [{ brand: "Chromium", version: "138" }])).toBe(138);
    expect(parseChromeMajor("Mozilla/5.0 Chrome/139.0.0.0 Safari/537.36")).toBe(139);
    expect(parseChromeMajor("Mozilla/5.0 Firefox/130.0")).toBeNull();
  });
});

describe("parseSiteOrigin", () => {
  it("accepts addresses with or without a scheme and reduces them to the origin", () => {
    expect(parseSiteOrigin("localhost:3000")).toEqual({ ok: true, origin: "http://localhost:3000", pattern: "http://localhost:3000/*" });
    expect(parseSiteOrigin("http://127.0.0.1:8080/some/page?q=1")).toMatchObject({ ok: true, origin: "http://127.0.0.1:8080" });
    expect(parseSiteOrigin("app.example.com")).toMatchObject({ ok: true, origin: "https://app.example.com", pattern: "https://app.example.com/*" });
    expect(parseSiteOrigin("  https://app.example.com/  ")).toMatchObject({ ok: true, origin: "https://app.example.com" });
  });
  it.each(["", "   ", "*://*/*", "https://*.example.com", "<all_urls>", "ftp://example.com", "chrome://extensions", "http://", "not a url"])(
    "rejects %j",
    (input) => {
      expect(parseSiteOrigin(input).ok).toBe(false);
    },
  );
  it("makes a stable script id per pattern", () => {
    expect(idFor("http://localhost:3000/*")).toBe(idFor("http://localhost:3000/*"));
    expect(idFor("http://localhost:3000/*")).not.toBe(idFor("http://localhost:3001/*"));
    expect(idFor("http://localhost:3000/*")).toMatch(/^xray-site-[a-z0-9-]+$/i);
  });
});

const goodGraph = () => ({
  schema_version: 1,
  frontend_root: "f",
  backend_root: "b",
  layers: [],
  components: { "component:A": { id: "component:A", name: "A", file: "a.tsx", source_file: "src/a.tsx", line: 1, end_line: 9, chains: ["chain:1"] } },
  nodes: {
    "component:A": { id: "component:A", type: "component", name: "A", file: "a.tsx", line: 1, end_line: 9, snippet: "x" },
    "endpoint:GET /x": { id: "endpoint:GET /x", type: "endpoint", name: "GET /x", file: "r.py", line: 3, end_line: 3, snippet: "@r.get" },
    "handler:h": { id: "handler:h", type: "handler", name: "h", file: "r.py", line: 4, end_line: 6, snippet: "def h" },
  },
  chains: [{ id: "chain:1", component: "component:A", api_function: null, endpoint: "endpoint:GET /x", handler: "handler:h", path: ["component:A", "endpoint:GET /x", "handler:h"] }],
  edges: [{ from: "component:A", to: "endpoint:GET /x", kind: "requests" }],
});

describe("validateGraph", () => {
  it("accepts a well-formed graph and returns it", () => {
    const g = goodGraph();
    expect(validateGraph(g)).toBe(g);
  });

  it("accepts the bundled demo graph", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(new URL("../../../public/graph.json", import.meta.url), "utf8"));
    expect(() => validateGraph(raw)).not.toThrow();
  });

  it.each([
    ["not an object", [], /expected a JSON object/],
    ["wrong schema version", { ...goodGraph(), schema_version: 2 }, /schema_version/],
    ["missing nodes", { ...goodGraph(), nodes: undefined }, /"nodes" must be an object/],
    ["no components", { ...goodGraph(), components: {} }, /no components/],
    ["chain pointing at a missing node", { ...goodGraph(), chains: [{ ...goodGraph().chains[0], path: ["nope"] }] }, /chain is malformed/],
    ["component listing a missing chain", (() => { const g = goodGraph(); g.components["component:A"].chains = ["chain:zzz"]; return g; })(), /chain that does not exist/],
    ["malformed node", (() => { const g = goodGraph(); (g.nodes["handler:h"] as { type: string }).type = "banana"; return g; })(), /node "handler:h" is malformed/],
  ])("rejects: %s", (_name, input, message) => {
    expect(() => validateGraph(input)).toThrow(message);
  });
});

describe("shared cache is skipped for a user's own graph", () => {
  const req: ExplainRequest = { kind: "step", code: "def f(): pass", role: "r", layer: "function" };
  function setup(canShare: boolean) {
    const store = new Map<string, CachedExplanation>();
    const remote: RemoteCache & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } = {
      get: vi.fn(async (k: string) => store.get(k)),
      set: vi.fn(async (k: string, v: CachedExplanation) => void store.set(k, v)),
    };
    const memory = new Map<string, CachedExplanation>();
    const generate = vi.fn(async () => ({ text: "It does a thing.", source: "cloud" as const }));
    const explainer = createExplainer({ settings: () => DEFAULT_SETTINGS, onDeviceState: async () => "unavailable", generate, memory, remote, canShare: () => canShare });
    return { explainer, remote, generate };
  }

  it("never reads or writes the shared cache when canShare is false (Auto and Best quality)", async () => {
    const { explainer, remote, generate } = setup(false);
    await explainer.explain(req, "auto");
    await explainer.explain({ ...req, code: "other" }, "quality");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(remote.get).not.toHaveBeenCalled();
    expect(remote.set).not.toHaveBeenCalled();
  });

  it("still caches in memory when canShare is false", async () => {
    const { explainer, generate } = setup(false);
    await explainer.explain(req, "auto");
    expect((await explainer.explain(req, "auto")).cached).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("uses the shared cache when canShare is true", async () => {
    const { explainer, remote } = setup(true);
    await explainer.explain(req, "auto");
    expect(remote.get).toHaveBeenCalledTimes(1);
    expect(remote.set).toHaveBeenCalledTimes(1);
  });
});
