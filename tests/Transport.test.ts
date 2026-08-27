import { describe, it, expect, vi, beforeEach } from "vitest";
import { Transport } from "../src/core/Transport";
import type { AnalyticsEvent, AnyPayload, PageContext } from "../src/types/events";

const basePage: PageContext = {
  url: "https://example.com/",
  path: "/",
  hostname: "example.com",
  viewportWidth: 1440,
  viewportHeight: 900,
  documentWidth: 1440,
  documentHeight: 2000,
  devicePixelRatio: 1,
};

function pageView(sessionId: string, eventId: string, timestamp = 1000): AnalyticsEvent<AnyPayload> {
  return {
    eventId,
    type: "page_view",
    timestamp,
    anonymousId: "anon_1",
    sessionId,
    pageViewId: "pv_1",
    page: basePage,
    payload: { title: "Home" },
  };
}

function replayEvent(sessionId: string, eventId: string, seq: number): AnalyticsEvent<AnyPayload> {
  return {
    eventId,
    type: "session_replay_event",
    timestamp: 1000 + seq,
    anonymousId: "anon_1",
    sessionId,
    pageViewId: "pv_1",
    page: basePage,
    payload: { replaySessionId: "replay_1", seq, rrwebEvent: { type: 2, timestamp: 1000 + seq, data: {} } },
  };
}

function moveEvent(sessionId: string): AnalyticsEvent<AnyPayload> {
  return {
    eventId: "evt_move",
    type: "move",
    timestamp: 1000,
    anonymousId: "anon_1",
    sessionId,
    pageViewId: "pv_1",
    page: basePage,
    payload: { points: [] },
  };
}

describe("Transport", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("posts standard events to {apiBase}/public/sites/{siteId}/events with {sessionId, events}", async () => {
    const transport = new Transport("https://api.test", "site_abc");
    await transport.send([pageView("sess_1", "e1")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/public/sites/site_abc/events");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      sessionId: "sess_1",
      events: [{ type: "page_view", timestamp: 1000, anonymousId: "anon_1", eventId: "e1", pageViewId: "pv_1", path: "/" }],
    });
  });

  it("posts replay events to the /replay route, separately from standard events", async () => {
    const transport = new Transport("https://api.test", "site_abc");
    await transport.send([pageView("sess_1", "e1"), replayEvent("sess_1", "e2", 0)]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toContain("https://api.test/public/sites/site_abc/events");
    expect(urls).toContain("https://api.test/public/sites/site_abc/replay");

    const replayCall = fetchMock.mock.calls.find((c) => c[0] === "https://api.test/public/sites/site_abc/replay")!;
    const replayBody = JSON.parse((replayCall[1] as RequestInit).body as string);
    expect(replayBody).toEqual({ sessionId: "sess_1", events: [{ type: 2, timestamp: 1000, data: {} }] });
  });

  it("fans out into one request per sessionId when a batch spans multiple sessions", async () => {
    const transport = new Transport("https://api.test", "site_abc");
    await transport.send([pageView("sess_1", "e1"), pageView("sess_2", "e2")]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies.map((b) => b.sessionId).sort()).toEqual(["sess_1", "sess_2"]);
  });

  it("makes no network call at all for a batch containing only unsupported event types", async () => {
    const transport = new Transport("https://api.test", "site_abc");
    const result = await transport.send([moveEvent("sess_1")]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, retryable: false });
  });

  it("classifies a 500 response as retryable and a 400 as not", async () => {
    const transport = new Transport("https://api.test", "site_abc");

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await transport.send([pageView("sess_1", "e1")])).toEqual({ ok: false, retryable: true });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
    expect(await transport.send([pageView("sess_1", "e2")])).toEqual({ ok: false, retryable: false });
  });

  it("classifies a thrown network error as retryable", async () => {
    const transport = new Transport("https://api.test", "site_abc");
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(await transport.send([pageView("sess_1", "e1")])).toEqual({ ok: false, retryable: true });
  });

  it("is a no-op when apiBase is empty", async () => {
    const transport = new Transport("", "site_abc");
    const result = await transport.send([pageView("sess_1", "e1")]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, retryable: false });
  });

  it("setEndpoint updates the base used for subsequent sends", async () => {
    const transport = new Transport("https://old.test", "site_abc");
    transport.setEndpoint("https://new.test");
    await transport.send([pageView("sess_1", "e1")]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://new.test/public/sites/site_abc/events");
  });

  describe("sendElements", () => {
    it("posts crawled elements to {apiBase}/public/sites/{siteId}/elements with { elements }", async () => {
      const transport = new Transport("https://api.test", "site_abc");
      await transport.sendElements([{ selector: "#cta", tagName: "button", label: "Save", role: "button" }]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.test/public/sites/site_abc/elements");
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toEqual({ elements: [{ selector: "#cta", tagName: "button", label: "Save", role: "button" }] });
    });

    it("is a no-op for an empty element list", async () => {
      const transport = new Transport("https://api.test", "site_abc");
      const result = await transport.sendElements([]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, retryable: false });
    });

    it("is a no-op when apiBase is empty", async () => {
      const transport = new Transport("", "site_abc");
      const result = await transport.sendElements([{ selector: "#cta", tagName: "button" }]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, retryable: false });
    });

    it("never touches the events or replay endpoints", async () => {
      const transport = new Transport("https://api.test", "site_abc");
      await transport.sendElements([{ selector: "#cta", tagName: "button" }]);
      const [url] = fetchMock.mock.calls[0];
      expect(url).not.toContain("/events");
      expect(url).not.toContain("/replay");
    });
  });
});
