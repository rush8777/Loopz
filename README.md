# Autocapture Analytics SDK (MVP)

The Movcues SDK records page views, interactive clicks, scroll milestones,
rage clicks, and custom events. It also delivers published in-app experiences.

```html
<head>
<script async src="https://cdn.movcues.com/v1.js" data-site-id="YOUR_SITE_ID"></script>
</head>
```

That's the entire installation. No other code, no imports, no tracking
attributes on your buttons or links. The core reads `data-site-id` and
initializes itself. The experience delivery and visual editor bundles are fetched only when needed.

Existing manual and queued integrations remain supported. Loading `sdk.js`
without `data-site-id` and calling `analytics.init({...})` still works, and a
queued manual `init` wins before auto-initialization so collectors are never
started twice.

```html
<button>Add to cart</button>   <!-- automatically captured, no code needed -->
```

### Or, as a real ES module (React, Next.js, Vue, or any bundler)

If your app already goes through a bundler, `npm install` the package and
`import` it directly - no `<script>` tag, no injected snippet, no
`window` globals:

```bash
npm install @movcues/sdk
```

```javascript
import { createAnalytics } from "@movcues/sdk";

const analytics = createAnalytics({ siteId: "YOUR_SITE_ID" });
analytics.event("app_started");
```

This is a plain side-effect-free ES module - `import`ing it does nothing
on its own until you call `createAnalytics()` (or `new Analytics()` +
`init()` for manual lifecycle control). Both installation methods build
from the same source and stay in sync; use whichever fits your app. See
`examples/react/AnalyticsProvider.tsx`, `examples/nextjs/AnalyticsClientESM.tsx`,
and `examples/esm/basic-usage.ts` for framework-specific wiring
(the original `examples/nextjs/app-layout-example.tsx` still shows the
CDN/`<Script>` method for anyone who'd rather not add an npm dependency).

## What's automatic vs. manual

| Automatic (zero code) | Manual (a few lines) |
|---|---|
| Interactive clicks | `analytics.event(name)` for custom business events |
| Scroll milestones | `analytics.identify(userId, traits)` |
| Rage click detection | `analytics.defineFunnel(name, steps)` |
| SPA route change / page views | |

## Project structure

```
src/
  bootstrap/    reference implementation of the tiny inline snippet
  core/         Analytics orchestrator, session, queue, batcher, transport
  autocapture/  AutoCaptureEngine and individual collectors
  privacy/      centralized PrivacyFilter + sensitive-element detection
  dom/          selector generation, SPA route observation, DOM helpers
  api/          public window.analytics API + command-queue draining
  types/        shared TypeScript types (events, config, funnels)
  index.ts      CDN entry point (builds into dist/sdk.js, sdk.min.js, and v1.js)
  module.ts     npm/ESM entry point (builds into dist/sdk.esm.js)
bootstrap/
  install-snippet.html   copy-pasteable snippet
examples/
  plain-html/   working demo site (see below)
  react/        ESM usage via a React context provider
  nextjs/       both the CDN <Script> method and the ESM method
  esm/          minimal framework-agnostic ESM usage
dist/
  sdk.js                    readable core IIFE build
  sdk.min.js / v1.js        minified core IIFE builds
  sdk-experiences(.min).js  lazy experience-delivery runtime
  sdk-editor(.min).js       lazy visual-editor runtime
  sdk.esm.js                single-file ES module build (npm import)
  types/                    .d.ts declarations for the ESM build
docs/
  ARCHITECTURE.md, EVENT_SCHEMA.md, PRIVACY.md, PERFORMANCE.md
```

## Building

```bash
npm install
npm run build
```

`npm run build` cleans `dist` once, then runs Vite for each target (core,
experience and editor IIFEs in readable/minified forms,
the `v1.js` CDN alias, and the ES module build) and then `tsc` to emit
`.d.ts` declarations. The IIFE bundles are dependency-free — no React, no
runtime dependencies — safe to serve from any static CDN. The ES module has
no side effects on import and uses module-native experience/editor factories,
so npm consumers do not depend on CDN globals.

## Running the demo

The demo is a static page, no dev server required:

```bash
npm run build
open examples/plain-html/index.html   # or serve the folder with any static server
```

It loads `../dist/sdk.js` relative to itself, so build first. The demo
includes: a header/hero, product cards (click capture), a long article
(scroll milestones), a pricing section, a 4-step checkout funnel driven by
`history.pushState`, a dedicated "rage zone" button, and a contact form that
demonstrates the privacy engine (`data-private` fields are never captured).
Click "Enable debug log" at the bottom to see `[Analytics]` debug output
live on the page.

## Public API

```javascript
analytics.init(config)          // manual install/configuration; siteId is mandatory
analytics.start()                // resume autocapture if stopped
analytics.stop()                 // pause autocapture, keep queued events
analytics.destroy()              // full teardown, removes all listeners
analytics.event(name, props?)    // custom business event
analytics.identify(userId, traits?)
analytics.page()                 // force a page_view event
analytics.defineFunnel(name, steps)
analytics.enableDebug()
analytics.disableDebug()
```

### `init(config)`

```typescript
{
  siteId: string;                 // required
  endpoint?: string;               // ingestion API URL
  debug?: boolean;
  autocapture?: {                  // all default true
    click?: boolean; scroll?: boolean; rageClick?: boolean;
  };
  rageClick?: { minClicks?: number; timeWindowMs?: number; radiusPx?: number };
  scroll?: { milestones?: number[] };
  queue?: { maxBatchSize?: number; maxWaitMs?: number; maxQueueSize?: number; maxRetries?: number };
  sessionInactivityMs?: number;    // default 30 min
  respectDoNotTrack?: boolean;     // default false
}
```

### `defineFunnel(name, steps)`

Page-based:
```javascript
analytics.defineFunnel("checkout", ["/cart", "/shipping", "/payment", "/success"]);
```

Event-based:
```javascript
analytics.defineFunnel("signup", [
  { event: "signup_started" },
  { event: "email_verified" },
  { event: "onboarding_completed" }
]);
```

Further documentation: see `docs/ARCHITECTURE.md`, `docs/EVENT_SCHEMA.md`,
`docs/PRIVACY.md`, and `docs/PERFORMANCE.md`.

Retired capture options in existing configurations are ignored. See the [release availability](https://www.movcues.com/docs/reference/availability/) reference for the supported SDK surface.

### Geo Agent

Published Geo Agent widgets are loaded separately as `sdk-geo-agent.js` or `sdk-geo-agent.min.js` in the CDN build. Keep those files alongside the matching experience runtime. ESM integrations load a separate generated chunk. The normal SDK installation needs no additional call for an anonymous assistant. For verified segment audiences, provide a customer-issued visitor token through the optional `geoAgent.identityToken` callback, and call the existing SDK identify and reset methods when users sign in or out. The backend's `docs/geo-agent.md` describes signing and the visitor API.
