# Performance

## Bundle size

`npm run build` produces:

- `dist/sdk.js` — readable build (~45KB, ~11KB gzipped)
- `dist/sdk.min.js` — minified build (~26KB, **~7.9KB gzipped**)

Hover tracking, the interactive/raw click discriminator, and cursor path
sampling together added ~1.6KB gzipped on top of the original five-collector
MVP (7.00KB → 7.93KB), since all three reuse existing infrastructure
(`closestInteractive`, `SelectorGenerator`, `EventBus`/`EventQueue`/
`Batcher`/`Transport`) instead of adding new abstractions.

Zero runtime dependencies (no React, no lodash, no uuid library — IDs are
generated with a small internal helper).

## Techniques used

- **Async bootstrap.** The inline snippet only creates a queue stub and
  appends an `async` `<script>` tag. It never blocks page rendering.
- **Event delegation.** `ClickCollector` attaches exactly one listener
  (`document`, capture phase) regardless of DOM size — no per-element
  listener attachment, no `MutationObserver` polling for new elements.
- **`requestAnimationFrame` + throttling.**
  - `ScrollCollector` samples at most once per animation frame instead of
    once per native `scroll` event (which can fire dozens of times per
    second).
  - `MoveCollector` targets 8–15 samples/sec via a minimum-interval check
    inside its rAF callback, and ignores sub-2px movements to avoid noise.
- **Passive listeners.** `scroll`, `pointermove`/`mousemove`, and `click`
  listeners are registered with `{ passive: true }` where the collector
  never calls `preventDefault()`, so the browser doesn't have to wait for
  the handler before scrolling/painting.
- **Batching, not per-event requests.** `Batcher` flushes at 50 events or
  5 seconds, whichever comes first — never one HTTP request per click.
- **Bounded memory.** `EventQueue` enforces a hard `maxQueueSize` and drops
  low-priority buffered data (move/scroll samples first, then oldest
  overall) rather than growing unbounded if the network is unavailable.
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
- **Hover uses delegation, not per-element listeners.** `HoverCollector`
  attaches exactly two `document`-level, capture-phase, passive listeners
  (`pointerenter`/`pointerleave`) for the entire page. Non-interactive
  elements are ignored via the same bounded ancestor walk `ClickCollector`
  already performs (max 8 levels) — no `MutationObserver`, no per-element
  attachment as new elements appear.
- **No layout thrashing from hover.** The only DOM read on
  `pointerleave` is a single `Element.contains()` check (to distinguish
  "left the widget" from "moved onto a child of the widget"), which does
  not force a synchronous layout the way `getBoundingClientRect()` or
  `offsetWidth`/`offsetHeight` would. No such layout-forcing calls were
  added anywhere.
- **Hover events are debounced by nature, not sampled.** Only two states
  are ever emitted — enter and leave — never continuous "still hovering"
  ticks, and short accidental pass-throughs (`< hover.minHoverMs`, default
  150ms) are dropped before ever reaching the queue.
- **One click collector, one listener, no duplicate events.** The
  interactive/raw click discriminator (`interactive: true|false`) is a
  single boolean field computed from data the collector was already
  gathering — it does not add a second listener, a second event, or a
  second describe() call.
- **Cursor sampling is time-or-distance gated, not per-event.** Every
  `pointermove` still fires the single delegated listener, but only a
  small fraction of calls actually emit a sample: an emission only happens
  when at least `sampleInterval` ms have passed OR the cursor has moved at
  least `minimumDistance` px since the last emitted sample. The handler
  itself does constant-time work per call (a couple of comparisons, no
  loops) and never touches layout-forcing APIs.
- **Cursor pause detection reuses one timer, not per-frame polling.**
  A single `setTimeout` is rescheduled (clear + reset) on every raw
  `pointermove`; if it ever fires uninterrupted, that means no movement
  happened for `pauseThreshold` ms, so exactly one stationary sample is
  emitted and no further timer is scheduled until real movement resumes.
  All timer callbacks are bound once as class fields rather than created
  inside the move handler, so the hot path never allocates a new closure.
- **Cursor collection pauses when it can't be seen.** `visibilitychange`,
  `blur`, and `focus` are three lightweight, one-time global listener
  registrations (not per-frame checks) that suspend/resume the collector;
  no interpolation is attempted for the gap, matching the "SDK only
  captures data" principle.
- **Kept separate from `MoveCollector` on purpose.** Folding sparse,
  path-oriented cursor samples into `MoveCollector`'s batched,
  velocity-annotated `move` events would have meant reworking an
  already-working collector and payload shape. A small sibling collector
  with its own minimal payload was cheaper in code, bundle size, and risk
  than a rewrite - consistent with the "don't refactor unrelated systems"
  rule this feature was built under.
- **No React at runtime.** The compiled SDK is framework-independent
  vanilla TypeScript/JS; React only appears in `examples/react` and
  `examples/nextjs` as consumers of the SDK, never as a dependency of it.
