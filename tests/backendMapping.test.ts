import { describe, it, expect } from "vitest";
import { mapToBackendEvent, mapToBackendReplayEvent, groupBySessionId } from "../src/core/backendMapping";
import type {
  AnalyticsEvent,
  AnyPayload,
  ClickEventPayload,
  HoverEventPayload,
  ScrollEventPayload,
  CursorEventPayload,
  MoveEventPayload,
  RageClickEventPayload,
  FunnelEventPayload,
  CustomEventPayload,
  IdentifyEventPayload,
  SessionStartEventPayload,
  SessionReplayEventPayload,
  PageContext,
} from "../src/types/events";

const basePage: PageContext = {
  url: "https://example.com/pricing",
  path: "/pricing",
  hostname: "example.com",
  viewportWidth: 1440,
  viewportHeight: 900,
  documentWidth: 1440,
  documentHeight: 3200,
  devicePixelRatio: 2,
};

function makeEvent<T extends AnyPayload>(
  type: AnalyticsEvent<T>["type"],
  payload: T,
  overrides: Partial<AnalyticsEvent<T>> = {}
): AnalyticsEvent<T> {
  return {
    eventId: "evt_1",
    type,
    timestamp: 1_700_000_000_000,
    anonymousId: "anon_1",
    sessionId: "sess_1",
    pageViewId: "pv_1",
    page: basePage,
    payload,
    ...overrides,
  };
}

describe("mapToBackendEvent", () => {
  it("maps page_view with no coordinates", () => {
    const event = makeEvent("page_view", { title: "Pricing" });
    expect(mapToBackendEvent(event)).toEqual({
      type: "page_view",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      path: "/pricing",
    });
  });

  it("maps click using clientX/clientY and the page's viewport size", () => {
    const payload: ClickEventPayload = {
      coordinates: { clientX: 120, clientY: 340, pageX: 120, pageY: 1340 },
      viewport: { width: 1440, height: 900 },
      scroll: { x: 0, y: 1000 },
      element: { tagName: "button", selector: "#cta" },
      interactive: true,
    };
    const event = makeEvent("click", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "click",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      element: { selector: "#cta" },
      x: 120,
      y: 340,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
  });

  it("includes element label/role in the click mapping when the SDK computed them", () => {
    const payload: ClickEventPayload = {
      coordinates: { clientX: 120, clientY: 340, pageX: 120, pageY: 1340 },
      viewport: { width: 1440, height: 900 },
      scroll: { x: 0, y: 1000 },
      element: { tagName: "button", selector: "#cta", label: "Save changes", role: "button" },
      interactive: true,
    };
    const event = makeEvent("click", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "click",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      element: { selector: "#cta", label: "Save changes", role: "button" },
      x: 120,
      y: 340,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
  });

  it("maps hover using its captured element-center position", () => {
    const payload: HoverEventPayload = {
      element: { tagName: "div", selector: "#hero" },
      hoverStart: 1000,
      hoverEnd: 61000,
      durationMs: 60000,
      x: 700,
      y: 220,
    };
    const event = makeEvent("hover", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "hover",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      element: { selector: "#hero" },
      durationMs: 60000,
      x: 700,
      y: 220,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
  });

  it("includes element label/role in the hover mapping when the SDK computed them", () => {
    const payload: HoverEventPayload = {
      element: { tagName: "a", selector: 'a[href="/dashboard/incidents/:id"]', label: "View", role: "link" },
      hoverStart: 1000,
      hoverEnd: 1500,
      durationMs: 500,
      x: 700,
      y: 220,
    };
    const event = makeEvent("hover", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "hover",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      element: { selector: 'a[href="/dashboard/incidents/:id"]', label: "View", role: "link" },
      durationMs: 500,
      x: 700,
      y: 220,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
  });

  it("maps hover with no captured position (older payload shape) without crashing", () => {
    const payload = {
      element: { tagName: "div", selector: "#hero" },
      hoverStart: 1000,
      hoverEnd: 61000,
      durationMs: 60000,
    } as HoverEventPayload;
    const event = makeEvent("hover", payload);
    const mapped = mapToBackendEvent(event);
    expect(mapped?.x).toBeUndefined();
    expect(mapped?.y).toBeUndefined();
  });

  it("maps scroll to scrollPercent with no coordinates (1-D signal)", () => {
    const payload: ScrollEventPayload = {
      scrollPercent: 55,
      maxScrollPercent: 55,
      scrollTop: 1760,
      documentHeight: 3200,
      viewportHeight: 900,
      direction: "down",
      milestone: 50,
    };
    const event = makeEvent("scroll", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "scroll",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      scrollPercent: 55,
      viewportWidth: 1440,
      viewportHeight: 900,
    });
  });

  it("maps cursor using its own payload-level viewport size, not the page envelope's", () => {
    const payload: CursorEventPayload = { timestamp: 1000, x: 300, y: 400, viewportWidth: 375, viewportHeight: 812 };
    const event = makeEvent("cursor", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "cursor",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      x: 300,
      y: 400,
      viewportWidth: 375,
      viewportHeight: 812,
    });
  });

  it("returns null for event types this backend has no ingestion path for", () => {
    const move = makeEvent<MoveEventPayload>("move", { points: [] });
    const rageClick = makeEvent<RageClickEventPayload>("rage_click", {
      coordinates: { x: 1, y: 1 },
      clickCount: 5,
      durationMs: 800,
    });
    const funnel = makeEvent<FunnelEventPayload>("funnel", {
      funnelName: "signup",
      stepIndex: 0,
      stepLabel: "start",
      status: "step_completed",
    });

    for (const event of [move, rageClick, funnel]) {
      expect(mapToBackendEvent(event)).toBeNull();
    }
  });

  it("maps identify with the anonymousId, external user id, and traits", () => {
    const identify = makeEvent<IdentifyEventPayload>("identify", {
      userId: "user_123",
      traits: { plan: "pro", name: "Sarah" },
    });

    expect(mapToBackendEvent(identify)).toEqual({
      type: "identify",
      timestamp: identify.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      externalUserId: "user_123",
      traits: { plan: "pro", name: "Sarah" },
    });
  });

  it("maps identify with no traits by omitting the traits field", () => {
    const identify = makeEvent<IdentifyEventPayload>("identify", { userId: "user_123" });

    expect(mapToBackendEvent(identify)).toEqual({
      type: "identify",
      timestamp: identify.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      externalUserId: "user_123",
    });
  });

  it("returns null for session_replay_event (handled by mapToBackendReplayEvent instead)", () => {
    const event = makeEvent<SessionReplayEventPayload>("session_replay_event", {
      replaySessionId: "replay_1",
      seq: 0,
      rrwebEvent: { type: 2, timestamp: 1000, data: {} },
    });
    expect(mapToBackendEvent(event)).toBeNull();
  });
});

describe("mapToBackendEvent - session_start", () => {
  it("maps a full environment snapshot", () => {
    const payload: SessionStartEventPayload = {
      browserName: "Chrome",
      browserVersion: "128.0.0.0",
      osName: "Windows",
      osVersion: "10.0",
      deviceType: "desktop",
      language: "en-US",
      timezone: "America/New_York",
      screenWidth: 1920,
      screenHeight: 1080,
      referrer: "https://google.com/",
    };
    const event = makeEvent("session_start", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "session_start",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      ...payload,
    });
  });

  it("omits fields the environment snapshot couldn't determine, rather than sending them as null/undefined keys", () => {
    const payload: SessionStartEventPayload = {
      deviceType: "mobile",
      language: "en-US",
      timezone: "America/New_York",
      screenWidth: 390,
      screenHeight: 844,
      // browserName/browserVersion/osName/osVersion/referrer all unset - an unrecognized UA, no referrer.
    };
    const event = makeEvent("session_start", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "session_start",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      deviceType: "mobile",
      language: "en-US",
      timezone: "America/New_York",
      screenWidth: 390,
      screenHeight: 844,
    });
  });
});

