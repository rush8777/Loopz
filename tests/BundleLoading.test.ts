import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autoInitializeFromScript } from "../src/api/PublicAPI";
import { Analytics } from "../src/core/Analytics";
import { deriveSiblingBundleUrl, loadSdkBundle } from "../src/core/sdkBundleLoader";
import type {
  EditorRuntime,
  ExperienceLoaderRuntime,
  ExperienceRuntime,
} from "../src/experiences/runtimeInterfaces";

const quietAutocapture = {
  click: false,
  scroll: false,
  move: false,
  rageClick: false,
  hover: false,
  cursor: false,
  elementCrawler: false,
};

describe("SDK bundle loading boundaries", () => {
  beforeEach(() => {
    document.head.querySelectorAll("script[data-movcues-bundle-url]").forEach((node) => node.remove());
    delete window.__movcuesExperienceRuntime__;
    delete window.__movcuesEditorRuntime__;
    history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("derives readable and minified sibling URLs, including the public v1 alias", () => {
    expect(deriveSiblingBundleUrl("https://cdn.movcues.com/sdk.js", "experiences"))
      .toBe("https://cdn.movcues.com/sdk-experiences.js");
    expect(deriveSiblingBundleUrl("https://cdn.movcues.com/assets/sdk.min.js", "editor"))
      .toBe("https://cdn.movcues.com/assets/sdk-editor.min.js");
    expect(deriveSiblingBundleUrl("https://cdn.movcues.com/v1.js", "replay"))
      .toBe("https://cdn.movcues.com/sdk-replay.min.js");
    expect(deriveSiblingBundleUrl("https://cdn.movcues.com/unknown.js", "heatmap")).toBeNull();
  });

  it("deduplicates simultaneous requests for the same SDK bundle", async () => {
    const url = "https://cdn.movcues.com/sdk-experiences.min.js?dedupe-test";
    const check = () => window.__movcuesExperienceRuntime__;
    const first = loadSdkBundle(url, check, "experience runtime");
    const second = loadSdkBundle(url, check, "experience runtime");

    const scripts = [...document.querySelectorAll<HTMLScriptElement>("script[data-movcues-bundle-url]")]
      .filter((script) => script.src === url);
    expect(scripts).toHaveLength(1);

    const runtime = fakeExperienceRuntime(fakeLoader());
    window.__movcuesExperienceRuntime__ = runtime;
    scripts[0].dispatchEvent(new Event("load"));
    await expect(first).resolves.toBe(runtime);
    await expect(second).resolves.toBe(runtime);
  });

  it("does not inject a duplicate editor script for concurrent editor loads", async () => {
    const url = "https://cdn.movcues.com/sdk-editor.min.js?dedupe-test";
    const check = () => window.__movcuesEditorRuntime__;
    const first = loadSdkBundle(url, check, "experience editor");
    const second = loadSdkBundle(url, check, "experience editor");

    const scripts = [...document.querySelectorAll<HTMLScriptElement>("script[data-movcues-bundle-url]")]
      .filter((script) => script.src === url);
    expect(scripts).toHaveLength(1);

    const runtime = fakeEditorRuntime(vi.fn().mockResolvedValue(true), vi.fn());
    window.__movcuesEditorRuntime__ = runtime;
    scripts[0].dispatchEvent(new Event("load"));
    await expect(first).resolves.toBe(runtime);
    await expect(second).resolves.toBe(runtime);
  });

  it("auto-initializes from data-site-id and keeps endpoint override support", () => {
    const init = vi.fn();
    const script = document.createElement("script");
    script.dataset.siteId = " site_123 ";
    script.dataset.endpoint = "https://api.custom.test";

    autoInitializeFromScript({ init } as unknown as Analytics, script);
    expect(init).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith({ siteId: "site_123", endpoint: "https://api.custom.test" });
  });

  it("normal initialization creates a session, starts collectors, sends a page view, and never requests editor", async () => {
    vi.useFakeTimers();
    const fetchMock = installSuccessfulFetch();
    const analytics = new Analytics();
    analytics.init({
      siteId: "site_1",
      endpoint: "https://api.example.com",
      experiences: { enabled: false },
      autocapture: quietAutocapture,
    });

    const internals = analytics as unknown as { session: unknown; engine: unknown; running: boolean };
    expect(internals.session).toBeTruthy();
    expect(internals.engine).toBeTruthy();
    expect(internals.running).toBe(true);
    expect(document.querySelector('script[src*="sdk-editor"]')).toBeNull();

    await vi.advanceTimersByTimeAsync(5000);
    const eventsCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/events"));
    const body = JSON.parse((eventsCall?.[1] as RequestInit).body as string);
    expect(body.events.some((event: { type: string }) => event.type === "page_view")).toBe(true);
    analytics.destroy();
  });

  it("loads editor first and a valid editor never creates a normal analytics session", async () => {
    history.replaceState({}, "", "/?loopz_editor_token=valid-token");
    const start = vi.fn().mockResolvedValue(true);
    const destroy = vi.fn();
    const analytics = new Analytics();
    analytics.init({
      siteId: "site_1",
      endpoint: "https://api.example.com",
      editorRuntimeBundleUrl: "https://cdn.movcues.com/sdk-editor.min.js?valid-test",
      experiences: { enabled: false },
    });

    const internals = analytics as unknown as { session: unknown; engine: unknown; editor: unknown };
    expect(internals.session).toBeUndefined();
    expect(internals.engine).toBeUndefined();
    const script = document.querySelector<HTMLScriptElement>('script[src*="valid-test"]')!;
    expect(script).toBeTruthy();

    window.__movcuesEditorRuntime__ = fakeEditorRuntime(start, destroy);
    script.dispatchEvent(new Event("load"));
    await settle();
    expect(start).toHaveBeenCalledWith("valid-token");
    expect(internals.editor).toBeTruthy();
    expect(internals.session).toBeUndefined();
    expect(internals.engine).toBeUndefined();
    analytics.destroy();
    expect(destroy).toHaveBeenCalled();
  });

  it("an invalid editor token falls back to normal initialization", async () => {
    history.replaceState({}, "", "/?loopz_editor_token=expired-token");
    installSuccessfulFetch();
    const analytics = new Analytics();
    analytics.init({
      siteId: "site_1",
      endpoint: "https://api.example.com",
      editorRuntimeBundleUrl: "https://cdn.movcues.com/sdk-editor.min.js?invalid-test",
      experiences: { enabled: false },
      autocapture: quietAutocapture,
    });

    const script = document.querySelector<HTMLScriptElement>('script[src*="invalid-test"]')!;
    window.__movcuesEditorRuntime__ = fakeEditorRuntime(vi.fn().mockResolvedValue(false), vi.fn());
    script.dispatchEvent(new Event("load"));
    await settle();

    const internals = analytics as unknown as { session: unknown; engine: unknown; running: boolean };
    expect(internals.session).toBeTruthy();
    expect(internals.engine).toBeTruthy();
    expect(internals.running).toBe(true);
    analytics.destroy();
  });

  it("loads experiences and preserves evaluate, route, custom-event, and destroy hooks", async () => {
    installSuccessfulFetch();
    const loader = fakeLoader();
    const analytics = new Analytics();
    analytics.init({
      siteId: "site_1",
      endpoint: "https://api.example.com",
      experienceRuntimeBundleUrl: "https://cdn.movcues.com/sdk-experiences.min.js?lifecycle-test",
      autocapture: quietAutocapture,
    });

    const script = document.querySelector<HTMLScriptElement>('script[src*="lifecycle-test"]')!;
    window.__movcuesExperienceRuntime__ = fakeExperienceRuntime(loader);
    script.dispatchEvent(new Event("load"));
    await settle();
    expect(loader.evaluate).toHaveBeenCalledOnce();

    analytics.event("trial_started");
    expect(loader.onCustomEvent).toHaveBeenCalledWith("trial_started");
    (analytics as unknown as { onRouteChange(): void }).onRouteChange();
    expect(loader.onRouteChange).toHaveBeenCalledOnce();
    analytics.destroy();
    expect(loader.destroy).toHaveBeenCalledOnce();
  });

  it("isolates an experience bundle network failure from analytics and host code", async () => {
    installSuccessfulFetch();
    vi.spyOn(console, "warn").mockImplementation(() => void 0);
    const analytics = new Analytics();
    analytics.init({
      siteId: "site_1",
      endpoint: "https://api.example.com",
      experienceRuntimeBundleUrl: "https://cdn.movcues.com/sdk-experiences.min.js?failure-test",
      autocapture: quietAutocapture,
    });

    const script = document.querySelector<HTMLScriptElement>('script[src*="failure-test"]')!;
    expect(() => script.dispatchEvent(new Event("error"))).not.toThrow();
    await settle();
    expect(() => analytics.event("analytics-still-running")).not.toThrow();
    const internals = analytics as unknown as { session: unknown; running: boolean };
    expect(internals.session).toBeTruthy();
    expect(internals.running).toBe(true);
    analytics.destroy();
  });
});

function fakeLoader(): ExperienceLoaderRuntime & Record<string, ReturnType<typeof vi.fn>> {
  return {
    evaluate: vi.fn().mockResolvedValue(undefined),
    onRouteChange: vi.fn(),
    onCustomEvent: vi.fn(),
    destroy: vi.fn(),
  };
}

function fakeExperienceRuntime(loader: ExperienceLoaderRuntime): ExperienceRuntime {
  return { createLoader: vi.fn(() => loader) };
}

function fakeEditorRuntime(start: ReturnType<typeof vi.fn>, destroy: ReturnType<typeof vi.fn>): EditorRuntime {
  return { createController: vi.fn(() => ({ start, destroy })) };
}

function installSuccessfulFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/public/config/")) return { ok: true, status: 200, json: async () => ({ heatmapStates: [] }) };
    if (url.includes("/heatmap-reference")) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 204, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
