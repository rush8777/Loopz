import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "../src/core/Analytics";
import { FunnelTracker } from "../src/autocapture/FunnelTracker";

describe("SDK route lifecycle", () => {
  let analytics: Analytics | null;

  beforeEach(() => {
    analytics = null;
    document.body.innerHTML = "<button>Save</button>";
    history.replaceState({}, "", "/settings");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  afterEach(() => {
    analytics?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  function init(): Analytics {
    const instance = new Analytics();
    instance.init({
      siteId: "site_test",
      endpoint: "https://api.test",
      autocapture: { scroll: false, move: false, rageClick: false, hover: false, cursor: false, elementCrawler: true },
      queue: { maxWaitMs: 0 },
      experiences: { enabled: false },
    });
    analytics = instance;
    return instance;
  }

  it("records SPA page views and advances funnel routing", async () => {
    const funnelPageViewSpy = vi.spyOn(FunnelTracker.prototype, "onPageView");
    init();
    const pageViewsBeforeRoute = funnelPageViewSpy.mock.calls.length;
    history.pushState({}, "", "/profile?tab=security");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(funnelPageViewSpy.mock.calls.length).toBeGreaterThan(pageViewsBeforeRoute);
    await vi.waitFor(() => {
      const events = (fetch as ReturnType<typeof vi.fn>).mock.calls
        .filter(([, requestInit]) => (requestInit as RequestInit | undefined)?.body)
        .map(([, requestInit]) => JSON.parse((requestInit as RequestInit).body as string))
        .flatMap((body) => body.events ?? []);
      expect(events.filter((event) => event.type === "page_view").length).toBeGreaterThanOrEqual(2);
    });
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some(([url]) => String(url).endsWith("/elements"))).toBe(false);
  });

  it("pauses funnel routing while the SDK is stopped", async () => {
    const funnelPageViewSpy = vi.spyOn(FunnelTracker.prototype, "onPageView");
    const instance = init();
    const behavioralCallsBeforeStop = funnelPageViewSpy.mock.calls.length;
    instance.stop();
    history.pushState({}, "", "/profile");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(funnelPageViewSpy).toHaveBeenCalledTimes(behavioralCallsBeforeStop);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => String(url).endsWith("/elements"))).toBe(false);
  });

  it("removes SDK route processing on destroy", async () => {
    const funnelPageViewSpy = vi.spyOn(FunnelTracker.prototype, "onPageView");
    const instance = init();
    const callsBeforeDestroy = funnelPageViewSpy.mock.calls.length;
    instance.destroy();
    analytics = null;
    history.pushState({}, "", "/after-destroy");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(funnelPageViewSpy).toHaveBeenCalledTimes(callsBeforeDestroy);
  });
});
