/**
 * React usage example - real ESM import, no <script> tag, no injected
 * IIFE snippet, no window globals. Works the same way in any bundler-based
 * React setup (Vite, CRA, Remix, etc). For Next.js App Router, see
 * examples/nextjs/AnalyticsClientESM.tsx instead (client components need
 * a couple of Next-specific touches).
 *
 * Ordinary buttons/links elsewhere in your React tree require NO
 * additional tracking code - autocapture handles them the same as in
 * plain HTML.
 */
import { createContext, useContext, useEffect, useRef } from "react";
import { createAnalytics, type Analytics, type AnalyticsConfig } from "loopz";

const AnalyticsContext = createContext<Analytics | null>(null);

export function AnalyticsProvider({
  config,
  children,
}: {
  config: AnalyticsConfig;
  children: React.ReactNode;
}) {
  const analyticsRef = useRef<Analytics | null>(null);

  useEffect(() => {
    // createAnalytics() -> init() is idempotent, and React 18 StrictMode's
    // deliberate double-invocation of effects in development is harmless
    // here for the same reason - see the doc comment on createAnalytics().
    const analytics = createAnalytics(config);
    analyticsRef.current = analytics;

    return () => {
      analytics.destroy();
      analyticsRef.current = null;
    };
    // config is only read on mount - pass a stable object (e.g. defined
    // outside the component, or memoized) rather than an inline literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnalyticsContext.Provider value={analyticsRef.current}>{children}</AnalyticsContext.Provider>
  );
}

/**
 * Access the live Analytics instance for manual calls, e.g.
 *   const analytics = useAnalytics();
 *   analytics?.event("added_to_cart", { sku });
 * Returns null until the provider's effect has run (first render), so
 * callers should guard with `?.` or check for null.
 */
export function useAnalytics(): Analytics | null {
  return useContext(AnalyticsContext);
}

// Usage:
//
// <AnalyticsProvider config={{ siteId: "site_123" }}>
//   <App />
// </AnalyticsProvider>
//
// Then anywhere in the tree:
//   <button onClick={addToCart}>Add to cart</button>
// is captured automatically - no analytics code in the click handler.
// For custom events: const analytics = useAnalytics(); analytics?.event(...)
