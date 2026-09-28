import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "../src/core/Analytics";
import { ElementCrawler } from "../src/autocapture/ElementCrawler";
import { FunnelTracker } from "../src/autocapture/FunnelTracker";

describe("Analytics Page/Element discovery lifecycle", () => {
  let analytics: Analytics | null;
  let crawlSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    analytics = null;
    document.body.innerHTML = "<button>Save</button>";
    history.replaceState({}, "", "/settings");
    crawlSpy = vi.spyOn(ElementCrawler.prototype, "crawl");
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

  it("never crawls on initialization, stop, or restart despite stale opt-in configuration", () => {
    const instance = init();
    expect(crawlSpy).not.toHaveBeenCalled();

    instance.stop();
    instance.start();
    expect(crawlSpy).not.toHaveBeenCalled();
  });

  it("does not schedule or perform a crawl when initialized while the document is loading", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const addSpy = vi.spyOn(document, "addEventListener");
    init();

    expect(crawlSpy).not.toHaveBeenCalled();
    expect(addSpy.mock.calls.filter(([type]) => type === "DOMContentLoaded")).toHaveLength(0);
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(crawlSpy).not.toHaveBeenCalled();
  });

  it("keeps SPA page views and funnel routing active without crawling or element traffic", async () => {
    const funnelPageViewSpy = vi.spyOn(FunnelTracker.prototype, "onPageView");
    init();
    const pageViewsBeforeRoute = funnelPageViewSpy.mock.calls.length;
    history.pushState({}, "", "/profile?tab=security");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(crawlSpy).not.toHaveBeenCalled();
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

  it("keeps route observation active after stop without activating discovery", async () => {
    const funnelPageViewSpy = vi.spyOn(FunnelTracker.prototype, "onPageView");
    const instance = init();
    const behavioralCallsBeforeStop = funnelPageViewSpy.mock.calls.length;
    instance.stop();
    history.pushState({}, "", "/profile");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(crawlSpy).not.toHaveBeenCalled();
    expect(funnelPageViewSpy).toHaveBeenCalledTimes(behavioralCallsBeforeStop);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => String(url).endsWith("/elements"))).toBe(false);
  });

  it("removes route and pending discovery activity on destroy", async () => {
    const instance = init();
    instance.destroy();
    analytics = null;
    history.pushState({}, "", "/after-destroy");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(crawlSpy).not.toHaveBeenCalled();
  });
});
