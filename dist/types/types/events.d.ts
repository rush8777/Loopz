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
}
export type EventType = "click" | "scroll" | "move" | "rage_click" | "hover" | "cursor" | "page_view" | "funnel" | "custom" | "identify" | "session_replay_event";
export interface ClickEventPayload {
    coordinates: {
        clientX: number;
        clientY: number;
        pageX: number;
        pageY: number;
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
    viewportWidth: number;
    viewportHeight: number;
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
export type AnyPayload = ClickEventPayload | ScrollEventPayload | MoveEventPayload | RageClickEventPayload | HoverEventPayload | CursorEventPayload | FunnelEventPayload | CustomEventPayload | IdentifyEventPayload | PageViewEventPayload | SessionReplayEventPayload;
export interface AnalyticsEvent<T = AnyPayload> {
    eventId: string;
    type: EventType;
    timestamp: number;
    anonymousId: string;
    sessionId: string;
    pageViewId: string;
    page: PageContext;
    payload: T;
}
