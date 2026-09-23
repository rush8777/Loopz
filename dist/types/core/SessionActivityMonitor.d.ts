import type { SessionManager } from "./SessionManager";
/**
 * Preserves local session activity semantics without producing analytics.
 * Activity is heavily throttled and only updates SessionManager/local storage;
 * it never enters EventQueue or Transport.
 */
export declare class SessionActivityMonitor {
    private session;
    private throttleMs;
    private running;
    private lastTouchAt;
    private readonly onActivity;
    constructor(session: SessionManager, throttleMs?: number);
    start(): void;
    stop(): void;
}
