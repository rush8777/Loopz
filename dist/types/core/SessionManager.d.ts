/**
 * Owns identity: a durable anonymous visitor id, an expiring session id,
 * and a per-page-view id. No PII, no IP addresses, no fingerprinting.
 */
export declare class SessionManager {
    private anonymousId;
    private sessionId;
    private pageViewId;
    private lastActivity;
    private inactivityMs;
    /** True from construction (genuinely new session) or from a touch()-triggered rotation, until consumeSessionStarted() reads and clears it. */
    private sessionJustStarted;
    constructor(inactivityMs?: number);
    private loadOrCreateAnonymousId;
    private loadOrCreateSessionId;
    /** Call on any behavioral event to keep the session alive and rotate if expired. */
    touch(): void;
    /**
     * Reads and clears the "a new session just began" flag - call once
     * per touch() to decide whether to emit a session_start event before
     * the event that triggered the touch (see Analytics.enqueueEvent).
     * Idempotent: calling it again before the next rotation returns false.
     */
    consumeSessionStarted(): boolean;
    /** Call on SPA route changes to start a new page view context. */
    newPageView(): void;
    getAnonymousId(): string;
    getSessionId(): string;
    getPageViewId(): string;
    /** Allow identify() to bind a known user id to the anonymous id (kept locally only). */
    identify(userId: string): void;
}
