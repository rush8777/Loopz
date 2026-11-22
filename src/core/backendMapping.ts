import type {
  AnalyticsEvent,
  AnyPayload,
  ClickEventPayload,
  ScrollEventPayload,
  CustomEventPayload,
  IdentifyEventPayload,
  SessionStartEventPayload,
  RageClickEventPayload,
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
  type: "page_view" | "click" | "scroll" | "rage_click" | "identify" | "session_start" | "custom";
  timestamp: number;
  anonymousId: string;
  eventId: string;
  pageViewId: string;
  element?: { selector: string; label?: string; role?: string };
  scrollPercent?: number;
  x?: number;
  y?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  documentX?: number;
  documentY?: number;
  documentWidth?: number;
  documentHeight?: number;
  rageClickCount?: number;
  durationMs?: number;
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
  const viewportWidth = event.page.viewportWidth > 0 ? event.page.viewportWidth : undefined;
  const viewportHeight = event.page.viewportHeight > 0 ? event.page.viewportHeight : undefined;
  const pageContext = {
    path: event.page.path,
    ...(event.page.documentWidth > 0 && { documentWidth: event.page.documentWidth }),
    ...(event.page.documentHeight > 0 && { documentHeight: event.page.documentHeight }),
  };

  switch (event.type) {
    case "page_view":
      return {
        type: "page_view",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...pageContext,
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
        ...pageContext,
        element: toBackendElement(p.element),
        x,
        y,
        documentX: Math.max(0, Math.min(20000, Math.floor(p.coordinates.documentX ?? p.coordinates.pageX))),
        documentY: Math.max(0, Math.min(200000, Math.floor(p.coordinates.documentY ?? p.coordinates.pageY))),
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
        ...pageContext,
        scrollPercent,
        ...(viewportWidth !== undefined && { viewportWidth }),
        ...(viewportHeight !== undefined && { viewportHeight }),
      };
    }

    case "rage_click": {
      const p = event.payload as RageClickEventPayload;
      const x = Math.max(0, Math.min(20000, Math.floor(p.coordinates.x)));
      const y = Math.max(0, Math.min(200000, Math.floor(p.coordinates.y)));
      return {
        type: "rage_click",
        timestamp: event.timestamp,
        anonymousId: event.anonymousId,
        eventId: event.eventId,
        pageViewId: event.pageViewId,
        ...pageContext,
        ...(p.targetSelector && { element: { selector: p.targetSelector } }),
        x,
        y,
        documentX: Math.max(0, Math.min(20000, Math.floor(p.coordinates.documentX ?? x))),
        documentY: Math.max(0, Math.min(200000, Math.floor(p.coordinates.documentY ?? y))),
        rageClickCount: p.clickCount,
        durationMs: p.durationMs,
        ...(viewportWidth !== undefined && { viewportWidth }),
        ...(viewportHeight !== undefined && { viewportHeight }),
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
