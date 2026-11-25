import type { GeoAgentOptions } from "../experiences/geoAgent/types";

export interface RageClickConfig {
  minClicks: number; // default 4
  timeWindowMs: number; // default 1000
  radiusPx: number; // default 40
  ignoreDoubleClickMs: number; // clicks closer together than this are considered part of a natural double click burst, still counted but never a 2-click rage
}

export interface MoveCollectorConfig {
  samplesPerSecond: number; // 8-15
  minMovementPx: number; // ignore movement smaller than this
}

export interface ScrollCollectorConfig {
  throttleMs: number;
  milestones: number[]; // e.g. [25, 50, 75, 90, 100]
}

export interface HoverCollectorConfig {
  minHoverMs: number; // hovers shorter than this (accidental pass-through) are dropped, not sent
}

export interface CursorCollectorConfig {
  sampleInterval: number; // ms - minimum time between emitted samples
  minimumDistance: number; // px - emit early if the cursor moved at least this far
  pauseThreshold: number; // ms - emit one stationary sample after this much inactivity
}

export interface FeedbackConfig {
  enabled: boolean;
  apiBase: string;
  flushIntervalMs: number;
  autoDismissMs: number;
}

export interface QueueConfig {
  maxBatchSize: number; // 50
  maxWaitMs: number; // 5000
  maxQueueSize: number; // hard cap on in-memory events
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
  experiences?: { enabled?: boolean };
}

export interface ResolvedAnalyticsConfig extends Required<Omit<AnalyticsConfig, "heatmapSnapshotBundleUrl" | "autocapture" | "rageClick" | "move" | "scroll" | "hover" | "cursor" | "queue" | "sessionReplay" | "feedback" | "experiences" | "geoAgent">> {
  autocapture: { click: boolean; scroll: boolean; rageClick: boolean };
  rageClick: RageClickConfig;
  scroll: ScrollCollectorConfig;
  queue: QueueConfig;
  experiences: { enabled: boolean };
  geoAgent?: GeoAgentOptions;
}
