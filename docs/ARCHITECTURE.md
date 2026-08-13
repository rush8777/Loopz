# Architecture

```
                ONE SCRIPT
                    │
                    ▼
          ┌──────────────────┐
          │  AutoCapture     │
          │     Engine       │
          └────────┬─────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
     Click       Scroll       Move
       │           │           │
       └──────┬────┴─────┬─────┘
              ▼          ▼
           Rage       Funnels
              │          │
              └────┬─────┘
                   ▼
              EventBus (pub/sub)
                   │
                   ▼
         Analytics core (privacy + normalize)
                   │
                   ▼
              EventQueue
                   │
                   ▼
                Batcher
                   │
                   ▼
                Transport
                   │
                   ▼
             Ingestion API
```

## Layers

**Bootstrap** (`src/bootstrap`, `bootstrap/install-snippet.html`) — the only
code that runs synchronously on the customer's page. It creates a command
queue stub and loads the real SDK asynchronously. Never contains business
logic.

**Autocapture** (`src/autocapture`) — seven independent collectors
(`ClickCollector`, `ScrollCollector`, `MoveCollector`, `RageClickDetector`,
`HoverCollector`, `CursorCollector`, `FunnelTracker`), each responsible for
one signal. Collectors:
- know nothing about each other (except `RageClickDetector`, which consumes
  the `click:raw` topic already published by `ClickCollector` rather than
  attaching its own listener),
- know nothing about batching, queues, or the network,
- publish raw capture data onto a shared `EventBus`.

`ClickCollector` powers both the Interactive Click Map and the Raw Click
Map from a single listener and a single event type, discriminated by an
`interactive: boolean` field (see `docs/EVENT_SCHEMA.md`) - there is
deliberately no second "raw click collector".

`HoverCollector` uses two delegated `document`-level listeners
(`pointerenter`/`pointerleave`, capture phase) rather than one listener per
interactive element, and reuses `closestInteractive` - the same ancestor-
walking logic `ClickCollector` already uses - so hover targeting doesn't
duplicate detection rules.

`CursorCollector` is a deliberately separate, minimal sibling to
`MoveCollector`: one delegated, passive `pointermove` listener that emits
sparse `{timestamp, x, y, viewportWidth, viewportHeight}` samples gated by
a time-or-distance threshold, plus a single stationary sample after a
configurable pause. It does not batch points into arrays the way
`MoveCollector` does - each sample is its own event, sized for cursor-path
reconstruction rather than heatmap point clouds. See
`docs/PERFORMANCE.md` for why it was kept separate instead of folded into
`MoveCollector`.

`AutoCaptureEngine` is the only class that references all five collectors.
It owns their lifecycle (`start`/`stop`) and forwards SPA route-change
notifications (`onRouteChange`) to the ones that need to reset per-page-view
state (scroll milestones, funnel evaluation).

**Privacy** (`src/privacy`) — `PrivacyFilter` is the single place privacy
decisions are made. `ClickCollector` asks `shouldCapture(element)` before
emitting anything; `SelectorGenerator` never reads text content in the
first place. See `docs/PRIVACY.md`.

**DOM** (`src/dom`) — `SelectorGenerator` (stable selector strategy),
`RouteObserver` (SPA navigation detection via careful `history.pushState`/
`replaceState` patching plus `popstate`/`hashchange`), and small pure
helpers (`closestInteractive`, `distance`, `clamp`).

**Core** (`src/core`) — `Analytics` is the orchestrator: it wires the
`AutoCaptureEngine`'s `EventBus` events into the envelope format
(`AnalyticsEvent<T>`), stamps identity (`SessionManager`) and page context
(`getPageContext`), and hands events to `Batcher`. `EventQueue` is a
bounded in-memory FIFO; `Batcher` flushes it on a size-or-time threshold
with retry/backoff; `Transport` is the only class that calls `fetch` /
`navigator.sendBeacon`.

**API** (`src/api/PublicAPI.ts`) — replaces the bootstrap's queue stub(s)
with the real API and drains any commands queued before the SDK finished
loading. This is what makes `analytics.event(...)` safe to call
immediately after pasting the snippet, before the async script has
downloaded.

## Design rules enforced by this structure

1. **Collectors never call `fetch()`.** All delivery goes through
   `Analytics` → `Batcher` → `Transport`. This keeps retry/backoff/unload
   logic in one place and means adding a 6th collector later (e.g. a future
   session-replay recorder) never has to re-implement delivery.
2. **Privacy is centralized, not scattered.** Every collector that touches
   DOM content asks `PrivacyFilter`; the filter's tree-walk logic exists
   exactly once.
3. **Click delegation, not per-element listeners.** `ClickCollector`
   attaches exactly one `document`-level capture-phase listener regardless
   of how many thousands of elements the page has.
4. **The engine is extensible.** New collectors register with
   `AutoCaptureEngine` the same way the five MVP collectors do, publish to
   the same `EventBus`, and get delivery, privacy filtering, and batching
   for free.
