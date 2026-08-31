import type { AnalyticsConfig, ResolvedAnalyticsConfig } from "../types/config";

export function resolveConfig(input: AnalyticsConfig): ResolvedAnalyticsConfig {
  if (!input || !input.siteId) {
    throw new Error("[Analytics] init() requires a `siteId`");
  }

  return {
    siteId: input.siteId,
    endpoint: input.endpoint || "https://api.example.com",
    heatmapSnapshotBundleUrl: input.heatmapSnapshotBundleUrl ?? "",
    debug: input.debug ?? false,
    sessionInactivityMs: input.sessionInactivityMs ?? 30 * 60 * 1000,
    respectDoNotTrack: input.respectDoNotTrack ?? false,
    autocapture: {
      click: input.autocapture?.click ?? true,
      scroll: input.autocapture?.scroll ?? true,
      move: input.autocapture?.move ?? true,
      rageClick: input.autocapture?.rageClick ?? true,
      hover: input.autocapture?.hover ?? true,
      cursor: input.autocapture?.cursor ?? true,
      elementCrawler: input.autocapture?.elementCrawler ?? true,
    },
    rageClick: {
      minClicks: input.rageClick?.minClicks ?? 4,
      timeWindowMs: input.rageClick?.timeWindowMs ?? 1000,
      radiusPx: input.rageClick?.radiusPx ?? 40,
      ignoreDoubleClickMs: input.rageClick?.ignoreDoubleClickMs ?? 250,
    },
    move: {
      samplesPerSecond: input.move?.samplesPerSecond ?? 12,
      minMovementPx: input.move?.minMovementPx ?? 2,
    },
    scroll: {
      throttleMs: input.scroll?.throttleMs ?? 100,
      milestones: input.scroll?.milestones ?? [25, 50, 75, 90, 100],
    },
    hover: {
      minHoverMs: input.hover?.minHoverMs ?? 150,
    },
    cursor: {
      sampleInterval: input.cursor?.sampleInterval ?? 50,
      minimumDistance: input.cursor?.minimumDistance ?? 12,
      pauseThreshold: input.cursor?.pauseThreshold ?? 300,
    },
    queue: {
      maxBatchSize: input.queue?.maxBatchSize ?? 50,
      maxWaitMs: input.queue?.maxWaitMs ?? 5000,
      maxQueueSize: input.queue?.maxQueueSize ?? 2000,
      maxRetries: input.queue?.maxRetries ?? 3,
      retryBaseDelayMs: input.queue?.retryBaseDelayMs ?? 1000,
    },
    sessionReplay: {
      // Recording must never start unless a site explicitly opts in.
      enabled: input.sessionReplay?.enabled ?? false,
      sampleMouseMovement: input.sessionReplay?.sampleMouseMovement ?? true,
      maskAllInputs: input.sessionReplay?.maskAllInputs ?? true,
      maskTextSelector: input.sessionReplay?.maskTextSelector,
      blockSelector: input.sessionReplay?.blockSelector,
      recordCanvas: input.sessionReplay?.recordCanvas ?? false,
      collectFonts: input.sessionReplay?.collectFonts ?? false,
      checkoutEveryNms: input.sessionReplay?.checkoutEveryNms ?? 2 * 60 * 1000,
      bundleUrl: input.sessionReplay?.bundleUrl,
    },
    feedback: {
      enabled: input.feedback?.enabled ?? false,
      apiBase: input.feedback?.apiBase ?? "https://platform.example.com",
      flushIntervalMs: input.feedback?.flushIntervalMs ?? 3000,
      autoDismissMs: input.feedback?.autoDismissMs ?? 12_000,
    },
  };
}
