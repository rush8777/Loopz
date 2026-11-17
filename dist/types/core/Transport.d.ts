import type { AnalyticsEvent, AnyPayload, CrawledElement } from "../types/events";
export interface TransportResult {
    ok: boolean;
    retryable: boolean;
    acknowledgedEventIds?: string[];
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
 *   {apiBase}/public/sites/{siteId}/elements - crawled element catalog (see sendElements)
 *
 * A single flush batch can span multiple sessions (rare, but possible
 * right at a session-expiry boundary) and mixes ordinary events with
 * session_replay_event entries, which are a different shape entirely
 * (see SessionReplayEventPayload) and belong on a different endpoint.
 * Both are split and grouped here before anything goes over the wire.
 *
 * Successful destinations are acknowledged separately when a batch has partial
 * failures. Batcher retries only unacknowledged events, so an unrelated failed
 * destination cannot suppress a committed identity refresh or replay its trigger.
 */
export declare class Transport {
    private apiBase;
    private siteId;
    constructor(apiBase: string, siteId: string);
    setEndpoint(apiBase: string): void;
    private eventsUrl;
    private replayUrl;
    private elementsUrl;
    /**
     * Sends a batch of crawled elements (see ElementCrawler.ts) to their
     * own endpoint - a page-level catalog snapshot, not a per-session
     * interaction stream, so it deliberately bypasses the batched
     * event queue/retry machinery `send`/`sendBeacon` use: crawls are
     * infrequent (page load + route change), so a simple best-effort
     * POST per crawl is the right amount of machinery, not the queue
     * built for continuous click/hover/scroll/cursor telemetry.
     */
    sendElements(pagePath: string, elements: CrawledElement[]): Promise<TransportResult>;
    /** Best-effort async send used during normal operation. */
    send(events: AnalyticsEvent<AnyPayload>[]): Promise<TransportResult>;
    private postJson;
    /** Unload-safe fire-and-forget send. No retry possible after this. */
    sendBeacon(events: AnalyticsEvent<AnyPayload>[]): boolean;
    private beaconOrFallback;
}
