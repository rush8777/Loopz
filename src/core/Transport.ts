import type { AnalyticsEvent, AnyPayload, SessionReplayEventPayload } from "../types/events";
import { mapToBackendEvent, mapToBackendReplayEvent, groupBySessionId } from "./backendMapping";

export interface TransportResult {
  ok: boolean;
  retryable: boolean;
}

/**
 * Sole owner of network I/O. Collectors and the queue never call fetch()
 * directly - this keeps delivery strategy (beacon vs fetch, retries,
 * unload-safety, and now backend-shape translation) in one place.
 *
 * `apiBase` is the analytics platform's base URL - this class derives
 * the two real routes itself:
 *   {apiBase}/public/sites/{siteId}/events   - interaction events
 *   {apiBase}/public/sites/{siteId}/replay   - rrweb session replay
 *
 * A single flush batch can span multiple sessions (rare, but possible
 * right at a session-expiry boundary) and mixes ordinary events with
 * session_replay_event entries, which are a different shape entirely
 * (see SessionReplayEventPayload) and belong on a different endpoint.
 * Both are split and grouped here before anything goes over the wire.
 *
 * Known limitation: Batcher retries a failed flush by requeuing the
 * *entire* original batch (see Batcher.flush). If this batch fanned out
 * into multiple destination requests and only some of them failed, a
 * retry will resend the ones that already succeeded. This is an
 * at-least-once delivery tradeoff, same class of risk every fire-and-
 * forget analytics pipeline accepts - true exactly-once would need
 * per-destination retry bookkeeping in the queue itself, which is a
 * larger change than this pass makes. The backend is the right place to
 * dedupe if this ever matters in practice (e.g. an idempotency key).
 */
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

  private replayUrl(): string {
    return `${this.apiBase}/public/sites/${this.siteId}/replay`;
  }

  /** Best-effort async send used during normal operation. */
  async send(events: AnalyticsEvent<AnyPayload>[]): Promise<TransportResult> {
    if (!this.apiBase || events.length === 0) return { ok: true, retryable: false };

    const { standardGroups, replayGroups } = partition(events);
    const results: TransportResult[] = [];

    for (const [sessionId, group] of standardGroups) {
      results.push(await this.postJson(this.eventsUrl(), { sessionId, events: group }));
    }
    for (const [sessionId, group] of replayGroups) {
      results.push(await this.postJson(this.replayUrl(), { sessionId, events: group }));
    }

    if (results.length === 0) return { ok: true, retryable: false }; // everything in this batch was of a type this backend doesn't accept
    const ok = results.every((r) => r.ok);
    const retryable = !ok && results.some((r) => r.retryable);
    return { ok, retryable };
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
  sendBeacon(events: AnalyticsEvent<AnyPayload>[]): boolean {
    if (!this.apiBase || events.length === 0) return true;

    const { standardGroups, replayGroups } = partition(events);
    let allOk = true;

    for (const [sessionId, group] of standardGroups) {
      allOk = this.beaconOrFallback(this.eventsUrl(), { sessionId, events: group }) && allOk;
    }
    for (const [sessionId, group] of replayGroups) {
      allOk = this.beaconOrFallback(this.replayUrl(), { sessionId, events: group }) && allOk;
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

function partition(events: AnalyticsEvent<AnyPayload>[]): {
  standardGroups: Map<string, NonNullable<ReturnType<typeof mapToBackendEvent>>[]>;
  replayGroups: Map<string, ReturnType<typeof mapToBackendReplayEvent>[]>;
} {
  const standardEvents = events.filter((e) => e.type !== "session_replay_event");
  const replayEvents = events.filter(
    (e): e is AnalyticsEvent<SessionReplayEventPayload> => e.type === "session_replay_event"
  );

  const standardGroups = new Map<string, NonNullable<ReturnType<typeof mapToBackendEvent>>[]>();
  for (const [sessionId, group] of groupBySessionId(standardEvents)) {
    const mapped = group.map(mapToBackendEvent).filter((e): e is NonNullable<typeof e> => e !== null);
    if (mapped.length > 0) standardGroups.set(sessionId, mapped);
  }

  const replayGroups = new Map<string, ReturnType<typeof mapToBackendReplayEvent>[]>();
  for (const [sessionId, group] of groupBySessionId(replayEvents)) {
    replayGroups.set(sessionId, group.map(mapToBackendReplayEvent));
  }

  return { standardGroups, replayGroups };
}