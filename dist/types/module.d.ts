import { Analytics } from "./core/Analytics";
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
 * Guards against the double-invocation that React 18 StrictMode (and Next.js
 * dev fast refresh) can cause in effects: calling this twice for the same
 * instance is harmless because Analytics.init() itself is idempotent
 * (duplicate init() calls are logged and ignored, not double-applied), and
 * installUnloadHandlers only ever adds new listeners for the new instance
 * returned here - it never touches window.analytics or any other instance.
 */
export declare function createAnalytics(config: AnalyticsConfig): Analytics;
export type { AnalyticsConfig, ResolvedAnalyticsConfig, RageClickConfig, MoveCollectorConfig, ScrollCollectorConfig, HoverCollectorConfig, CursorCollectorConfig, QueueConfig, SessionReplayConfig, FeedbackConfig, } from "./types/config";
export type { FunnelStep } from "./types/funnel";
export type { EventType, AnalyticsEvent, AnyPayload, ClickEventPayload, ScrollEventPayload, MoveEventPayload, MovePoint, RageClickEventPayload, HoverEventPayload, CursorEventPayload, FunnelEventPayload, CustomEventPayload, IdentifyEventPayload, PageViewEventPayload, SessionReplayEventPayload, PageContext, ElementDescriptor, Viewport, ScrollPosition, } from "./types/events";
