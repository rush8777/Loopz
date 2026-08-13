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
    expect(mapToBackendEvent(event)).toEqual({ type: "page_view", timestamp: event.timestamp });
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
      element: { selector: "#cta" },
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
      element: { selector: "#hero" },
      durationMs: 60000,
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
    const custom = makeEvent<CustomEventPayload>("custom", { name: "video_played" });
    const identify = makeEvent<IdentifyEventPayload>("identify", { userId: "u1" });

    for (const event of [move, rageClick, funnel, custom, identify]) {
      expect(mapToBackendEvent(event)).toBeNull();
    }
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
