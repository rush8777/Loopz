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
export type EventType = "click" | "scroll" | "rage_click" | "page_view" | "funnel" | "custom" | "identify" | "session_start";
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
    /** Only interactive clicks are sent to analytics. All accepted clicks can contribute to rage detection. */
    interactive: boolean;
    pointerType?: string;
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
export interface RageClickEventPayload {
    coordinates: {
        x: number;
        y: number;
        documentX?: number;
        documentY?: number;
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
export type AnyPayload = ClickEventPayload | ScrollEventPayload | RageClickEventPayload | FunnelEventPayload | CustomEventPayload | IdentifyEventPayload | PageViewEventPayload | SessionStartEventPayload;
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
