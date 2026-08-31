import type {
  AnalyticsEvent,
  AnyPayload,
  ClickEventPayload,
  HoverEventPayload,
  ScrollEventPayload,
  CursorEventPayload,
  CustomEventPayload,
  IdentifyEventPayload,
  SessionStartEventPayload,
  SessionReplayEventPayload,
} from "../types/events";

/**
 * The backend's ingestion contract (analytics-platform-backend,
 * POST /public/sites/:siteId/events) - deliberately narrower than the
 * SDK's own event model. Kept in sync by hand since the backend is a
 * separate deployable; see src/lib/patterns/event.ts and validation.ts
 * on the backend for the source of truth this must match.
 *
 * `anonymousId` is carried on every event (not just identify) - it's
 * what the backend's identity layer joins session_events against
 * tracked_user_aliases with, so a profile's activity/sessions include
 * everything a visitor did before they were ever identified.
 *
 * `eventId`/`pageViewId` are carried on every event too - both are
 * already generated for every `AnalyticsEvent` (see
 * core/Analytics.ts's buildAndEnqueue and SessionManager's
 * getPageViewId()/newPageView(), the SDK's sole owner of the page-view
 * lifecycle). `eventId` is what lets the backend dedupe a retried
 * event/batch (see Transport's at-least-once delivery note above) into
 * zero duplicate rows; `pageViewId` is what lets every persisted event
 * carry the page view it was captured under without this backend ever
 * generating or advancing one itself.
 *
 * `custom` is the developer-defined event contract (`analytics.event(name,
 * properties?)` - see Analytics.ts). It travels as its own top-level
 * `type`, never encoded as a click/hover/etc. payload: `name` identifies
 * *which* application event this is (e.g. "checkout_completed"), and
 * `properties` is whatever JSON-serializable data the caller passed,
 * carried through untouched - this backend treats it as an opaque bag,
 * never flattening it into typed fields the way DOM-interaction events
 * are.
 */
