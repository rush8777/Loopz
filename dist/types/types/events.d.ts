export interface Viewport {
    width: number;
    height: number;
}
export interface ScrollPosition {
    x: number;
    y: number;
}
export interface PageContext {
    url: string;
    path: string;
    hostname: string;
    referrer?: string;
    title?: string;
    viewportWidth: number;
    viewportHeight: number;
    documentWidth: number;
    documentHeight: number;
    devicePixelRatio: number;
}
export interface ElementDescriptor {
    tagName: string;
    id?: string;
    classes?: string[];
    selector: string;
    /** Human-readable display label - see ElementLabeler.ts. Purely for display; selector remains the identity/matching mechanism. */
    label?: string;
    /** Coarse semantic role (explicit role="" attribute, or a tag-based fallback) - see ElementLabeler.ts. */
    role?: string;
}
/**
 * One element discovered by ElementCrawler.ts during a DOM scan -
 * deliberately a subset of ElementDescriptor (no `id`/`classes`, which
 * are internal to selector generation and not useful once selector is
 * already computed). Sent as a batch (see ElementsSeenPayload), not
 * one event per element.
 */
export interface CrawledElement {
    selector: string;
    tagName: string;
    label?: string;
    role?: string;
}
/**
 * Payload for the "elements_seen" bus topic - a batch from one crawl.
 * Deliberately NOT part of `AnyPayload`/`EventType` below: it doesn't
 * fit the per-session, per-interaction `AnalyticsEvent` shape those
 * exist for (see backendMapping.ts), and is delivered via its own
 * side-channel (Transport.sendElements) rather than the batched event
 * queue - see Analytics.ts's wiring and Transport.ts's module doc.
 */
export interface ElementsSeenPayload {
    /** Raw pathname used by the existing backend PageDefinition matcher. */
    pagePath: string;
    elements: CrawledElement[];
}
export type EventType = "click" | "scroll" | "move" | "rage_click" | "hover" | "cursor" | "page_view" | "funnel" | "custom" | "identify" | "session_start" | "session_replay_event";
export interface ClickEventPayload {
    coordinates: {
        clientX: number;
        clientY: number;
        pageX: number;
        pageY: number;
        documentX?: number;
        documentY?: number;
    };
    viewport: Viewport;
    scroll: ScrollPosition;
    element: ElementDescriptor;
    /**
     * true  -> counts toward the Interactive Click Map (button/link/etc.)
     * false -> counts toward the Raw Click Map (whitespace, background,
     *          images, missed targets, dead zones)
     * One event, one collector, one listener - the backend splits by this
     * flag instead of the SDK running two separate click pipelines.
     */
    interactive: boolean;
    pointerType?: string;
}
export interface HoverEventPayload {
    element: ElementDescriptor;
    hoverStart: number;
    hoverEnd: number;
    durationMs: number;
    /**
     * Center of the hovered element's bounding box at hover-start
     * (viewport-relative, same frame as ClickEventPayload.coordinates.clientX/Y).
     * A representative point for "where this hover happened" for heatmap
     * purposes - deliberately the element's center rather than the exact
     * pointer entry pixel, since entry point depends on which edge the
     * cursor happened to cross and isn't a meaningful spatial signal on
     * its own the way "attention centered on this element" is.
     */
    x?: number;
    y?: number;
    documentX?: number;
    documentY?: number;
}
/**
 * Minimal cursor sample for later path reconstruction / cursor maps.
 * Deliberately smaller than MoveEventPayload's points (no velocity,
 * direction, or scroll offset) - the SDK only captures raw position,
 * analysis happens in the backend.
 */
export interface CursorEventPayload {
    timestamp: number;
    x: number;
    y: number;
    documentX?: number;
    documentY?: number;
    viewportWidth: number;
    viewportHeight: number;
    documentWidth?: number;
    documentHeight?: number;
}
export interface ScrollEventPayload {
    scrollPercent: number;
    maxScrollPercent: number;
    scrollTop: number;
    documentHeight: number;
    viewportHeight: number;
    direction: "up" | "down";
    milestone?: 25 | 50 | 75 | 90 | 100;
}
export interface MoveEventPayload {
    points: MovePoint[];
}
export interface MovePoint {
    x: number;
    y: number;
    scrollX: number;
    scrollY: number;
    velocity: number;
    direction?: number;
    t: number;
}
export interface RageClickEventPayload {
    coordinates: {
        x: number;
        y: number;
    };
    clickCount: number;
    durationMs: number;
    targetSelector?: string;
}
export interface FunnelEventPayload {
    funnelName: string;
    stepIndex: number;
    stepLabel: string;
    status: "step_completed" | "funnel_completed" | "funnel_abandoned";
}
export interface CustomEventPayload {
    name: string;
    properties?: Record<string, unknown>;
}
export interface IdentifyEventPayload {
    userId: string;
    traits?: Record<string, unknown>;
}
export interface PageViewEventPayload {
    title?: string;
}
/**
 * Automatically-collected environment context, captured once per
 * session (not per event - browser/OS/screen/etc. don't change
 * mid-session) and sent as a dedicated "session_start" event the first
 * time a session is touched. See EnvironmentContext.ts.
 *
 * Deliberately limited to information equivalent to what a server
 * already gets for free from the User-Agent header, plus a couple of
 * JS-only reads (language, timezone, screen size) - no canvas/audio/
 * font fingerprinting, no IP address, no hardware identifiers.
 */
export interface SessionStartEventPayload {
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
}
/**
 * Wraps a single raw rrweb event for transport through the existing
 * pipeline. The rrweb payload is stored in its original structure -
 * the SDK does not interpret or transform it, that happens in the
 * backend replay reconstruction system.
 */
export interface SessionReplayEventPayload {
    replaySessionId: string;
    /** Monotonically increasing sequence number within this replay session, for backend ordering/gap detection. */
    seq: number;
    /** The raw rrweb event, exactly as emitted by the rrweb recorder. */
    rrwebEvent: unknown;
}
export type AnyPayload = ClickEventPayload | ScrollEventPayload | MoveEventPayload | RageClickEventPayload | HoverEventPayload | CursorEventPayload | FunnelEventPayload | CustomEventPayload | IdentifyEventPayload | PageViewEventPayload | SessionStartEventPayload | SessionReplayEventPayload;
export interface AnalyticsEvent<T = AnyPayload> {
    eventId: string;
    type: EventType;
    timestamp: number;
    anonymousId: string;
    sessionId: string;
    pageViewId: string;
    page: PageContext;
    heatmap?: {
        stateId?: string;
        deviceClass: "desktop" | "tablet" | "mobile";
    };
    payload: T;
}
