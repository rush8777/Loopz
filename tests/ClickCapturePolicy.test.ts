import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "../src/core/Analytics";
import { ClickCollector } from "../src/autocapture/ClickCollector";
import { RageClickDetector } from "../src/autocapture/RageClickDetector";
import { EventBus } from "../src/core/EventBus";
import { PrivacyFilter } from "../src/privacy/PrivacyFilter";

describe("MVP1 interactive click capture policy", () => {
  let analytics: Analytics | null = null;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '<button id="save">Save</button><a id="docs" href="/docs">Docs</a><div id="background">Background</div>';
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    analytics?.destroy();
    analytics = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  function startAnalytics() {
    analytics = new Analytics();
    analytics.init({
      siteId: "site_1",
      endpoint: "https://api.example.com",
      autocapture: { scroll: false, move: false, rageClick: false, hover: false, cursor: false, elementCrawler: false },
      experiences: { enabled: false },
    });
    return analytics;
  }

  async function queuedEvents(): Promise<Array<{ type: string; name?: string }>> {
    await vi.advanceTimersByTimeAsync(5_000);
    return fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/events"))
      .flatMap(([, init]) => JSON.parse((init as RequestInit).body as string).events as Array<{ type: string; name?: string }>);
  }

  it("queues normal analytics clicks for interactive buttons and links", async () => {
    startAnalytics();
    document.querySelector<HTMLButtonElement>("#save")!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }));
    const docs = document.querySelector<HTMLAnchorElement>("#docs")!;
    docs.addEventListener("click", (event) => event.preventDefault(), { once: true });
    docs.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 12, clientY: 22 }));

    expect((await queuedEvents()).filter((event) => event.type === "click")).toHaveLength(2);
  });

  it("does not queue ordinary background clicks", async () => {
    startAnalytics();
    document.querySelector("#background")!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 20 }));

    expect((await queuedEvents()).some((event) => event.type === "click")).toBe(false);
  });

  it("still emits click:raw for non-interactive clicks and aggregates rage clicks from them", () => {
    const bus = new EventBus();
    const collector = new ClickCollector(bus, new PrivacyFilter());
    const detector = new RageClickDetector(bus, { minClicks: 4, timeWindowMs: 1_000, radiusPx: 40, ignoreDoubleClickMs: 250 });
    const raw = vi.fn();
    const rage = vi.fn();
    bus.on("click:raw", raw);
    bus.on("rage_click", rage);
    collector.start();
    detector.start();

    const background = document.querySelector("#background")!;
    for (let i = 0; i < 4; i++) {
      background.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10 + i, clientY: 20 }));
      vi.advanceTimersByTime(100);
    }

    expect(raw).toHaveBeenCalledTimes(4);
    expect(rage).toHaveBeenCalledOnce();
    expect(rage.mock.calls[0][0]).toMatchObject({ clickCount: 4 });
    detector.stop();
    collector.stop();
  });

  it("leaves custom analytics events unchanged", async () => {
    const instance = startAnalytics();
    instance.event("checkout_completed", { plan: "pro" });
    document.querySelector("#background")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const events = await queuedEvents();
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "custom", name: "checkout_completed" })]));
    expect(events.some((event) => event.type === "click")).toBe(false);
  });
});
