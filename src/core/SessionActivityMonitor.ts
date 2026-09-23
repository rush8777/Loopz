import type { SessionManager } from "./SessionManager";

/**
 * Preserves local session activity semantics without producing analytics.
 * Activity is heavily throttled and only updates SessionManager/local storage;
 * it never enters EventQueue or Transport.
 */
export class SessionActivityMonitor {
  private running = false;
  private lastTouchAt = 0;
  private readonly onActivity = () => {
    const now = Date.now();
    if (now - this.lastTouchAt < this.throttleMs) return;
    this.lastTouchAt = now;
    this.session.touch();
  };

  constructor(
    private session: SessionManager,
    private throttleMs = 60_000
  ) {}

  start(): void {
    if (this.running || typeof window === "undefined") return;
    this.running = true;
    window.addEventListener("pointermove", this.onActivity, { passive: true });
    window.addEventListener("pointerdown", this.onActivity, { passive: true });
    window.addEventListener("scroll", this.onActivity, { passive: true });
    window.addEventListener("keydown", this.onActivity);
  }

  stop(): void {
    if (!this.running || typeof window === "undefined") return;
    this.running = false;
    window.removeEventListener("pointermove", this.onActivity);
    window.removeEventListener("pointerdown", this.onActivity);
    window.removeEventListener("scroll", this.onActivity);
    window.removeEventListener("keydown", this.onActivity);
  }
}
