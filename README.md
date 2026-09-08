# Autocapture Analytics SDK (MVP)

A Hotjar-style behavioral analytics SDK. Install one script tag, get
**Click Maps (interactive + raw), Scroll Maps, Move Maps, Hover Duration,
Cursor Path Sampling, Rage Click detection, and Funnels** — with zero
manual instrumentation.

```html
<head>
<script async src="https://cdn.movcues.com/v1.js" data-site-id="YOUR_SITE_ID"></script>
</head>
```

That's the entire installation. No other code, no imports, no tracking
attributes on your buttons or links. The core reads `data-site-id` and
initializes itself. Experience delivery, visual editor, replay, and heatmap
capture code remain separate CDN resources and are fetched only when needed.

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
npm install movecues
```

```javascript
import { createAnalytics } from "movecues";

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
| Click Maps (interactive + raw, one event, one flag) | `analytics.event(name)` for custom business events |
| Scroll Maps | `analytics.identify(userId, traits)` |
| Move Maps | `analytics.defineFunnel(name, steps)` — defined once |
| Hover duration (interactive elements only) | |
| Cursor path sampling (sparse, with pause detection) | |
| Rage click detection | |
| SPA route change / page views | |

## Project structure

```
src/
  bootstrap/    reference implementation of the tiny inline snippet
  core/         Analytics orchestrator, session, queue, batcher, transport
  autocapture/  AutoCaptureEngine + 5 independent collectors
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
  sdk-replay(.min).js       lazy rrweb runtime
  sdk-heatmap(.min).js      lazy snapshot runtime
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
experiences, editor, replay, and heatmap IIFEs in readable/minified forms,
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
    click?: boolean; scroll?: boolean; move?: boolean; rageClick?: boolean; hover?: boolean; cursor?: boolean;
  };
  rageClick?: { minClicks?: number; timeWindowMs?: number; radiusPx?: number };
  move?: { samplesPerSecond?: number; minMovementPx?: number };
  scroll?: { milestones?: number[] };
  hover?: { minHoverMs?: number };  // default 150 - shorter hovers are dropped, not sent
  cursor?: { sampleInterval?: number; minimumDistance?: number; pauseThreshold?: number };
  // sampleInterval default 50ms, minimumDistance default 12px, pauseThreshold default 300ms
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

> **`move` vs `cursor`:** `move` (from `MoveCollector`) batches
> velocity/direction-annotated points for Move Maps. `cursor` (from
> `CursorCollector`) emits individual, minimal `{timestamp, x, y,
> viewportWidth, viewportHeight}` samples, gated by a time-or-distance
> threshold with pause detection, intended for lighter-weight cursor path
> reconstruction. They're independent collectors and can be toggled
> separately via `autocapture.move` / `autocapture.cursor`.

## Explicitly out of scope for this MVP

Session replay, surveys, feedback widgets, AI features, user interviews,
error monitoring, dashboard UI, heatmap *visualization* UI, auth, billing.
The SDK captures raw behavioral data only; visualization is a backend/
dashboard concern layered on top later. The architecture (independent
collectors registered with `AutoCaptureEngine`, a single `EventBus`, a
privacy-filtered pipeline) is designed so those features can be added
without reworking the core.