export interface BackendIncomingEvent {
  type: "page_view" | "hover" | "click" | "scroll" | "cursor" | "identify" | "session_start" | "custom";
  timestamp: number;
  anonymousId: string;
  eventId: string;
  pageViewId: string;
  element?: { selector: string; label?: string; role?: string };
  durationMs?: number;
  scrollPercent?: number;
  x?: number;
  y?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  documentX?: number;
  documentY?: number;
  documentWidth?: number;
  documentHeight?: number;
  deviceClass?: "desktop" | "tablet" | "mobile";
  heatmapStateId?: string;
  /** Raw PageContext.path for every event. */
  path?: string;
  /** identify only. */
  externalUserId?: string;
  traits?: Record<string, unknown>;
  /** session_start only - see SessionStartEventPayload. */
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
  deviceType?: "desktop" | "mobile" | "tablet";
  language?: string;
  timezone?: string;
  screenWidth?: number;
  screenHeight?: number;
  referrer?: string;
  /** custom only - the developer-chosen event name, e.g. "checkout_completed". */
  name?: string;
  /** custom only - whatever JSON-serializable properties the caller passed to analytics.event(). */
  properties?: Record<string, unknown>;
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
 *
 * `identify` is deliberately NOT in this set (anymore) - the backend's
 * tracked-user identity layer consumes it directly, see
 * resolveIdentity() there and the "identify" case below.
 *
 * `custom` is deliberately NOT in this set (anymore) either - developer-
 * defined events (`analytics.event(name, properties?)`) are now a
 * first-class ingested event type, see the "custom" case below and
 * BackendIncomingEvent's doc comment.
 */
const UNSUPPORTED_BY_BACKEND = new Set(["move", "rage_click", "funnel"]);

/**
 * Maps one SDK event to the backend's flattened shape, or null if this
 * backend has nowhere to put it (see UNSUPPORTED_BY_BACKEND) or it's a
 * replay event (handled separately by mapToBackendReplayEvent).
 *
 * Coordinate frame note: x/y remain viewport-relative for backward
 * compatibility. documentX/documentY are the primary full-page heatmap
 * coordinates, paired with document and viewport dimensions so the Page
 * heatmap can align them to a reference snapshot after scrolling.
 */
/**
 * Builds the backend's `element` field, including `label`/`role` only
 * when the SDK actually computed one (older/custom-built ElementDescriptor
 * values may not have them) - keeps the wire payload minimal rather than
 * sending `label: undefined` on every event.
 */
function toBackendElement(descriptor: { selector: string; label?: string; role?: string }): { selector: string; label?: string; role?: string } {
  return {
    selector: descriptor.selector,
    ...(descriptor.label && { label: descriptor.label }),
    ...(descriptor.role && { role: descriptor.role }),
  };
}

export function mapToBackendEvent(event: AnalyticsEvent<AnyPayload>): BackendIncomingEvent | null {
  if (UNSUPPORTED_BY_BACKEND.has(event.type) || event.type === "session_replay_event") return null;

  const viewportWidth = event.page.viewportWidth > 0 ? event.page.viewportWidth : undefined;
  const viewportHeight = event.page.viewportHeight > 0 ? event.page.viewportHeight : undefined;
  const heatmapContext = {
    path: event.page.path,
    ...(event.page.documentWidth > 0 && { documentWidth: event.page.documentWidth }),
    ...(event.page.documentHeight > 0 && { documentHeight: event.page.documentHeight }),
    ...(event.heatmap?.deviceClass && { deviceClass: event.heatmap.deviceClass }),
    ...(event.heatmap?.stateId && { heatmapStateId: event.heatmap.stateId }),
  };

  switch (event.type) {
    case "page_view":
      return {
        type: "page_view",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext,
      };

    case "click": {
      const p = event.payload as ClickEventPayload;
      const x = Math.max(0, Math.min(20000, Math.floor(p.coordinates.clientX)));
      const y = Math.max(0, Math.min(200000, Math.floor(p.coordinates.clientY)));
      return {
        type: "click",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext,
        element: toBackendElement(p.element),
        x,
        y,
        documentX: Math.max(0, Math.min(20000, Math.floor(p.coordinates.documentX ?? p.coordinates.pageX))),
        documentY: Math.max(0, Math.min(200000, Math.floor(p.coordinates.documentY ?? p.coordinates.pageY))),
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
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext,
        element: toBackendElement(p.element),
        durationMs: p.durationMs,
        ...(x !== undefined && { x }),
        ...(y !== undefined && { y }),
        ...(p.documentX !== undefined && { documentX: Math.max(0, Math.min(20000, Math.floor(p.documentX))) }),
        ...(p.documentY !== undefined && { documentY: Math.max(0, Math.min(200000, Math.floor(p.documentY))) }),
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
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext,
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
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...heatmapContext,
        x,
        y,
        documentX: Math.max(0, Math.min(20000, Math.floor(p.documentX ?? p.x))),
        documentY: Math.max(0, Math.min(200000, Math.floor(p.documentY ?? p.y))),
        ...(p.documentWidth !== undefined && { documentWidth: p.documentWidth }),
        ...(p.documentHeight !== undefined && { documentHeight: p.documentHeight }),
        ...(cursorViewportWidth !== undefined && { viewportWidth: cursorViewportWidth }),
        ...(cursorViewportHeight !== undefined && { viewportHeight: cursorViewportHeight }),
      };
    }

    case "identify": {
      const p = event.payload as IdentifyEventPayload;
      return {
        type: "identify",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        externalUserId: p.userId,
        ...(p.traits !== undefined && { traits: p.traits }),
      };
    }

    case "session_start": {
      const p = event.payload as SessionStartEventPayload;
      return {
        type: "session_start",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...(p.browserName !== undefined && { browserName: p.browserName }),
        ...(p.browserVersion !== undefined && { browserVersion: p.browserVersion }),
        ...(p.osName !== undefined && { osName: p.osName }),
        ...(p.osVersion !== undefined && { osVersion: p.osVersion }),
        ...(p.deviceType !== undefined && { deviceType: p.deviceType }),
        ...(p.language !== undefined && { language: p.language }),
        ...(p.timezone !== undefined && { timezone: p.timezone }),
        ...(p.screenWidth !== undefined && { screenWidth: p.screenWidth }),
        ...(p.screenHeight !== undefined && { screenHeight: p.screenHeight }),
        ...(p.referrer !== undefined && { referrer: p.referrer }),
      };
    }

    case "custom": {
      const p = event.payload as CustomEventPayload;
      return {
        type: "custom",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        name: p.name,
        ...(p.properties !== undefined && { properties: p.properties }),
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
