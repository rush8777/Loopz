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
  maxBatchSize: number; // 50
  maxWaitMs: number; // 5000
  maxQueueSize: number; // hard cap on in-memory events
  maxRetries: number;
  retryBaseDelayMs: number;
}

/**
 * Session replay (rrweb) configuration. Off by default - this is an
 * opt-in capability, never started implicitly by the rest of the SDK.
 */
export interface SessionReplayConfig {
  enabled: boolean; // default false - recording never starts unless explicitly enabled
  sampleMouseMovement: boolean; // use rrweb's mouse move sampling instead of recording every event
  maskAllInputs: boolean; // mask all form input values, not just sensitive ones
  maskTextSelector?: string; // CSS selector for additional text nodes to mask, beyond form fields
  blockSelector?: string; // CSS selector for elements to exclude from recording entirely
  recordCanvas: boolean; // canvas recording is expensive - opt-in only
  collectFonts: boolean; // capture @font-face rules for higher-fidelity replay
  checkoutEveryNms?: number; // periodic full snapshot to bound replay reconstruction cost, ms
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
  /** Optional URL for the separately lazy-loaded sdk-heatmap bundle (useful for ESM/bundled integrations). */
  heatmapSnapshotBundleUrl?: string;
  debug?: boolean;
  autocapture?: {
    click?: boolean;
    scroll?: boolean;
    move?: boolean;
    rageClick?: boolean;
    hover?: boolean;
    cursor?: boolean;
    /** Scans the DOM for interactive elements on SDK initialization + route change, so Pages can catalog their elements without depending on behavioral capture. See ElementCrawler.ts. */
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
  /** Published visual experiences are enabled by default and fail independently from analytics capture. */
  experiences?: { enabled?: boolean };
}

export interface ResolvedAnalyticsConfig extends Required<Omit<AnalyticsConfig, "autocapture" | "rageClick" | "move" | "scroll" | "hover" | "cursor" | "queue" | "sessionReplay" | "feedback" | "experiences">> {
  autocapture: Required<NonNullable<AnalyticsConfig["autocapture"]>>;
  rageClick: RageClickConfig;
  move: MoveCollectorConfig;
  scroll: ScrollCollectorConfig;
  hover: HoverCollectorConfig;
  cursor: CursorCollectorConfig;
  queue: QueueConfig;
  sessionReplay: SessionReplayConfig;
  feedback: FeedbackConfig;
  experiences: { enabled: boolean };
}
