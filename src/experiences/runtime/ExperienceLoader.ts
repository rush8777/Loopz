import type { DeliveredExperience, ExperienceAction, PageRule, RuntimeGuideDefinition } from "../types";
import { isGuideDefinition } from "../types";
import type { ExperienceSession } from "../runtimeInterfaces";
import { EligibilityEngine } from "./EligibilityEngine";
import { ExperienceRenderer } from "./ExperienceRenderer";
import { ExperienceStateStore, type GuideProgress } from "./ExperienceStateStore";

interface ActiveExperience {
  experience: DeliveredExperience;
  currentStepId?: string;
  impressionId: string | null;
  shownRequested: boolean;
  shownPromise: Promise<void> | null;
}

export class ExperienceLoader {
  private renderer = new ExperienceRenderer();
  private eligibility = new EligibilityEngine();
  private state = new ExperienceStateStore();
  private active: ActiveExperience | null = null;
  private pausedGuide: ActiveExperience | null = null;
  private queued: DeliveredExperience | null = null;
  private justFinishedId: string | null = null;
  private destroyed = false;

  constructor(private apiBase: string, private siteId: string, private session: ExperienceSession, private trackEvent?: (name: string) => void) {}

  async evaluate(trigger?: string): Promise<void> {
    if (this.destroyed) return;
    try {
      const experiences = await this.fetchExperiences(trigger);
      if (this.destroyed) return;
      const candidates = [...experiences, ...(this.queued ? [this.queued] : [])].filter((item, index, all) => item.id !== this.active?.experience.id && item.id !== this.justFinishedId && all.findIndex(candidate => candidate.id === item.id) === index);
      const chosen = this.eligibility.choose(candidates);
      this.justFinishedId = null;

      if (this.active) {
        const activeGuide = this.activeGuide();
        if (activeGuide && chosen && chosen.priority > activeGuide.experience.priority && chosen.interruptPolicy === "interrupt") {
          this.pauseGuide();
          this.show(chosen);
        } else if (chosen) this.queued = chosen;
        return;
      }

      if (this.pausedGuide) {
        if (chosen && chosen.id !== this.pausedGuide.experience.id && chosen.priority > this.pausedGuide.experience.priority && chosen.interruptPolicy === "interrupt") this.show(chosen);
        else this.resumeGuide();
        return;
      }

      if (!chosen) return;
      const stored = this.state.getGuideProgress();
      const stepId = isGuideDefinition(chosen.definition) && stored?.experienceId === chosen.id && stored.versionId === chosen.versionId ? stored.currentStepId : undefined;
      this.show(chosen, stepId, stepId ? stored ?? undefined : undefined);
    } catch { /* experience delivery must never affect analytics or host code */ }
  }

  onRouteChange(): void {
    if (this.destroyed) return;
    const activeGuide = this.activeGuide();
    if (activeGuide) {
      const advanced = this.advanceForRoute(activeGuide);
      if (!advanced) this.renderActiveGuide();
      else if (!this.active) return;
    } else if (this.active) {
      this.renderer.destroy(); this.active = null;
    } else if (this.pausedGuide) this.advanceForRoute(this.pausedGuide);
    void this.evaluate();
  }

  onCustomEvent(name: string): void {
    const activeGuide = this.activeGuide();
    if (activeGuide) {
      const step = this.currentGuideStep(activeGuide);
      if (step?.advance?.type === "custom_event" && step.advance.eventName === name) { this.advanceGuide(); return; }
    }
    void this.evaluate(name);
  }

  destroy(): void { this.destroyed = true; this.renderer.destroy(); this.active = null; this.pausedGuide = null; this.queued = null; }

