export interface RageClickConfig {
    minClicks: number;
    timeWindowMs: number;
    radiusPx: number;
    ignoreDoubleClickMs: number;
}
export interface MoveCollectorConfig {
    samplesPerSecond: number;
    minMovementPx: number;
}
export interface ScrollCollectorConfig {
    throttleMs: number;
    milestones: number[];
}
export interface HoverCollectorConfig {
    minHoverMs: number;
}
export interface CursorCollectorConfig {
    sampleInterval: number;
    minimumDistance: number;
    pauseThreshold: number;
}
/**
 * Live pattern-triggered feedback popups. Off by default - same
 * "never live until explicitly enabled" principle as sessionReplay.
 * apiBase points at the analytics platform's own backend (the pattern
 * matcher + config service), NOT the customer's `endpoint` - those are
 * two different destinations for two different purposes.
 */
export interface FeedbackConfig {
    enabled: boolean;
    apiBase: string;
    /** How often to flush buffered events to the pattern matcher. Independent of the main QueueConfig - this pipeline is smaller and needs to be timelier for triggers to feel "live". */
    flushIntervalMs: number;
    /** Auto-dismiss a shown popup after this many ms. 0 = never auto-dismiss. */
    autoDismissMs: number;
}
export interface QueueConfig {
    maxBatchSize: number;
    maxWaitMs: number;
    maxQueueSize: number;
    maxRetries: number;
    retryBaseDelayMs: number;
}
/**
 * Session replay (rrweb) configuration. Off by default - this is an
 * opt-in capability, never started implicitly by the rest of the SDK.
 */
export interface SessionReplayConfig {
    enabled: boolean;
    sampleMouseMovement: boolean;
    maskAllInputs: boolean;
    maskTextSelector?: string;
    blockSelector?: string;
    recordCanvas: boolean;
    collectFonts: boolean;
    checkoutEveryNms?: number;
    /**
     * URL of the separate rrweb replay bundle (dist/sdk-replay.js), lazily
     * loaded only when recording actually starts. Defaults to sitting
     * alongside the main SDK script (same directory, "sdk-replay.js" /
     * "sdk-replay.min.js"). Override this if you host the replay bundle
     * somewhere else, e.g. a different CDN path.
     */
    bundleUrl?: string;
}
export interface AnalyticsConfig {
    siteId: string;
    /**
     * Base URL of the analytics platform's backend, e.g.
     * "https://api.yourplatform.com" - NOT a literal collection path.
     * Transport derives the actual routes itself:
     *   {endpoint}/public/sites/{siteId}/events   - interaction events
     *   {endpoint}/public/sites/{siteId}/replay   - rrweb session replay
     */
    endpoint?: string;
    debug?: boolean;
    autocapture?: {
        click?: boolean;
        scroll?: boolean;
        move?: boolean;
        rageClick?: boolean;
        hover?: boolean;
        cursor?: boolean;
        /** Scans the DOM for interactive elements on start + route change, so the dashboard can catalog every element on the site, not just ones someone has clicked/hovered. See ElementCrawler.ts. */
        elementCrawler?: boolean;
    };
    rageClick?: Partial<RageClickConfig>;
    move?: Partial<MoveCollectorConfig>;
    scroll?: Partial<ScrollCollectorConfig>;
    hover?: Partial<HoverCollectorConfig>;
    cursor?: Partial<CursorCollectorConfig>;
    queue?: Partial<QueueConfig>;
    sessionReplay?: Partial<SessionReplayConfig>;
    feedback?: Partial<FeedbackConfig>;
    sessionInactivityMs?: number;
    respectDoNotTrack?: boolean;
}
export interface ResolvedAnalyticsConfig extends Required<Omit<AnalyticsConfig, "autocapture" | "rageClick" | "move" | "scroll" | "hover" | "cursor" | "queue" | "sessionReplay" | "feedback">> {
    autocapture: Required<NonNullable<AnalyticsConfig["autocapture"]>>;
    rageClick: RageClickConfig;
    move: MoveCollectorConfig;
    scroll: ScrollCollectorConfig;
    hover: HoverCollectorConfig;
    cursor: CursorCollectorConfig;
    queue: QueueConfig;
    sessionReplay: SessionReplayConfig;
    feedback: FeedbackConfig;
}
