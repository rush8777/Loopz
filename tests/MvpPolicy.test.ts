import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "../src/core/Analytics";
import { resolveConfig } from "../src/core/defaultConfig";
import { SessionActivityMonitor } from "../src/core/SessionActivityMonitor";
import type { SessionManager } from "../src/core/SessionManager";
import { CursorCollector } from "../src/autocapture/CursorCollector";
import { HoverCollector } from "../src/autocapture/HoverCollector";
import { MoveCollector } from "../src/autocapture/MoveCollector";
import { ClickCollector } from "../src/autocapture/ClickCollector";
import { ScrollCollector } from "../src/autocapture/ScrollCollector";
import { RageClickDetector } from "../src/autocapture/RageClickDetector";
import { ElementCrawler } from "../src/autocapture/ElementCrawler";
import { RRWebRecorder } from "../src/session/RRWebRecorder";
import { HeatmapManager } from "../src/heatmaps/HeatmapManager";
import { EventBus } from "../src/core/EventBus";
import { MVP1_POLICY } from "../src/core/mvpPolicy";

describe("MVP1 SDK policy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = "<button id=save>Save</button>";
    history.replaceState({}, "", "/settings");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("forces high-volume collectors and replay off while retaining MVP1 defaults", () => {
    const defaults = resolveConfig({ siteId: "site_1" });
    expect(defaults.autocapture).toMatchObject({ cursor: false, hover: false, move: false, click: true, scroll: true, rageClick: true, elementCrawler: true });
    expect(defaults.sessionReplay.enabled).toBe(false);

    const staleOverride = resolveConfig({
      siteId: "site_1",
      autocapture: { cursor: true, hover: true, move: true },
      sessionReplay: { enabled: true },
    });
    expect(staleOverride.autocapture).toMatchObject({ cursor: false, hover: false, move: false });
    expect(staleOverride.sessionReplay.enabled).toBe(false);
    // Interactive-only click persistence is release-locked alongside the
    // existing disabled high-volume capture modes.
    expect(MVP1_POLICY.interactiveClicksOnly).toBe(true);
  });

  it("does not initialize heatmaps or replay and keeps core analytics/discovery operational", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const cursor = vi.spyOn(CursorCollector.prototype, "start");
    const hover = vi.spyOn(HoverCollector.prototype, "start");
    const move = vi.spyOn(MoveCollector.prototype, "start");
    const click = vi.spyOn(ClickCollector.prototype, "start");
    const scroll = vi.spyOn(ScrollCollector.prototype, "start");
    const rage = vi.spyOn(RageClickDetector.prototype, "start");
    const crawl = vi.spyOn(ElementCrawler.prototype, "crawl");
    const replay = vi.spyOn(RRWebRecorder.prototype, "start");
    const heatmaps = vi.spyOn(HeatmapManager.prototype, "initialize");

    const analytics = new Analytics();
    analytics.init({
      siteId: "site_1",
      endpoint: "https://api.example.com",
      autocapture: { cursor: true, hover: true, move: true },
      sessionReplay: { enabled: true, bundleUrl: "https://cdn.example.com/sdk-replay.js" },
      heatmapSnapshotBundleUrl: "https://cdn.example.com/sdk-heatmap.js",
      experiences: { enabled: false },
    });
    analytics.identify("user_1", { plan: "pro" });
    analytics.event("saved", { source: "settings" });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(cursor).not.toHaveBeenCalled();
    expect(hover).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(replay).not.toHaveBeenCalled();
    expect(heatmaps).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
    expect(scroll).toHaveBeenCalledOnce();
    expect(rage).toHaveBeenCalledOnce();
    expect(crawl).toHaveBeenCalledOnce();
    expect(document.querySelector('script[src*="sdk-replay"],script[src*="sdk-heatmap"]')).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("heatmap"))).toBe(false);

    const events = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/events"))
      .flatMap(([, init]) => JSON.parse((init as RequestInit).body as string).events as Array<{ type: string; name?: string }>);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["session_start", "page_view", "identify", "custom"]));
    expect(events.find((event) => event.type === "custom")?.name).toBe("saved");
    analytics.destroy();
  });

  it("touches local session activity at most once per minute without a transport", () => {
    const touch = vi.fn();
    const monitor = new SessionActivityMonitor({ touch } as unknown as SessionManager);
    monitor.start();
    window.dispatchEvent(new Event("pointermove"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(touch).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event("pointerdown"));
    expect(touch).toHaveBeenCalledTimes(2);
    monitor.stop();
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event("pointermove"));
    expect(touch).toHaveBeenCalledTimes(2);
  });

  it("keeps rage-click detection aggregated", () => {
    const bus = new EventBus();
    const detector = new RageClickDetector(bus, { minClicks: 4, timeWindowMs: 1_000, radiusPx: 40, ignoreDoubleClickMs: 250 });
    const target = document.querySelector("#save")!;
    const rage = vi.fn();
    bus.on("rage_click", rage);
    detector.start();
    for (let i = 0; i < 4; i++) bus.emit("click:raw", { x: 10 + i, y: 10, target, timestamp: 1_000 + i * 100 });
    expect(rage).toHaveBeenCalledOnce();
    expect(rage.mock.calls[0][0]).toMatchObject({ clickCount: 4 });
    detector.stop();
  });
});
