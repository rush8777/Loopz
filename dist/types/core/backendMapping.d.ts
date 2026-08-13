import type { AnalyticsEvent, AnyPayload, SessionReplayEventPayload } from "../types/events";
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
    element?: {
        selector: string;
    };
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
export declare function mapToBackendEvent(event: AnalyticsEvent<AnyPayload>): BackendIncomingEvent | null;
export declare function mapToBackendReplayEvent(event: AnalyticsEvent<SessionReplayEventPayload>): BackendReplayEvent;
/** Groups events by sessionId, preserving relative order within each group. */
export declare function groupBySessionId<T extends {
    sessionId: string;
}>(events: T[]): Map<string, T[]>;
