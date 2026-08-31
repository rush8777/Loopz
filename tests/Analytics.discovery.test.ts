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
      autocapture: { scroll: false, move: false, rageClick: false, hover: false, cursor: false },
    });
    analytics = instance;
    return instance;
  }

  it("discovers on init and does not crawl again when start is called", () => {
    const instance = init();
    expect(crawlSpy).toHaveBeenCalledTimes(1);

    instance.start();
    expect(crawlSpy).toHaveBeenCalledTimes(1);
  });

  it("waits for DOMContentLoaded once when initialized while the document is loading", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const addSpy = vi.spyOn(document, "addEventListener");
    init();

    expect(crawlSpy).not.toHaveBeenCalled();
    expect(addSpy.mock.calls.filter(([type]) => type === "DOMContentLoaded")).toHaveLength(1);
    document.dispatchEvent(new Event("DOMContentLoaded"));
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(crawlSpy).toHaveBeenCalledTimes(1);
  });

  it("crawls one batch per SPA route with the new pathname", async () => {
    init();
    history.pushState({}, "", "/profile?tab=security");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(crawlSpy).toHaveBeenCalledTimes(2);
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
      .filter(([, requestInit]) => (requestInit as RequestInit | undefined)?.body)
      .map(([, requestInit]) => JSON.parse((requestInit as RequestInit).body as string))
      .filter((body) => body.elements);
    expect(calls.map((body) => body.pagePath)).toEqual(["/settings", "/profile"]);
  });

  it("keeps structural discovery active after stop", async () => {
    const funnelPageViewSpy = vi.spyOn(FunnelTracker.prototype, "onPageView");
    const instance = init();
    const behavioralCallsBeforeStop = funnelPageViewSpy.mock.calls.length;
    instance.stop();
    history.pushState({}, "", "/profile");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(crawlSpy).toHaveBeenCalledTimes(2);
    expect(funnelPageViewSpy).toHaveBeenCalledTimes(behavioralCallsBeforeStop);
  });

  it("removes route and pending discovery activity on destroy", async () => {
    const instance = init();
    instance.destroy();
    analytics = null;
    history.pushState({}, "", "/after-destroy");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(crawlSpy).toHaveBeenCalledTimes(1);
  });
});
