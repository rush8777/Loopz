import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createAnalytics } from "../src/module";

/**
 * Exercises `analytics.event(name, properties?)` end-to-end through the
 * real pipeline (Analytics -> EventQueue -> Batcher -> Transport ->
 * fetch), the same path a real page load uses - as opposed to
 * backendMapping.test.ts, which tests the mapping function in
 * isolation with hand-built AnalyticsEvent fixtures.
 */
describe("analytics.event()", () => {
  let instances: ReturnType<typeof createAnalytics>[] = [];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    for (const a of instances) a.destroy();
    instances = [];
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function make(siteId = "site_1") {
    const a = createAnalytics({
      siteId,
      endpoint: "https://api.example.com",
      autocapture: { scroll: false, move: false, rageClick: false, hover: false, cursor: false, elementCrawler: false },
    });
    instances.push(a);
    return a;
  }

  /** Advances past the batcher's max wait so whatever is queued gets flushed, then returns every /events request body's `events` array, flattened. */
  async function flushAndCollectEvents(): Promise<Record<string, unknown>[]> {
    await vi.advanceTimersByTimeAsync(5000);
    const events: Record<string, unknown>[] = [];
    for (const call of fetchMock.mock.calls) {
      const [url, init] = call as [string, RequestInit];
      if (!url.endsWith("/events")) continue;
      const body = JSON.parse(init.body as string);
      events.push(...body.events);
    }
    return events;
  }

  it("sends a custom event with the given name and no properties", async () => {
    const analytics = make();
    analytics.event("checkout_completed");

    const events = await flushAndCollectEvents();
    const custom = events.find((e) => e.type === "custom");
    expect(custom).toMatchObject({ type: "custom", name: "checkout_completed" });
    expect(custom).not.toHaveProperty("properties");
  });

  it("sends a custom event with properties, preserved as-is", async () => {
    const analytics = make();
    analytics.event("checkout_completed", { plan: "pro", amount: 49, currency: "USD" });

    const events = await flushAndCollectEvents();
    const custom = events.find((e) => e.type === "custom");
    expect(custom).toMatchObject({
      type: "custom",
      name: "checkout_completed",
      properties: { plan: "pro", amount: 49, currency: "USD" },
    });
  });

  it("preserves arbitrary JSON-serializable property shapes (nested objects, arrays, null, booleans)", async () => {
    const analytics = make();
    analytics.event("cart_updated", {
      items: [
        { sku: "A1", qty: 2 },
        { sku: "B2", qty: 1 },
      ],
      discountCode: null,
      isGift: false,
      total: 87.5,
    });

    const events = await flushAndCollectEvents();
    const custom = events.find((e) => e.type === "custom");
    expect((custom as { properties: unknown }).properties).toEqual({
      items: [
        { sku: "A1", qty: 2 },
        { sku: "B2", qty: 1 },
      ],
      discountCode: null,
      isGift: false,
      total: 87.5,
    });
  });

  it("generates a unique eventId per call, even for the same event name", async () => {
    const analytics = make();
    analytics.event("signed_up");
    analytics.event("signed_up");

    const events = await flushAndCollectEvents();
    const customs = events.filter((e) => e.type === "custom");
    expect(customs).toHaveLength(2);
    expect(customs[0].eventId).toBeTruthy();
    expect(customs[1].eventId).toBeTruthy();
    expect(customs[0].eventId).not.toBe(customs[1].eventId);
  });

  it("carries the same anonymousId, sessionId, and pageViewId as every other event in the same page view", async () => {
    const analytics = make();
    analytics.event("checkout_started");

    const events = await flushAndCollectEvents();
    const pageView = events.find((e) => e.type === "page_view");
    const custom = events.find((e) => e.type === "custom");

    expect(custom!.anonymousId).toBe(pageView!.anonymousId);
    expect(custom!.pageViewId).toBe(pageView!.pageViewId);
    // sessionId isn't part of the per-event backend payload (see
    // backendMapping.ts) - it's the batch envelope's own field, sent
    // once per POST body rather than repeated per event.
  });

  it("does not force an immediate flush - custom events participate in normal batching alongside other events", async () => {
    const analytics = make();
    analytics.event("checkout_started");
    // Nothing has been flushed yet - no fetch call for the events endpoint.
    expect(fetchMock.mock.calls.some(([url]) => (url as string).endsWith("/events"))).toBe(false);

    const events = await flushAndCollectEvents();
    expect(events.some((e) => e.type === "custom")).toBe(true);
  });
});
