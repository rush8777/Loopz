import type { SessionManager } from "../../core/SessionManager";
import type { DeliveredExperience, ExperienceAction } from "../types";
import { EligibilityEngine } from "./EligibilityEngine";
import { ExperienceRenderer } from "./ExperienceRenderer";
import { ExperienceStateStore } from "./ExperienceStateStore";

export class ExperienceLoader {
  private renderer = new ExperienceRenderer();
  private eligibility = new EligibilityEngine();
  private state = new ExperienceStateStore();
  private activeId: string | null = null;
  private impressionId: string | null = null;
  private destroyed = false;

  constructor(private apiBase: string, private siteId: string, private session: SessionManager, private trackEvent?: (name: string) => void) {}

  async evaluate(trigger?: string): Promise<void> {
    if (this.destroyed || this.activeId) return;
    try {
      const query = new URLSearchParams({ url: location.href, anonymousId: this.session.getAnonymousId(), sessionId: this.session.getSessionId() });
      const userId = this.session.getIdentifiedUserId(); if (userId) query.set("trackedUserId", userId); if (trigger) query.set("trigger", trigger);
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experiences?${query}`, { credentials: "omit" });
      if (!response.ok) return;
      const manifest = await response.json() as { experiences?: DeliveredExperience[] };
      const chosen = this.eligibility.choose(Array.isArray(manifest.experiences) ? manifest.experiences : []); if (!chosen) return;
      const mounted = this.renderer.render(chosen, {
        onVisible: () => void this.shown(chosen),
        onDismiss: () => void this.record(chosen, "dismissed"),
        onAction: (action) => this.handleAction(chosen, action),
        onComplete: () => void this.record(chosen, "completed"),
      });
      if (mounted) this.activeId = chosen.id;
    } catch { /* experience delivery must never affect analytics or host code */ }
  }

  onRouteChange(): void { this.renderer.destroy(); this.activeId = null; this.impressionId = null; void this.evaluate(); }
  onCustomEvent(name: string): void { void this.evaluate(name); }
  destroy(): void { this.destroyed = true; this.renderer.destroy(); this.activeId = null; }

  private async shown(experience: DeliveredExperience): Promise<void> {
    if (this.activeId !== experience.id || this.impressionId) return;
    this.state.markSeen(experience.id);
    const result = await this.post(experience, "shown"); this.impressionId = result?.impressionId ?? null;
  }

  private handleAction(experience: DeliveredExperience, action: ExperienceAction): void {
    void this.record(experience, "action", action.type);
    if (action.type === "open_url" && action.url) window.location.assign(action.url);
    if (action.type === "track_event" && action.eventName) this.trackEvent?.(action.eventName);
  }

  private async record(experience: DeliveredExperience, event: "dismissed" | "completed" | "action", action?: string): Promise<void> {
    await this.post(experience, event, action); if (event !== "action") { this.activeId = null; this.impressionId = null; }
  }

  private async post(experience: DeliveredExperience, event: "shown" | "dismissed" | "completed" | "action", action?: string): Promise<{ impressionId?: string } | null> {
    try {
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experience-events`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ experienceId: experience.id, versionId: experience.versionId, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? undefined, sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), impressionId: this.impressionId ?? undefined, event, action }) });
      return response.ok && response.status !== 204 ? await response.json() as { impressionId?: string } : null;
    } catch { return null; }
  }
}
