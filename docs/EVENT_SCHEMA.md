# Event Schema

The SDK uses this envelope internally before flattening events for ingestion.

```typescript
interface AnalyticsEvent<T> {
  eventId: string;
  type: "click" | "scroll" | "rage_click" | "page_view" | "funnel" | "custom" | "identify" | "session_start";
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

The SDK sends batches to `POST /public/sites/:siteId/events` as
`{ sessionId, events }`. The transport flattens supported payloads for that
endpoint. Funnel events remain local to the SDK.

## Payload shapes

**click** records interactions with buttons, links, and other interactive controls.
```typescript
{
  coordinates: { clientX, clientY, pageX, pageY };
  viewport: { width, height };
  scroll: { x, y };
  element: { tagName, id?, classes?, selector, label?, role? };
  interactive: boolean;
  pointerType?: string;
}
```
Background clicks can contribute to local rage-click detection. The SDK
only sends individual click events for interactive controls.

**scroll** (one per milestone, not per scroll tick)
```typescript
{
  scrollPercent, maxScrollPercent, scrollTop,
  documentHeight, viewportHeight,
  direction: "up" | "down",
  milestone: 25 | 50 | 75 | 90 | 100;
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
