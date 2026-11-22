import type { AnalyticsEvent } from "../types/events";
import { mapToBackendEvent, groupBySessionId, type BackendIncomingEvent } from "./backendMapping";

export interface TransportResult {
  ok: boolean;
  retryable: boolean;
  acknowledgedEventIds?: string[];
}

export class Transport {
  constructor(
    private apiBase: string,
    private siteId: string
  ) {}

  setEndpoint(apiBase: string): void {
    this.apiBase = apiBase;
  }

  private eventsUrl(): string {
    return `${this.apiBase}/public/sites/${this.siteId}/events`;
  }

  /** Best-effort async send used during normal operation. */
  async send(events: AnalyticsEvent[]): Promise<TransportResult> {
    if (!this.apiBase || events.length === 0) return { ok: true, retryable: false };

    const acknowledgedEventIds: string[] = [];
    let ok = true;
    let retryable = false;
    for (const [sessionId, group] of mapEventsBySession(events)) {
      const result = await this.postJson(this.eventsUrl(), { sessionId, events: group });
      ok = result.ok && ok;
      retryable = result.retryable || retryable;
      if (result.ok) acknowledgedEventIds.push(...group.map(event => event.eventId));
    }

    return { ok, retryable, ...(!ok && acknowledgedEventIds.length ? { acknowledgedEventIds } : {}) };
  }

  private async postJson(url: string, body: unknown): Promise<TransportResult> {
    const payload = JSON.stringify(body);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: payload.length < 60_000, // keepalive has payload size limits in most browsers
        credentials: "omit",
      });
      if (res.ok) return { ok: true, retryable: false };

      // TEMP DEBUG: surface *why* the backend rejected this payload.
      // res.text() must be read here - res.ok checks above don't consume
      // the body, and it can only be read once.
      const text = await res.text().catch(() => "<unreadable body>");
      console.error(`[Transport] ${res.status} ${res.statusText} from ${url}`, {
        responseBody: text,
        requestBody: body,
      });

      // 4xx (except 429) = client error, do not retry. 5xx / 429 = retryable.
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, retryable };
    } catch (err) {
      // Network failure - analytics must never throw into the host app.
      console.error(`[Transport] network error posting to ${url}`, err);
      return { ok: false, retryable: true };
    }
  }

  /** Unload-safe fire-and-forget send. No retry possible after this. */
  sendBeacon(events: AnalyticsEvent[]): boolean {
    if (!this.apiBase || events.length === 0) return true;

    let allOk = true;

    for (const [sessionId, group] of mapEventsBySession(events)) {
      allOk = this.beaconOrFallback(this.eventsUrl(), { sessionId, events: group }) && allOk;
    }
    return allOk;
  }

  private beaconOrFallback(url: string, body: unknown): boolean {
    const payload = JSON.stringify(body);
    try {
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        const blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon(url, blob)) return true;
      }
    } catch {
      /* fall through to fetch fallback */
    }

    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        credentials: "omit",
      }).catch(() => void 0);
      return true;
    } catch {
      return false;
    }
  }
}

function mapEventsBySession(events: AnalyticsEvent[]): Map<string, BackendIncomingEvent[]> {
  const groups = new Map<string, BackendIncomingEvent[]>();
  for (const [sessionId, eventsInSession] of groupBySessionId(events)) {
    const mapped = eventsInSession.map(mapToBackendEvent).filter(event => event !== null);
    if (mapped.length) groups.set(sessionId, mapped);
  }
  return groups;
}
