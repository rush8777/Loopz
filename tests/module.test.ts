import { describe, it, expect, afterEach, vi } from "vitest";
import { createAnalytics } from "../src/module";

/**
 * Regression coverage for the duplicate-event bug: createAnalytics()
 * called twice without an intervening destroy() (the shape of React 18
 * StrictMode's double-invoked mount effect) used to construct two
 * independent Analytics instances, each with its own AutoCaptureEngine
 * and DOM listeners - so every real click/scroll/hover/page-view got
 * captured, and sent, twice. See module.ts's createAnalytics() doc
 * comment for the full explanation.
 */
describe("createAnalytics() single-instance guarantee", () => {
  let instances: ReturnType<typeof createAnalytics>[] = [];

  afterEach(() => {
    for (const a of instances) a.destroy();
    instances = [];
  });

  function make(siteId = "site_1") {
    const a = createAnalytics({
      siteId,
      autocapture: { scroll: false, move: false, rageClick: false, hover: false, cursor: false, elementCrawler: false },
    });
    instances.push(a);
    return a;
  }

  it("returns the same instance on a repeat call instead of creating a second one", () => {
    const first = make();
    const second = make();
    expect(second).toBe(first);
  });

  it("only attaches one click listener across two calls, not one per call", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    make();
    make();

    const clickListenerCalls = addEventListenerSpy.mock.calls.filter(([type]) => type === "click");
    expect(clickListenerCalls).toHaveLength(1);

    addEventListenerSpy.mockRestore();
  });

  it("only installs one set of unload/flush handlers across two calls, not one per call", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    make();
    make();

    const visibilityChangeCalls = addEventListenerSpy.mock.calls.filter(([type]) => type === "visibilitychange");
    expect(visibilityChangeCalls).toHaveLength(1);

    addEventListenerSpy.mockRestore();
  });

  it("allows creating a new instance after the previous one is destroyed", () => {
    const first = createAnalytics({ siteId: "site_1" });
    first.destroy();

    const second = createAnalytics({ siteId: "site_1" });
    instances.push(second);

    expect(second).not.toBe(first);
  });

  it("destroying a stale reference after a new instance has already replaced it doesn't clear the new instance's tracking", () => {
    const first = createAnalytics({ siteId: "site_1" });
    first.destroy();
    const second = make(); // tracked instance is now `second`

    // Calling destroy() again on the already-destroyed `first` must not
    // affect the module's tracking of the current active instance.
    first.destroy();

    const third = createAnalytics({ siteId: "site_1" });
    expect(third).toBe(second);
  });
});
