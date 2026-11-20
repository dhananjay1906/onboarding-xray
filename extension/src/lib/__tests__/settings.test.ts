import { describe, expect, it } from "vitest";
import { cacheKey } from "../cache";
import { MODES } from "../modes";
import { DEFAULT_SETTINGS, parseSettings } from "../settingsCore";

describe("parseSettings", () => {
  it("uses defaults when nothing is set", () => {
    expect(parseSettings(() => undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("reads valid Remote Config values", () => {
    const values: Record<string, string> = {
      on_device_max_chars: "2500",
      prompt_version: "v7",
      default_mode: "private",
      cloud_model: "gemini-3.8-flash",
    };
    expect(parseSettings((k) => values[k])).toEqual({
      onDeviceMaxChars: 2500,
      promptVersion: "v7",
      defaultMode: "private",
      cloudModel: "gemini-3.8-flash",
    });
  });

  it("ignores invalid values", () => {
    const values: Record<string, string> = {
      on_device_max_chars: "12",
      prompt_version: "x".repeat(40),
      default_mode: "yolo",
      cloud_model: "bad model; drop table",
    };
    expect(parseSettings((k) => values[k])).toEqual(DEFAULT_SETTINGS);
  });
});

describe("modes", () => {
  it("maps the privacy toggle to SDK inference modes", () => {
    expect(Object.fromEntries(MODES.map((m) => [m.id, m.sdk]))).toEqual({
      private: "only_on_device",
      auto: "prefer_on_device",
      quality: "prefer_in_cloud",
    });
  });
});

describe("cacheKey", () => {
  const base = { snippet: "code", promptVersion: "v1", tier: "a" as const, kind: "step:function" };

  it("is a stable sha-256 hex string accepted by the Firestore rules", async () => {
    const key = await cacheKey(base);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(await cacheKey(base)).toBe(key);
  });

  it.each([
    ["snippet", { snippet: "other" }],
    ["prompt version", { promptVersion: "v2" }],
    ["tier", { tier: "q" as const }],
    ["kind", { kind: "flow:component" }],
  ])("changes when the %s changes", async (_name, change) => {
    expect(await cacheKey({ ...base, ...change })).not.toBe(await cacheKey(base));
  });
});
