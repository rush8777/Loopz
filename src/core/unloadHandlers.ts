import { Analytics } from "./Analytics";

/**
 * Wires unload-safe flushing (visibilitychange -> hidden, pagehide) for a
 * live Analytics instance. Shared by both entry points:
 *   - api/PublicAPI.ts   (CDN/IIFE build, global window.analytics)
 *   - module.ts          (npm/ESM build, `createAnalytics()`)
 * so the two distribution methods never drift in unload behavior.
 */
export function installUnloadHandlers(analytics: Analytics): void {
  const flush = () => analytics.flushOnUnload();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
