# Performance

## Bundle size

The build emits a readable core SDK and a minified SDK at `dist/sdk.min.js`
and `dist/v1.js`. The two minified core assets are about 46 KB each (14 KB
gzipped). The browser loads the in-app experiences and editor bundles on demand.

## Techniques used

- **Async bootstrap.** The inline snippet only creates a queue stub and
  appends an `async` `<script>` tag. It never blocks page rendering.
- **Event delegation.** `ClickCollector` attaches exactly one listener
  (`document`, capture phase) regardless of DOM size — no per-element
  listener attachment, no `MutationObserver` polling for new elements.
- **Scroll throttling.** `ScrollCollector` samples at most once per
  animation frame and records milestones once per page view.
- **Passive listeners.** `scroll`, `pointermove`/`mousemove`, and `click`
  listeners are registered with `{ passive: true }` where the collector
  never calls `preventDefault()`, so the browser doesn't have to wait for
  the handler before scrolling/painting.
- **Batching, not per-event requests.** `Batcher` flushes at 50 events or
  5 seconds, whichever comes first — never one HTTP request per click.
- **Bounded memory.** `EventQueue` enforces a hard `maxQueueSize` and drops
  the oldest scroll milestones first, then the oldest remaining events rather than growing unbounded if the network is unavailable.
- **Unload-safe delivery.** `visibilitychange`/`pagehide` trigger a
  synchronous `navigator.sendBeacon()` flush (falling back to
  `fetch(..., { keepalive: true })`) so the last batch isn't lost when the
  tab closes — without blocking navigation.
- **No synchronous network calls, ever.** All transport is async or
  beacon-based.
- **Failure isolation.** Network failures are caught in `Transport` and
  retried with exponential backoff up to `maxRetries`, then dropped. A
  failing ingestion API can never throw an uncaught error into the host
  page, and retries are capped so a down backend can't be spammed
  indefinitely.
- **No React at runtime.** The compiled SDK is framework-independent
  vanilla TypeScript/JS; React only appears in `examples/react` and
  `examples/nextjs` as consumers of the SDK, never as a dependency of it.
