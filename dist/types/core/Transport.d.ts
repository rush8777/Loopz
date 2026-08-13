import type { AnalyticsEvent, AnyPayload } from "../types/events";
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
export declare class Transport {
    private apiBase;
    private siteId;
    constructor(apiBase: string, siteId: string);
    setEndpoint(apiBase: string): void;
    private eventsUrl;
    private replayUrl;
    /** Best-effort async send used during normal operation. */
    send(events: AnalyticsEvent<AnyPayload>[]): Promise<TransportResult>;
    private postJson;
    /** Unload-safe fire-and-forget send. No retry possible after this. */
    sendBeacon(events: AnalyticsEvent<AnyPayload>[]): boolean;
    private beaconOrFallback;
}
