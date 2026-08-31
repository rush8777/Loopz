import type { AnalyticsEvent, AnyPayload, SessionReplayEventPayload } from "../types/events";
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
    element?: {
        selector: string;
        label?: string;
        role?: string;
    };
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
export declare function mapToBackendEvent(event: AnalyticsEvent<AnyPayload>): BackendIncomingEvent | null;
export declare function mapToBackendReplayEvent(event: AnalyticsEvent<SessionReplayEventPayload>): BackendReplayEvent;
/** Groups events by sessionId, preserving relative order within each group. */
export declare function groupBySessionId<T extends {
    sessionId: string;
}>(events: T[]): Map<string, T[]>;
