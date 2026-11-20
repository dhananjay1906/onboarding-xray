import { describe, expect, it, vi } from "vitest";
import type { CachedExplanation, RemoteCache, Source } from "../cache";
import { buildPrompt, createExplainer, ExplainError, type ExplainRequest, type ModelCall } from "../explain";
import type { OnDeviceState } from "../onDevice";
import { DEFAULT_SETTINGS, type Settings } from "../settingsCore";

const req: ExplainRequest = {
  kind: "step",
  code: "def place_order(session):\n    return 1",
  role: "Step 5 of 8: Function (place_order)",
  layer: "function",
};

function setup(opts: {
  state?: OnDeviceState;
  settings?: Partial<Settings>;
  source?: Source;
  text?: string;
  remote?: RemoteCache;
  generateError?: Error;
} = {}) {
  const calls: ModelCall[] = [];
  const generate = vi.fn(async (call: ModelCall) => {
    calls.push(call);
    if (opts.generateError) throw opts.generateError;
    return { text: opts.text ?? "It places an order.", source: opts.source ?? ("cloud" as Source) };
  });
  const memory = new Map<string, CachedExplanation>();
  const explainer = createExplainer({
    settings: () => ({ ...DEFAULT_SETTINGS, ...opts.settings }),
    onDeviceState: async () => opts.state ?? "unavailable",
    generate,
    memory,
    remote: opts.remote,
  });
  return { explainer, generate, calls, memory };
}

const fakeRemote = (): RemoteCache & { store: Map<string, CachedExplanation>; get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } => {
  const store = new Map<string, CachedExplanation>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k)),
    set: vi.fn(async (k: string, v: CachedExplanation) => void store.set(k, v)),
  };
};

