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

**Autocapture** (`src/autocapture`) includes `ClickCollector`, `ScrollCollector`,
`RageClickDetector`, and `FunnelTracker`. Collectors publish to the shared
`EventBus`. Interactive clicks are sent to analytics. The local `click:raw`
topic also gives the rage-click detector privacy-filtered background clicks
without sending those clicks individually.

`AutoCaptureEngine` starts and stops the collectors and resets scroll
milestones and funnel evaluation on SPA navigation.

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
   logic shared across collectors.
2. **Privacy is centralized, not scattered.** Every collector that touches
   DOM content asks `PrivacyFilter`; the filter's tree-walk logic exists
   exactly once.
3. **Click delegation, not per-element listeners.** `ClickCollector`
   attaches exactly one `document`-level capture-phase listener regardless
   of how many thousands of elements the page has.
4. **The engine is extensible.** New collectors register with
   `AutoCaptureEngine` the same way the current collectors do, publish to
   the same `EventBus`, and get delivery, privacy filtering, and batching
   for free.
