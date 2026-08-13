/**
 * Next.js (App Router) usage example. Uses next/script so the snippet
 * loads with the same async, non-blocking behavior as the plain-HTML
 * install - Next's <Script strategy="afterInteractive"> is the
 * recommended placement for third-party analytics.
 *
 * Place this in app/layout.tsx.
 */
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}

        <Script id="analytics-bootstrap" strategy="afterInteractive">
          {`
            (function (w, d, s, u) {
              w.analytics = w.analytics || { q: [], init: function () { this.q.push(["init", ...arguments]); } };
              ["start","stop","destroy","event","identify","page","defineFunnel","enableDebug","disableDebug"]
                .forEach(function (m) { w.analytics[m] = w.analytics[m] || function () { w.analytics.q.push([m, ...arguments]); }; });
              var script = d.createElement(s);
              script.async = true;
              script.src = u + "?siteId=YOUR_SITE_ID";
              d.head.appendChild(script);
            })(window, document, "script", "https://cdn.yourdomain.com/sdk.js");

            analytics.init({ siteId: "YOUR_SITE_ID" });
          `}
        </Script>
      </body>
    </html>
  );
}

// Next.js client-side navigations use the History API under the hood, so
// RouteObserver's pushState/replaceState patching picks up route changes
// automatically - no next/router-specific adapter needed.
