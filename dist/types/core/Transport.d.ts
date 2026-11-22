import type { AnalyticsEvent } from "../types/events";
export interface TransportResult {
    ok: boolean;
    retryable: boolean;
    acknowledgedEventIds?: string[];
}
export declare class Transport {
    private apiBase;
    private siteId;
    constructor(apiBase: string, siteId: string);
    setEndpoint(apiBase: string): void;
    private eventsUrl;
    /** Best-effort async send used during normal operation. */
    send(events: AnalyticsEvent[]): Promise<TransportResult>;
    private postJson;
    /** Unload-safe fire-and-forget send. No retry possible after this. */
    sendBeacon(events: AnalyticsEvent[]): boolean;
    private beaconOrFallback;
}
