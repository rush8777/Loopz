import type { AnalyticsConfig, ResolvedAnalyticsConfig } from "../types/config";

export function resolveConfig(input: AnalyticsConfig): ResolvedAnalyticsConfig {
  if (!input || !input.siteId) {
    throw new Error("[Analytics] init() requires a `siteId`");
  }

  return {
    siteId: input.siteId,
    endpoint: input.endpoint || "https://api.movcues.com",
    experienceRuntimeBundleUrl: input.experienceRuntimeBundleUrl ?? "",
    geoAgent: input.geoAgent,
    editorRuntimeBundleUrl: input.editorRuntimeBundleUrl ?? "",
    debug: input.debug ?? true,
    sessionInactivityMs: input.sessionInactivityMs ?? 30 * 60 * 1000,
    respectDoNotTrack: input.respectDoNotTrack ?? false,
    autocapture: {
      click: input.autocapture?.click ?? true,
      scroll: input.autocapture?.scroll ?? true,
      rageClick: input.autocapture?.rageClick ?? true,
    },
    rageClick: {
      minClicks: input.rageClick?.minClicks ?? 4,
      timeWindowMs: input.rageClick?.timeWindowMs ?? 1000,
      radiusPx: input.rageClick?.radiusPx ?? 40,
      ignoreDoubleClickMs: input.rageClick?.ignoreDoubleClickMs ?? 250,
    },
    scroll: {
      throttleMs: input.scroll?.throttleMs ?? 100,
      milestones: input.scroll?.milestones ?? [25, 50, 75, 90, 100],
    },
    queue: {
      maxBatchSize: input.queue?.maxBatchSize ?? 50,
      maxWaitMs: input.queue?.maxWaitMs ?? 5000,
      maxQueueSize: input.queue?.maxQueueSize ?? 2000,
      maxRetries: input.queue?.maxRetries ?? 3,
      retryBaseDelayMs: input.queue?.retryBaseDelayMs ?? 1000,
    },
    experiences: { enabled: input.experiences?.enabled ?? true },
  };
}
