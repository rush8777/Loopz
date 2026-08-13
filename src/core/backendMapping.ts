import type {
  AnalyticsEvent,
  AnyPayload,
  ClickEventPayload,
  HoverEventPayload,
  ScrollEventPayload,
  CursorEventPayload,
  SessionReplayEventPayload,
} from "../types/events";

/**
 * The backend's ingestion contract (analytics-platform-backend,
 * POST /public/sites/:siteId/events) - deliberately narrower than the
 * SDK's own event model. Kept in sync by hand since the backend is a
 * separate deployable; see src/lib/patterns/event.ts and validation.ts
 * on the backend for the source of truth this must match.
 */
export interface BackendIncomingEvent {
  type: "page_view" | "hover" | "click" | "scroll" | "cursor";
  timestamp: number;
  element?: { selector: string };
  durationMs?: number;
  scrollPercent?: number;
  x?: number;
  y?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface BackendReplayEvent {
  type: number;
  timestamp: number;
  data: unknown;
}

/**
 * Event types the SDK captures that this backend has no ingestion path
 * for yet (no matching column/concept in session_events, no consumer
 * for them). Rather than silently mis-sending them as some best-effort
 * guess, they're dropped at the transport boundary - they still flow
 * through the local EventBus/queue like everything else, so any other
 * consumer wired to the bus directly still sees them; they just never
 * reach this particular backend's HTTP API.
 */
const UNSUPPORTED_BY_BACKEND = new Set(["move", "rage_click", "funnel", "custom", "identify"]);

/**
 * Maps one SDK event to the backend's flattened shape, or null if this
 * backend has nowhere to put it (see UNSUPPORTED_BY_BACKEND) or it's a
 * replay event (handled separately by mapToBackendReplayEvent).
 *
 * Coordinate frame note: x/y are viewport-relative (clientX/clientY,
 * and for hover the hovered element's bounding-box center in the same
 * frame) - NOT page-relative/scroll-adjusted. This matches the
 * dashboard's current Heatmaps rendering, which draws a fixed-size
 * snapshot without simulating scroll position. A more complete version
 * would carry scroll offset too (PageContext already captures it) and
 * let the dashboard reconstruct true document-relative position - left
 * as a known simplification for this pass.
 */
export function mapToBackendEvent(event: AnalyticsEvent<AnyPayload>): BackendIncomingEvent | null {
  if (UNSUPPORTED_BY_BACKEND.has(event.type) || event.type === "session_replay_event") return null;

  const viewportWidth = event.page.viewportWidth > 0 ? event.page.viewportWidth : undefined;
  const viewportHeight = event.page.viewportHeight > 0 ? event.page.viewportHeight : undefined;

  switch (event.type) {
    case "page_view":
      return { type: "page_view", timestamp: event.timestamp };

    case "click": {
      const p = event.payload as ClickEventPayload;
      const x = Math.max(0, Math.min(20000, Math.floor(p.coordinates.clientX)));
      const y = Math.max(0, Math.min(200000, Math.floor(p.coordinates.clientY)));
      return {
        type: "click",
        timestamp: event.timestamp,
        element: { selector: p.element.selector },
        x,
        y,
        ...(viewportWidth !== undefined && { viewportWidth }),
        ...(viewportHeight !== undefined && { viewportHeight }),
      };
    }

    case "hover": {
      const p = event.payload as HoverEventPayload;
      const x = p.x !== undefined ? Math.max(0, Math.min(20000, Math.floor(p.x))) : undefined;
      const y = p.y !== undefined ? Math.max(0, Math.min(200000, Math.floor(p.y))) : undefined;
      return {
        type: "hover",
        timestamp: event.timestamp,
        element: { selector: p.element.selector },
        durationMs: p.durationMs,
        ...(x !== undefined && { x }),
        ...(y !== undefined && { y }),
        ...(viewportWidth !== undefined && { viewportWidth }),
        ...(viewportHeight !== undefined && { viewportHeight }),
      };
    }

    case "scroll": {
      const p = event.payload as ScrollEventPayload;
      const scrollPercent = Math.max(0, Math.min(100, Math.round(p.scrollPercent)));
      return {
        type: "scroll",
        timestamp: event.timestamp,
        scrollPercent,
        ...(viewportWidth !== undefined && { viewportWidth }),
        ...(viewportHeight !== undefined && { viewportHeight }),
      };
    }

    case "cursor": {
      const p = event.payload as CursorEventPayload;
      const cursorViewportWidth = p.viewportWidth > 0 ? p.viewportWidth : undefined;
      const cursorViewportHeight = p.viewportHeight > 0 ? p.viewportHeight : undefined;
      const x = Math.max(0, Math.min(20000, Math.floor(p.x)));
      const y = Math.max(0, Math.min(200000, Math.floor(p.y)));
      return {
        type: "cursor",
        timestamp: event.timestamp,
        x,
        y,
        ...(cursorViewportWidth !== undefined && { viewportWidth: cursorViewportWidth }),
        ...(cursorViewportHeight !== undefined && { viewportHeight: cursorViewportHeight }),
      };
    }

    default:
      return null;
  }
}

export function mapToBackendReplayEvent(event: AnalyticsEvent<SessionReplayEventPayload>): BackendReplayEvent {
  const rrwebEvent = event.payload.rrwebEvent as { type: number; timestamp: number; data: unknown };
  return {
    type: rrwebEvent.type,
    timestamp: rrwebEvent.timestamp,
    data: rrwebEvent.data,
  };
}

/** Groups events by sessionId, preserving relative order within each group. */
export function groupBySessionId<T extends { sessionId: string }>(events: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const event of events) {
    const list = groups.get(event.sessionId);
    if (list) list.push(event);
    else groups.set(event.sessionId, [event]);
  }
  return groups;
}
