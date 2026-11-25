import type { GeoAgentOptions } from "../experiences/geoAgent/types";
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
export interface FeedbackConfig {
    enabled: boolean;
    apiBase: string;
    flushIntervalMs: number;
    autoDismissMs: number;
}
export interface QueueConfig {
    maxBatchSize: number;
    maxWaitMs: number;
    maxQueueSize: number;
    maxRetries: number;
    retryBaseDelayMs: number;
}
export interface SessionReplayConfig {
    enabled: boolean;
    sampleMouseMovement: boolean;
    maskAllInputs: boolean;
    maskTextSelector?: string;
    blockSelector?: string;
    recordCanvas: boolean;
    collectFonts: boolean;
    checkoutEveryNms?: number;
    bundleUrl?: string;
}
export interface AnalyticsConfig {
    siteId: string;
    /**
     * Base URL of the analytics platform's backend, e.g.
     * "https://api.yourplatform.com" - NOT a literal collection path.
     * Analytics batches go to {endpoint}/public/sites/{siteId}/events.
     */
    endpoint?: string;
    /** Optional URL for the separately lazy-loaded experience runtime bundle. */
    experienceRuntimeBundleUrl?: string;
    /** Optional runtime URL and customer-issued visitor identity supplier for Geo Agent. */
    geoAgent?: GeoAgentOptions;
    /** Optional URL for the separately lazy-loaded visual editor bundle. */
    editorRuntimeBundleUrl?: string;
    /** @deprecated This option is ignored. */
    heatmapSnapshotBundleUrl?: string;
    debug?: boolean;
    autocapture?: {
        click?: boolean;
        scroll?: boolean;
        /** @deprecated This option is ignored. */
        move?: boolean;
        rageClick?: boolean;
        /** @deprecated This option is ignored. */
        hover?: boolean;
        /** @deprecated This option is ignored. */
        cursor?: boolean;
        /** @deprecated This option is ignored. */
        elementCrawler?: boolean;
    };
    rageClick?: Partial<RageClickConfig>;
    /** @deprecated This option is ignored. */
    move?: Partial<MoveCollectorConfig>;
    scroll?: Partial<ScrollCollectorConfig>;
    /** @deprecated This option is ignored. */
    hover?: Partial<HoverCollectorConfig>;
    /** @deprecated This option is ignored. */
    cursor?: Partial<CursorCollectorConfig>;
    queue?: Partial<QueueConfig>;
    /** @deprecated This option is ignored. */
    sessionReplay?: Partial<SessionReplayConfig>;
    /** @deprecated This option is ignored. */
    feedback?: Partial<FeedbackConfig>;
    sessionInactivityMs?: number;
    respectDoNotTrack?: boolean;
    /** Published visual experiences are enabled by default and fail independently from analytics capture. */
    experiences?: {
        enabled?: boolean;
    };
}
export interface ResolvedAnalyticsConfig extends Required<Omit<AnalyticsConfig, "heatmapSnapshotBundleUrl" | "autocapture" | "rageClick" | "move" | "scroll" | "hover" | "cursor" | "queue" | "sessionReplay" | "feedback" | "experiences" | "geoAgent">> {
    autocapture: {
        click: boolean;
        scroll: boolean;
        rageClick: boolean;
    };
    rageClick: RageClickConfig;
    scroll: ScrollCollectorConfig;
    queue: QueueConfig;
    experiences: {
        enabled: boolean;
    };
    geoAgent?: GeoAgentOptions;
}