describe("Private only", () => {
  it("uses only_on_device and never touches the cloud or the shared cache", async () => {
    const remote = fakeRemote();
    const { explainer, calls } = setup({ state: "available", source: "on_device", remote });
    const result = await explainer.explain(req, "private");
    expect(calls.map((c) => c.mode)).toEqual(["only_on_device"]);
    expect(result).toMatchObject({ source: "on_device", reason: null, cached: false });
    expect(remote.get).not.toHaveBeenCalled();
    expect(remote.set).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "downloadable", "downloading"] as const)("fails clearly when the model is %s, without calling the model", async (state) => {
    const { explainer, generate } = setup({ state });
    await expect(explainer.explain(req, "private")).rejects.toMatchObject({ code: "NO_ON_DEVICE_MODEL" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses prompts that are too long for on-device instead of using the cloud", async () => {
    const { explainer, generate } = setup({ state: "available", settings: { onDeviceMaxChars: 200 } });
    const err = await explainer.explain({ ...req, code: "x".repeat(500) }, "private").catch((e) => e);
    expect(err).toBeInstanceOf(ExplainError);
    expect(err.code).toBe("TOO_LONG_FOR_PRIVATE");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("Auto", () => {
  it("prefers on-device when the model is ready and the prompt fits", async () => {
    const { explainer, calls } = setup({ state: "available", source: "on_device" });
    const result = await explainer.explain(req, "auto");
    expect(calls[0].mode).toBe("prefer_on_device");
    expect(result).toMatchObject({ source: "on_device", reason: null });
  });

  it.each([
    ["unavailable", "on-device unavailable"],
    ["downloadable", "model not downloaded"],
    ["downloading", "model not downloaded"],
  ] as const)("goes to the cloud when the model is %s and says why", async (state, reason) => {
    const { explainer, calls } = setup({ state, source: "cloud" });
    const result = await explainer.explain(req, "auto");
    expect(calls[0].mode).toBe("only_in_cloud");
    expect(result).toMatchObject({ source: "cloud", reason });
  });

  it("goes to the cloud for prompts over the Remote Config length limit", async () => {
    const { explainer, calls } = setup({ state: "available", settings: { onDeviceMaxChars: 200 } });
    const result = await explainer.explain({ ...req, code: "x".repeat(500) }, "auto");
    expect(calls[0].mode).toBe("only_in_cloud");
    expect(result.reason).toBe("too long for on-device");
  });

  it("reports on-device failure when the SDK fell back to the cloud even though the model was ready", async () => {
    const { explainer } = setup({ state: "available", source: "cloud" });
    expect((await explainer.explain(req, "auto")).reason).toBe("on-device failed");
  });
});

describe("Best quality", () => {
  it("prefers the cloud and labels it", async () => {
    const { explainer, calls } = setup({ state: "available", source: "cloud" });
    const result = await explainer.explain(req, "quality");
    expect(calls[0].mode).toBe("prefer_in_cloud");
    expect(result).toMatchObject({ source: "cloud", reason: "Best quality mode" });
  });

  it("passes the Remote Config cloud model through", async () => {
    const { explainer, calls } = setup({ settings: { cloudModel: "gemini-test-model" } });
    await explainer.explain(req, "quality");
    expect(calls[0].cloudModel).toBe("gemini-test-model");
  });
});

describe("caching", () => {
  it("serves a repeat request from memory without calling the model", async () => {
    const { explainer, generate } = setup({ state: "unavailable" });
    const first = await explainer.explain(req, "auto");
    const second = await explainer.explain(req, "auto");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(first.cached).toBe(false);
    expect(second).toMatchObject({ cached: true, text: first.text, source: first.source });
  });

  it("checks the shared cache first and writes new answers to it", async () => {
    const remote = fakeRemote();
    const a = setup({ remote });
    await a.explainer.explain(req, "auto");
    expect(remote.set).toHaveBeenCalledTimes(1);

    const b = setup({ remote }); // a fresh session reads the shared entry
    const result = await b.explainer.explain(req, "auto");
    expect(result.cached).toBe(true);
    expect(b.generate).not.toHaveBeenCalled();
  });

  it("ignores shared entries written with another prompt version", async () => {
    const remote = fakeRemote();
    await setup({ remote, settings: { promptVersion: "v1" } }).explainer.explain(req, "auto");
    const next = setup({ remote, settings: { promptVersion: "v2" } });
    expect((await next.explainer.explain(req, "auto")).cached).toBe(false);
    expect(next.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps Best quality and Auto answers apart", async () => {
    const remote = fakeRemote();
    const { explainer, generate } = setup({ remote });
    await explainer.explain(req, "auto");
    await explainer.explain(req, "quality");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not let a cloud answer cached in another mode appear in Private only", async () => {
    const { explainer, generate } = setup({ state: "available", source: "on_device" });
    await explainer.explain(req, "quality");
    await explainer.explain(req, "private");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("still answers when the shared cache is broken", async () => {
    const remote: RemoteCache = {
      get: async () => {
        throw new Error("permission-denied");
      },
      set: async () => {
        throw new Error("permission-denied");
      },
    };
    const { explainer } = setup({ remote });
    expect((await explainer.explain(req, "auto")).text).toBe("It places an order.");
  });
});

describe("errors", () => {
  it("wraps model failures", async () => {
    const { explainer } = setup({ generateError: new Error("quota exceeded") });
    await expect(explainer.explain(req, "auto")).rejects.toMatchObject({ code: "FAILED", message: "quota exceeded" });
  });

  it("rejects empty answers and does not cache them", async () => {
    const { explainer, memory } = setup({ text: "   " });
    await expect(explainer.explain(req, "auto")).rejects.toMatchObject({ code: "EMPTY" });
    expect(memory.size).toBe(0);
  });
});

describe("buildPrompt", () => {
  it("limits the model to the provided code and asks for 1-2 sentences plus why", () => {
    const p = buildPrompt(req);
    expect(p).toContain("Explain only the code provided");
    expect(p).toContain("1 to 2 sentences");
    expect(p).toContain("Why it exists:");
    expect(p).toContain(req.role);
    expect(p).toContain(req.code);
  });

  it("builds a longer summary prompt for the whole flow", () => {
    const p = buildPrompt({ ...req, kind: "flow" });
    expect(p).toContain("whole flow");
    expect(p).toContain("4 to 6 sentences");
  });
});
