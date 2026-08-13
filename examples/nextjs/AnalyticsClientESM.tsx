/**
 * Next.js (App Router) usage example using the real ESM import instead of
 * the inline snippet in app-layout-example.tsx. Both are valid - use
 * whichever fits your setup:
 *   - app-layout-example.tsx: zero npm dependency, loads from a CDN URL,
 *     works even if this package isn't in your package.json.
 *   - this file: `npm install loopz`, tree-shakeable,
 *     typed, no CDN round trip.
 *
 * Must be a Client Component ("use client") since it touches window/
 * lifecycle effects - Server Components can't run this. Mount it once
 * near the root, e.g. in app/layout.tsx: <AnalyticsClientESM siteId="..." />
 * alongside {children}.
 */
"use client";

import { useEffect, useRef } from "react";
import { createAnalytics, type Analytics } from "loopz";

export function AnalyticsClientESM({ siteId }: { siteId: string }) {
  const analyticsRef = useRef<Analytics | null>(null);

  useEffect(() => {
    const analytics = createAnalytics({ siteId });
    analyticsRef.current = analytics;

    return () => {
      analytics.destroy();
      analyticsRef.current = null;
    };
  }, [siteId]);

  // Renders nothing - this component's only job is the lifecycle effect.
  return null;
}

// app/layout.tsx:
//
//   import { AnalyticsClientESM } from "./AnalyticsClientESM";
//
//   export default function RootLayout({ children }: { children: React.ReactNode }) {
//     return (
//       <html lang="en">
//         <body>
//           <AnalyticsClientESM siteId="YOUR_SITE_ID" />
//           {children}
//         </body>
//       </html>
//     );
//   }
//
// Next.js client-side navigations use the History API under the hood, so
// RouteObserver's pushState/replaceState patching picks up route changes
// automatically - no next/router-specific adapter needed, same as the
// Script-tag version.