  private async fetchExperiences(trigger?: string): Promise<DeliveredExperience[]> {
    const query = new URLSearchParams({ url: location.href, anonymousId: this.session.getAnonymousId(), sessionId: this.session.getSessionId() });
    const userId = this.session.getIdentifiedUserId(); if (userId) query.set("trackedUserId", userId); if (trigger) query.set("trigger", trigger);
    const stored = this.state.getGuideProgress();
    if (stored) { query.set("activeGuideId", stored.experienceId); query.set("activeGuideVersionId", stored.versionId); }
    const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experiences?${query}`, { credentials: "omit" });
    if (!response.ok) return [];
    const manifest = await response.json() as { experiences?: DeliveredExperience[] };
    return Array.isArray(manifest.experiences) ? manifest.experiences : [];
  }

  private show(experience: DeliveredExperience, requestedStepId?: string, progress?: GuideProgress): void {
    if (this.queued?.id === experience.id) this.queued = null;
    const definition = isGuideDefinition(experience.definition) ? experience.definition : null;
    const currentStepId = definition?.steps.some(step => step.id === requestedStepId) ? requestedStepId : definition?.steps[0]?.id;
    const impressionId = progress?.impressionId ?? experience.impressionId ?? null;
    const runtime: ActiveExperience = { experience, currentStepId, impressionId, shownRequested: Boolean(impressionId), shownPromise: null };
    this.active = runtime;
    if (currentStepId) this.persistGuide(runtime, "active");
    const mounted = currentStepId
      ? (progress && this.advanceForRoute(runtime) ? true : (this.renderActiveGuide(), true))
      : this.renderer.render(experience, this.callbacks(runtime), currentStepId);
    if (!mounted && this.active === runtime) { this.active = null; if (currentStepId) this.state.clearGuideProgress(experience.id); }
  }

  private callbacks(runtime: ActiveExperience) {
    return {
      onVisible: () => this.shown(runtime),
      onDismiss: () => void this.finish(runtime, "dismissed"),
      onAction: (action: ExperienceAction) => this.handleAction(runtime, action),
      onComplete: () => void this.finish(runtime, "completed"),
      onGuideAdvance: () => this.advanceGuide(),
      onGuideBack: () => this.backGuide(),
      onUnavailable: () => {
        if (this.active !== runtime) return;
        this.active = null;
        if (runtime.currentStepId) { this.pausedGuide = runtime; this.persistGuide(runtime, "paused"); }
      },
    };
  }

  private shown(runtime: ActiveExperience): void {
    if (runtime.shownRequested) return;
    runtime.shownRequested = true;
    this.state.markSeen(runtime.experience.id);
    runtime.shownPromise = this.post(runtime, "shown").then(result => {
      runtime.impressionId = result?.impressionId ?? null;
      if (this.active === runtime) this.persistGuide(runtime, "active");
      else if (this.pausedGuide === runtime) this.persistGuide(runtime, "paused");
    });
  }

  private handleAction(runtime: ActiveExperience, action: ExperienceAction): void {
    void this.recordAction(runtime, action.type);
    if (action.type === "open_url" && action.url) window.location.assign(action.url);
    if (action.type === "track_event" && action.eventName) this.trackEvent?.(action.eventName);
  }

  private async recordAction(runtime: ActiveExperience, action: string): Promise<void> {
    await runtime.shownPromise; await this.post(runtime, "action", action);
  }

  private async finish(runtime: ActiveExperience, event: "dismissed" | "completed"): Promise<void> {
    if (this.active === runtime) { this.renderer.destroy(); this.active = null; }
    if (runtime.currentStepId) this.state.clearGuideProgress(runtime.experience.id);
    await runtime.shownPromise; await this.post(runtime, event);
    this.justFinishedId = runtime.experience.id;
    if (!this.destroyed) void this.evaluate();
  }

  private advanceGuide(): void {
    const runtime = this.activeGuide(); if (!runtime) return;
    const definition = runtime.experience.definition;
    const index = definition.steps.findIndex(step => step.id === runtime.currentStepId);
    if (index < 0) return;
    if (index === definition.steps.length - 1) { void this.finish(runtime, "completed"); return; }
    runtime.currentStepId = definition.steps[index + 1].id;
    this.persistGuide(runtime, "active");
    this.renderActiveGuide();
  }

  private backGuide(): void {
    const runtime = this.activeGuide(); if (!runtime) return;
    const definition = runtime.experience.definition;
    const index = definition.steps.findIndex(step => step.id === runtime.currentStepId);
    if (index <= 0) return;
    runtime.currentStepId = definition.steps[index - 1].id;
    this.persistGuide(runtime, "active");
    this.renderActiveGuide();
  }

  private renderActiveGuide(): void {
    const runtime = this.activeGuide(); if (!runtime) return;
    this.renderer.destroy();
    if (!this.currentGuideStepMatchesPage(runtime)) return;
    this.renderer.render(runtime.experience, this.callbacks(runtime), runtime.currentStepId);
  }

  private currentGuideStepMatchesPage(runtime: ActiveExperience): boolean {
    const pagePath = this.currentGuideStep(runtime)?.target?.targetContext?.pagePath;
    return !pagePath || pagePath === currentPagePath();
  }

  private pauseGuide(): void {
    const runtime = this.activeGuide(); if (!runtime) return;
    this.renderer.destroy(); this.active = null; this.pausedGuide = runtime; this.persistGuide(runtime, "paused");
  }

  private resumeGuide(): void {
    const runtime = this.pausedGuide; if (!runtime) return;
    this.pausedGuide = null; this.active = runtime; this.persistGuide(runtime, "active"); this.renderActiveGuide();
  }

  private advanceForRoute(runtime: ActiveExperience): boolean {
    const step = this.currentGuideStep(runtime);
    if (step?.advance?.type !== "route" || !matchesRules(currentPagePath(), step.advance.pageRules)) return false;
    if (runtime === this.active) this.advanceGuide();
    else {
      const definition = runtime.experience.definition as RuntimeGuideDefinition;
      const index = definition.steps.findIndex(item => item.id === runtime.currentStepId);
      if (index >= 0 && index < definition.steps.length - 1) { runtime.currentStepId = definition.steps[index + 1].id; this.persistGuide(runtime, "paused"); }
    }
    return true;
  }

  private currentGuideStep(runtime: ActiveExperience | null) {
    if (!runtime || !isGuideDefinition(runtime.experience.definition)) return undefined;
    return runtime.experience.definition.steps.find(step => step.id === runtime.currentStepId);
  }

  private activeGuide(): (ActiveExperience & { currentStepId: string; experience: DeliveredExperience & { definition: RuntimeGuideDefinition } }) | null {
    const runtime = this.active;
    return runtime?.currentStepId && isGuideDefinition(runtime.experience.definition) ? runtime as ActiveExperience & { currentStepId: string; experience: DeliveredExperience & { definition: RuntimeGuideDefinition } } : null;
  }

  private persistGuide(runtime: ActiveExperience, status: GuideProgress["status"]): void {
    if (runtime.currentStepId) this.state.setGuideProgress({ experienceId: runtime.experience.id, versionId: runtime.experience.versionId, currentStepId: runtime.currentStepId, status, ...(runtime.impressionId ? { impressionId: runtime.impressionId } : {}) });
  }

  private async post(runtime: ActiveExperience, event: "shown" | "dismissed" | "completed" | "action", action?: string): Promise<{ impressionId?: string } | null> {
    const experience = runtime.experience;
    try {
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experience-events`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify({ experienceId: experience.id, versionId: experience.versionId, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? undefined, sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), impressionId: runtime.impressionId ?? undefined, event, action }) });
      return response.ok && response.status !== 204 ? await response.json() as { impressionId?: string } : null;
    } catch { return null; }
  }
}

function currentPagePath(): string { return `${location.pathname}${location.search}${location.hash}`; }
function matchesRules(pagePath: string, rules: PageRule[]): boolean {
  const matches = (rule: PageRule) => { if (rule.operator === "equals") return pagePath === rule.value; if (rule.operator === "starts_with") return pagePath.startsWith(rule.value); if (rule.operator === "ends_with") return pagePath.endsWith(rule.value); if (rule.operator === "contains") return pagePath.includes(rule.value); const escaped = rule.value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"); return new RegExp(`^${escaped}$`).test(pagePath); };
  const includes = rules.filter(rule => rule.kind === "include");
  return includes.length > 0 && !rules.some(rule => rule.kind === "exclude" && matches(rule)) && includes.some(matches);
}
