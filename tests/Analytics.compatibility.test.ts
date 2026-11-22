import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "../src/core/Analytics";
import { SessionActivityMonitor } from "../src/core/SessionActivityMonitor";
import type { SessionManager } from "../src/core/SessionManager";
import { ClickCollector } from "../src/autocapture/ClickCollector";
import { ScrollCollector } from "../src/autocapture/ScrollCollector";
import { RageClickDetector } from "../src/autocapture/RageClickDetector";
import { EventBus } from "../src/core/EventBus";

describe("SDK analytics compatibility", () => {
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

  it("ignores retired options and sends supported analytics on initial and SPA page views", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const click = vi.spyOn(ClickCollector.prototype, "start");
    const scroll = vi.spyOn(ScrollCollector.prototype, "start");
    const rage = vi.spyOn(RageClickDetector.prototype, "start");

    const analytics = new Analytics();
    analytics.init({
      siteId: "site_1",
      endpoint: "https://api.example.com",
      autocapture: { cursor: true, hover: true, move: true, elementCrawler: true },
      sessionReplay: { enabled: true, bundleUrl: "https://cdn.example.com/sdk-replay.js" },
      heatmapSnapshotBundleUrl: "https://cdn.example.com/sdk-heatmap.js",
      experiences: { enabled: false },
    });
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 40, clientY: 50 }));
    document.querySelector("#save")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    history.pushState({}, "", "/settings/profile");
    analytics.identify("user_1", { plan: "pro" });
    analytics.event("saved", { source: "settings" });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(click).toHaveBeenCalledOnce();
    expect(scroll).toHaveBeenCalledOnce();
    expect(rage).toHaveBeenCalledOnce();
    expect(document.querySelector('script[src*="sdk-replay"],script[src*="sdk-heatmap"]')).toBeNull();
    expect(new Set(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname))).toEqual(new Set(["/public/config/site_1", "/public/sites/site_1/events"]));

    const events = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/events"))
      .flatMap(([, init]) => JSON.parse((init as RequestInit).body as string).events as Array<{ type: string; name?: string; path?: string }>);
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(["session_start", "page_view", "identify", "custom"]));
    expect(events.filter(event => event.type === "page_view").map(event => event.path)).toEqual(["/settings", "/settings/profile"]);
    expect(events.every(event => ["session_start", "page_view", "identify", "custom"].includes(event.type))).toBe(true);
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
