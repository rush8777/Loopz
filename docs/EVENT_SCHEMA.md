# Event Schema

Every event sent to the ingestion API uses the same envelope:

```typescript
interface AnalyticsEvent<T> {
  eventId: string;
  type: "click" | "scroll" | "move" | "rage_click" | "page_view" | "funnel" | "custom" | "identify";
  timestamp: number;
  anonymousId: string;
  sessionId: string;
  pageViewId: string;
  page: PageContext;
  payload: T;
}

interface PageContext {
  url: string; path: string; hostname: string;
  referrer?: string; title?: string;
  viewportWidth: number; viewportHeight: number;
  documentWidth: number; documentHeight: number;
  devicePixelRatio: number;
}
```

Batches POST to the configured `endpoint` as:

```json
{ "siteId": "site_123", "events": [ /* AnalyticsEvent[] */ ] }
```

## Payload shapes

**click** — one event type powers both the Interactive Click Map and the
Raw Click Map. The `interactive` flag is the only discriminator; there is
no second collector or listener.
```typescript
{
  coordinates: { clientX, clientY, pageX, pageY };
  viewport: { width, height };
  scroll: { x, y };
  element: { tagName, id?, classes?, selector };
  interactive: boolean;   // true = real widget (button/link/role=button/...),
                           // false = raw/background click (whitespace, image,
                           // dead zone, missed target)
  pointerType?: string;
}
```
`element` always describes whatever was actually under the cursor, whether
or not it's interactive - the raw click map keeps that metadata too. Page
size (`documentWidth`/`documentHeight`) needed for heatmap reconstruction
is already present once per event in the envelope's `page` field, so it
isn't duplicated in the click payload. No `innerText`, `textContent`, or
form values are ever included.

**hover** — interactive elements only (buttons, links, inputs, `role=
"button"/"link"`, `tabindex`, `onclick`, `data-action`). Emitted once per
completed hover, after the pointer leaves - never a stream of "still
hovering" updates.
```typescript
{
  element: { tagName, id?, classes?, selector };
  hoverStart: number;   // ms epoch
  hoverEnd: number;     // ms epoch
  durationMs: number;
}
```
Hovers shorter than `hover.minHoverMs` (default 150ms - accidental
pass-throughs) are dropped client-side and never sent.

**cursor** — lightweight, sparse cursor samples for path reconstruction
(cursor maps, attention maps) - not session replay. Separate from `move`,
which powers Move Maps with batched, velocity-annotated points; `cursor`
samples are individual and minimal on purpose.
```typescript
{
  timestamp: number;
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
}
```
Emitted at most once every `cursor.sampleInterval` ms (default 50), or
earlier if the cursor has moved at least `cursor.minimumDistance` px
(default 12) since the last sample. If the cursor stops moving for more
than `cursor.pauseThreshold` ms (default 300), exactly one stationary
sample is emitted so a real pause is distinguishable from a data gap -
collection then goes silent again until movement resumes. No element
selector, hover state, velocity, direction, or other computed fields are
included; that analysis belongs in the backend. Collection automatically
suspends while the tab is hidden or the window is unfocused, and resumes
without attempting to interpolate the missed movement.

**scroll** (one per milestone, not per scroll tick)
```typescript
{
  scrollPercent, maxScrollPercent, scrollTop,
  documentHeight, viewportHeight,
  direction: "up" | "down",
  milestone: 25 | 50 | 75 | 90 | 100;
}
```

**move** (batched — one event per ~1s of buffered samples, 8–15 samples/sec)
```typescript
{
  points: Array<{ x, y, scrollX, scrollY, velocity, direction?, t }>
}
```

**rage_click** (one aggregated event per detected cluster, never the
underlying individual clicks)
```typescript
{
  coordinates: { x, y };
  clickCount: number;
  durationMs: number;
  targetSelector?: string;
}
```

**funnel**
```typescript
{
  funnelName: string;
  stepIndex: number;
  stepLabel: string;
  status: "step_completed" | "funnel_completed" | "funnel_abandoned";
}
```

**custom** (from `analytics.event(name, properties)`)
```typescript
{ name: string; properties?: Record<string, unknown>; }
```

**identify** (from `analytics.identify(userId, traits)`)
```typescript
{ userId: string; traits?: Record<string, unknown>; }
```

All payloads are plain JSON-serializable objects — no functions, DOM
references, or circular structures ever leave a collector.
