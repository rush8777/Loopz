import { generateId, now } from "./ids";
import { localStore, sessionStore } from "./storage";

const ANON_ID_KEY = "__aa_anon_id__";
const SESSION_ID_KEY = "__aa_session_id__";
const SESSION_LAST_ACTIVE_KEY = "__aa_session_last_active__";

/**
 * Owns identity: a durable anonymous visitor id, an expiring session id,
 * and a per-page-view id. No PII, no IP addresses, no fingerprinting.
 */
export class SessionManager {
  private anonymousId: string;
  private sessionId: string;
  private pageViewId: string;
  private lastActivity: number;
  private inactivityMs: number;

  constructor(inactivityMs = 30 * 60 * 1000) {
    this.inactivityMs = inactivityMs;
    this.anonymousId = this.loadOrCreateAnonymousId();
    const restored = this.loadOrCreateSessionId();
    this.sessionId = restored.id;
    this.lastActivity = restored.lastActive;
    this.pageViewId = generateId("pv");
  }

  private loadOrCreateAnonymousId(): string {
    let id = localStore.get(ANON_ID_KEY);
    if (!id) {
      id = generateId("anon");
      localStore.set(ANON_ID_KEY, id);
    }
    return id;
  }

  private loadOrCreateSessionId(): { id: string; lastActive: number } {
    const existingId = sessionStore.get(SESSION_ID_KEY);
    const existingLastActive = Number(sessionStore.get(SESSION_LAST_ACTIVE_KEY) || 0);
    const fresh = now();

    if (existingId && fresh - existingLastActive < this.inactivityMs) {
      sessionStore.set(SESSION_LAST_ACTIVE_KEY, String(fresh));
      return { id: existingId, lastActive: fresh };
    }

    const id = generateId("sess");
    sessionStore.set(SESSION_ID_KEY, id);
    sessionStore.set(SESSION_LAST_ACTIVE_KEY, String(fresh));
    return { id, lastActive: fresh };
  }

  /** Call on any behavioral event to keep the session alive and rotate if expired. */
  touch(): void {
    const t = now();
    if (t - this.lastActivity >= this.inactivityMs) {
      this.sessionId = generateId("sess");
      sessionStore.set(SESSION_ID_KEY, this.sessionId);
    }
    this.lastActivity = t;
    sessionStore.set(SESSION_LAST_ACTIVE_KEY, String(t));
  }

  /** Call on SPA route changes to start a new page view context. */
  newPageView(): void {
    this.pageViewId = generateId("pv");
  }

  getAnonymousId(): string {
    return this.anonymousId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getPageViewId(): string {
    return this.pageViewId;
  }

  /** Allow identify() to bind a known user id to the anonymous id (kept locally only). */
  identify(userId: string): void {
    localStore.set(ANON_ID_KEY, this.anonymousId); // anonymousId persists regardless
    sessionStore.set("__aa_identified_user__", userId);
  }
}
