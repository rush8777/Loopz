import { Analytics } from "./core/Analytics";
import { installUnloadHandlers } from "./core/unloadHandlers";
import type { AnalyticsConfig } from "./types/config";

/**
 * npm / ESM entry point - builds into dist/sdk.esm.js (see vite.config.ts,
 * mode "module").
 *
 * This is the entry point for `import` usage (React, Next.js, Vue, Svelte,
 * plain bundler apps, etc). Unlike src/index.ts (the CDN/IIFE entry), this
 * file has NO side effects: importing it does not touch `window`, install
 * any globals, or start anything on its own. You get a plain class/factory
 * and decide when and how many instances to create - the normal ES module
 * contract. The CDN script-tag method (see README) still works and is
 * unaffected; this is an additional, not a replacement, distribution path.
 *
 * Basic usage:
 *
 *   import { createAnalytics } from "loopz";
 *
 *   const analytics = createAnalytics({ siteId: "YOUR_SITE_ID" });
 *   analytics.event("signed_up");
 *   // ...
 *   analytics.destroy(); // e.g. on component unmount
 *
 * Or, for manual lifecycle control:
 *
 *   import { Analytics } from "loopz";
 *
 *   const analytics = new Analytics();
 *   analytics.init({ siteId: "YOUR_SITE_ID" });
 */
export { Analytics };

/**
 * Convenience factory: creates an Analytics instance, calls init(config)
 * immediately, and wires the same unload-safe flush behavior (visibility
 * change / pagehide) that the CDN build gets for free via the bootstrap
 * snippet. This is the recommended entry point for most framework
 * integrations - see examples/react and examples/nextjs.
 *
 * Idempotent across repeated calls: if an instance created by this
 * function is still active (i.e. destroy() hasn't been called on it),
 * calling createAnalytics() again returns that same instance instead of
 * creating a second one. This is what actually makes the function safe
 * under React 18 StrictMode's double-invoked effects (and Next.js dev
 * fast refresh) - without it, each call spins up its own
 * AutoCaptureEngine with its own DOM listeners, so every click, scroll,
 * hover, and page view on the page gets captured - and sent - twice.
 * Analytics.init()'s own idempotency guard doesn't help here: it only
 * protects a single instance against being init()'d twice, and each
 * `new Analytics()` here is a different instance.
 *
 * Only one createAnalytics()-managed instance is tracked at a time -
 * this matches the CDN build's single `window.analytics` global. If you
 * need multiple independent instances on one page (e.g. multiple
 * siteIds), construct `new Analytics()` and call `.init()` directly
 * instead of using this factory.
 */
let activeInstance: Analytics | null = null;

export function createAnalytics(config: AnalyticsConfig): Analytics {
  if (activeInstance) return activeInstance;

  const analytics = new Analytics();
  analytics.init(config);
  installUnloadHandlers(analytics);

  activeInstance = analytics;
  const baseDestroy = analytics.destroy.bind(analytics);
  analytics.destroy = () => {
    if (activeInstance === analytics) activeInstance = null;
    baseDestroy();
  };

  return analytics;
}

// Re-exported so consumers get full autocomplete/type-checking on init()
// config, custom event payloads, and funnel definitions without reaching
// into internal paths.
export type {
  AnalyticsConfig,
  ResolvedAnalyticsConfig,
  RageClickConfig,
  MoveCollectorConfig,
  ScrollCollectorConfig,
  HoverCollectorConfig,
  CursorCollectorConfig,
  QueueConfig,
  SessionReplayConfig,
  FeedbackConfig,
} from "./types/config";

export type { ExperienceKind, WidgetType, ExperienceTarget, RuntimeDefinition, DeliveredExperience } from "./experiences/types";

export type { FunnelStep } from "./types/funnel";

export type {
  EventType,
  AnalyticsEvent,
  AnyPayload,
  ClickEventPayload,
  ScrollEventPayload,
  MoveEventPayload,
  MovePoint,
  RageClickEventPayload,
  HoverEventPayload,
  CursorEventPayload,
  FunnelEventPayload,
  CustomEventPayload,
  IdentifyEventPayload,
  PageViewEventPayload,
  SessionReplayEventPayload,
  PageContext,
  ElementDescriptor,
  Viewport,
  ScrollPosition,
} from "./types/events";