describe("mapToBackendEvent - custom", () => {
  it("maps a custom event with properties, unmodified", () => {
    const payload: CustomEventPayload = { name: "checkout_completed", properties: { plan: "pro", amount: 49, currency: "USD" } };
    const event = makeEvent("custom", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "custom",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      name: "checkout_completed",
      properties: { plan: "pro", amount: 49, currency: "USD" },
    });
  });

  it("maps a custom event with no properties by omitting the properties field", () => {
    const payload: CustomEventPayload = { name: "video_played" };
    const event = makeEvent("custom", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "custom",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      name: "video_played",
    });
  });

  it("preserves nested/array JSON-serializable property values", () => {
    const payload: CustomEventPayload = {
      name: "cart_updated",
      properties: { items: [{ sku: "A1", qty: 2 }, { sku: "B2", qty: 1 }], discounts: null, total: 87.5 },
    };
    const event = makeEvent("custom", payload);

    expect(mapToBackendEvent(event)).toEqual({
      type: "custom",
      timestamp: event.timestamp,
      anonymousId: "anon_1",
      eventId: "evt_1",
      pageViewId: "pv_1",
      name: "cart_updated",
      properties: payload.properties,
    });
  });

  it("never travels through a click/hover-shaped payload - no element/x/y/durationMs fields", () => {
    const event = makeEvent<CustomEventPayload>("custom", { name: "signed_up", properties: { plan: "free" } });
    const mapped = mapToBackendEvent(event);
    expect(mapped).not.toHaveProperty("element");
    expect(mapped).not.toHaveProperty("x");
    expect(mapped).not.toHaveProperty("y");
    expect(mapped).not.toHaveProperty("durationMs");
    expect(mapped).not.toHaveProperty("scrollPercent");
  });
});

describe("mapToBackendReplayEvent", () => {
  it("extracts type/timestamp/data unmodified from the wrapped rrweb event", () => {
    const rrwebEvent = { type: 3, timestamp: 5000, data: { source: 0, texts: [] } };
    const event = makeEvent<SessionReplayEventPayload>("session_replay_event", {
      replaySessionId: "replay_1",
      seq: 4,
      rrwebEvent,
    });

    expect(mapToBackendReplayEvent(event)).toEqual({ type: 3, timestamp: 5000, data: { source: 0, texts: [] } });
  });
});

describe("groupBySessionId", () => {
  it("groups events by sessionId while preserving relative order within each group", () => {
    const events = [
      { sessionId: "a", n: 1 },
      { sessionId: "b", n: 2 },
      { sessionId: "a", n: 3 },
      { sessionId: "a", n: 4 },
    ];
    const groups = groupBySessionId(events);
    expect([...groups.keys()]).toEqual(["a", "b"]);
    expect(groups.get("a")).toEqual([
      { sessionId: "a", n: 1 },
      { sessionId: "a", n: 3 },
      { sessionId: "a", n: 4 },
    ]);
    expect(groups.get("b")).toEqual([{ sessionId: "b", n: 2 }]);
  });

  it("handles an empty array", () => {
    expect(groupBySessionId([]).size).toBe(0);
  });
});
