import type { DeliveredChecklist, DeliveredExperience, ExperienceAction, PageRule, RuntimeGuideDefinition, SurveyAnswers } from "../types";
import { guideStepRequiresTarget, isGuideDefinition } from "../types";
import type { ExperienceSession } from "../runtimeInterfaces";
import { EligibilityEngine } from "./EligibilityEngine";
import { ExperienceRenderer } from "./ExperienceRenderer";
import { ExperienceStateStore, type GuideProgress } from "./ExperienceStateStore";
import { ChecklistManager } from "./ChecklistManager";

interface ActiveExperience {
  experience: DeliveredExperience;
  currentStepId?: string;
  impressionId: string | null;
  shownRequested: boolean;
  shownPromise: Promise<void> | null;
  surveyResponseId: string | null;
  surveyResponsePromise: Promise<string | null> | null;
  surveyAnswers: SurveyAnswers;
  stepStartedAt: number | null;
  visibleStepId: string | null;
  launchContext?: DeliveredExperience["launchContext"];
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
  private hasChecklistCandidates = false;
  private checklist: ChecklistManager;

  constructor(private apiBase: string, private siteId: string, private session: ExperienceSession, private trackEvent?: (name: string) => void) {
    this.checklist = new ChecklistManager(apiBase, siteId, session, (id, context) => this.launch(id, context));
  }

  async evaluate(trigger?: string): Promise<void> {
    if (this.destroyed) return;
    try {
      const manifest = await this.fetchExperiences(trigger);
      if (this.destroyed) return;
      this.hasChecklistCandidates = manifest.hasChecklists;
      this.checklist.setChecklist(manifest.checklists[0] ?? null);
      const experiences = manifest.experiences;
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
      if (stepId && stored?.launchContext && stored.navigationAttempted && isGuideDefinition(chosen.definition)) { const step = chosen.definition.steps.find(item => item.id === stepId); const path = step && guideStepRequiresTarget(step) ? step.target?.targetContext?.pagePath : undefined; if (path && path !== currentPagePath()) { this.state.clearGuideProgress(chosen.id); this.checklist.setTransientActive(false); return; } }
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
      this.renderer.destroy(); this.active = null; this.checklist.setTransientActive(false);
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

  refreshChecklist(): Promise<void> { return this.hasChecklistCandidates ? this.evaluate() : Promise.resolve(); }
  hasActiveChecklist(): boolean { return this.hasChecklistCandidates || this.checklist.hasChecklist(); }

  launchExperience(experienceId: string): Promise<void> { return this.launch(experienceId, { source: "api" }); }

  destroy(): void { this.destroyed = true; this.renderer.destroy(); this.checklist.destroy(); this.active = null; this.pausedGuide = null; this.queued = null; }

  private async fetchExperiences(trigger?: string): Promise<{ experiences: DeliveredExperience[]; checklists: DeliveredChecklist[]; hasChecklists: boolean }> {
    const query = new URLSearchParams({ url: location.href, anonymousId: this.session.getAnonymousId(), sessionId: this.session.getSessionId() });
    const userId = this.session.getIdentifiedUserId(); if (userId) query.set("trackedUserId", userId); if (trigger) query.set("trigger", trigger);
    const stored = this.state.getGuideProgress();
    if (stored) { query.set("activeGuideId", stored.experienceId); query.set("activeGuideVersionId", stored.versionId); }
    const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experiences?${query}`, { credentials: "omit" });
    if (!response.ok) return { experiences: [], checklists: [], hasChecklists: this.hasChecklistCandidates };
    const manifest = await response.json() as { experiences?: DeliveredExperience[]; checklists?: DeliveredChecklist[]; hasChecklists?: boolean };
    return { experiences: Array.isArray(manifest.experiences) ? manifest.experiences : [], checklists: Array.isArray(manifest.checklists) ? manifest.checklists : [], hasChecklists: manifest.hasChecklists === true };
  }

  private show(experience: DeliveredExperience, requestedStepId?: string, progress?: GuideProgress): void {
    if (this.queued?.id === experience.id) this.queued = null;
    const definition = isGuideDefinition(experience.definition) ? experience.definition : null;
    const currentStepId = definition?.steps.some(step => step.id === requestedStepId) ? requestedStepId : definition?.steps[0]?.id;
    const impressionId = progress?.impressionId ?? experience.impressionId ?? null;
    const runtime: ActiveExperience = { experience, currentStepId, impressionId, shownRequested: Boolean(impressionId), shownPromise: null, surveyResponseId: null, surveyResponsePromise: null, surveyAnswers: {}, stepStartedAt: null, visibleStepId: null, launchContext: progress?.launchContext ?? experience.launchContext };
    this.active = runtime;
    this.checklist.setTransientActive(true);
    if (currentStepId) this.persistGuide(runtime, "active");
    const mounted = currentStepId
      ? (progress && this.advanceForRoute(runtime) ? true : (this.renderActiveGuide(), true))
      : this.renderer.render(experience, this.callbacks(runtime), currentStepId);
    if (!mounted && this.active === runtime) { this.active = null; this.checklist.setTransientActive(false); if (currentStepId) this.state.clearGuideProgress(experience.id); }
  }

  private callbacks(runtime: ActiveExperience) {
    return {
      onVisible: () => { this.shown(runtime); this.stepVisible(runtime); },
      onDismiss: () => void this.finish(runtime, "dismissed"),
      onAction: (action: ExperienceAction) => this.handleAction(runtime, action),
      onComplete: () => void this.finish(runtime, "completed"),
      onGuideAdvance: () => this.advanceGuide(),
      onGuideBack: () => this.backGuide(),
      onUnavailable: () => {
        if (this.active !== runtime) return;
        this.active = null;
        if (runtime.currentStepId && runtime.launchContext) { this.state.clearGuideProgress(runtime.experience.id); this.checklist.setTransientActive(false); void this.checklist.refresh(); }
        else if (runtime.currentStepId) { this.pausedGuide = runtime; this.persistGuide(runtime, "paused"); this.checklist.setTransientActive(false); }
      },
      onSurveyProgress: async (answers: SurveyAnswers, stepId: string, direction: "next" | "back") => { await this.persistSurvey(runtime, answers, stepId); if (direction === "next") void this.post(runtime, "interaction", undefined, "survey_step_completed", { stepId, stepIndex: this.surveyStepIndex(runtime, stepId) }); },
      onSurveySubmit: async (answers: SurveyAnswers, stepId: string) => { await this.persistSurvey(runtime, answers, stepId, "submitted"); await this.finish(runtime, "completed", true); },
    };
  }

  private shown(runtime: ActiveExperience): void {
    if (runtime.shownRequested) return;
    runtime.shownRequested = true;
    this.state.markSeen(runtime.experience.id);
    runtime.shownPromise = this.post(runtime, "shown", undefined, "experience_shown").then(result => {
      runtime.impressionId = result?.impressionId ?? null;
      if (this.active === runtime) this.persistGuide(runtime, "active");
      else if (this.pausedGuide === runtime) this.persistGuide(runtime, "paused");
    });
    if (runtime.experience.widgetType === "survey") void runtime.shownPromise.then(async () => { await this.ensureSurveyResponse(runtime); await this.post(runtime, "interaction", undefined, "survey_started"); });
  }

  private handleAction(runtime: ActiveExperience, action: ExperienceAction): void {
    if (!isGuideDefinition(runtime.experience.definition)) void this.recordAction(runtime, action.type);
    if (action.type === "open_url" && action.url) window.location.assign(action.url);
    if (action.type === "track_event" && action.eventName) this.trackEvent?.(action.eventName);
  }

  private async recordAction(runtime: ActiveExperience, action: string): Promise<void> {
    await runtime.shownPromise; await this.post(runtime, "action", action, "widget_interacted");
  }

  private async finish(runtime: ActiveExperience, event: "dismissed" | "completed", surveyAlreadyPersisted = false): Promise<void> {
    if (this.active === runtime) { this.renderer.destroy(); this.active = null; }
    if (runtime.currentStepId) this.state.clearGuideProgress(runtime.experience.id);
    if (runtime.experience.widgetType === "survey" && event === "dismissed" && !surveyAlreadyPersisted) await this.persistSurvey(runtime, runtime.surveyAnswers, null, "abandoned");
    await runtime.shownPromise;
    const guide = isGuideDefinition(runtime.experience.definition);
    const eventType = guide ? (event === "completed" ? "guide_completed" : "guide_dismissed") : runtime.experience.widgetType === "survey" ? (event === "completed" ? "survey_submitted" : "survey_abandoned") : event === "dismissed" ? "widget_dismissed" : "widget_interacted";
    await this.post(runtime, event, undefined, eventType, guide ? this.currentStepPayload(runtime, event === "dismissed") : undefined);
    this.justFinishedId = runtime.experience.id;
    this.checklist.setTransientActive(false);
    void this.checklist.refresh();
    if (!this.destroyed) void this.evaluate();
  }

  private advanceGuide(): void {
    const runtime = this.activeGuide(); if (!runtime) return;
    const definition = runtime.experience.definition;
    const index = definition.steps.findIndex(step => step.id === runtime.currentStepId);
    if (index < 0) return;
    void this.post(runtime, "interaction", undefined, "guide_step_completed", this.currentStepPayload(runtime, true));
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
    runtime.stepStartedAt = null; runtime.visibleStepId = null;
    this.persistGuide(runtime, "active");
    this.renderActiveGuide();
  }

  private renderActiveGuide(): void {
    const runtime = this.activeGuide(); if (!runtime) return;
    this.renderer.destroy();
    if (!this.currentGuideStepMatchesPage(runtime)) return;
    this.renderer.render(runtime.experience, this.callbacks(runtime), runtime.currentStepId);
  }

  private stepVisible(runtime: ActiveExperience): void {
    if (!runtime.currentStepId || runtime.visibleStepId === runtime.currentStepId) return;
    runtime.visibleStepId = runtime.currentStepId;
    runtime.stepStartedAt = performance.now();
    const definition = runtime.experience.definition as RuntimeGuideDefinition;
    const stepIndex = definition.steps.findIndex(step => step.id === runtime.currentStepId);
    void (runtime.shownPromise ?? Promise.resolve()).then(() => this.post(runtime, "interaction", undefined, "guide_step_shown", { stepId: runtime.currentStepId!, stepIndex }));
  }

  private currentStepPayload(runtime: ActiveExperience, includeDuration: boolean): { stepId: string; stepIndex: number; durationMs?: number } | undefined {
    if (!runtime.currentStepId || !isGuideDefinition(runtime.experience.definition)) return undefined;
    const stepIndex = runtime.experience.definition.steps.findIndex(step => step.id === runtime.currentStepId);
    const durationMs = includeDuration && runtime.stepStartedAt !== null ? Math.max(0, Math.round(performance.now() - runtime.stepStartedAt)) : undefined;
    return { stepId: runtime.currentStepId, stepIndex, ...(durationMs !== undefined ? { durationMs } : {}) };
  }

  private surveyStepIndex(runtime: ActiveExperience, stepId: string): number {
    const definition = runtime.experience.definition;
    return !isGuideDefinition(definition) ? definition.survey?.steps.findIndex(step => step.id === stepId) ?? -1 : -1;
  }

  private currentGuideStepMatchesPage(runtime: ActiveExperience): boolean {
    const step = this.currentGuideStep(runtime);
    const pagePath = step && guideStepRequiresTarget(step) ? step.target?.targetContext?.pagePath : undefined;
    return !pagePath || pagePath === currentPagePath();
  }

  private pauseGuide(): void {
    const runtime = this.activeGuide(); if (!runtime) return;
    this.renderer.destroy(); this.active = null; this.pausedGuide = runtime; this.persistGuide(runtime, "paused");
  }

  private async launch(experienceId: string, context: { source: "api" } | { source: "checklist"; checklistExperienceId: string; itemId: string }): Promise<void> {
    if (this.destroyed) return;
    try {
      const userId = this.session.getIdentifiedUserId();
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experiences/${encodeURIComponent(experienceId)}/launch`, { method: "POST", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: location.href, anonymousId: this.session.getAnonymousId(), ...(userId ? { trackedUserId: userId } : {}), sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), timestamp: Date.now(), source: context.source, ...(context.source === "checklist" ? { checklistExperienceId: context.checklistExperienceId, itemId: context.itemId } : {}) }) });
      if (!response.ok || this.destroyed) { this.checklist.setTransientActive(false); return; }
      const experience = await response.json() as DeliveredExperience;
      if (!isGuideDefinition(experience.definition)) return;
      const first = experience.definition.steps[0]; const targetPath = first && guideStepRequiresTarget(first) ? first.target?.targetContext?.pagePath : undefined;
      if (targetPath && targetPath !== currentPagePath()) {
        const destination = new URL(targetPath, location.origin); if (destination.origin !== location.origin) return;
        this.state.setGuideProgress({ experienceId: experience.id, versionId: experience.versionId, currentStepId: first.id, status: "paused", launchContext: experience.launchContext, navigationAttempted: true });
        this.checklist.setTransientActive(true); location.assign(destination.href); return;
      }
      if (this.active) { if (this.activeGuide()) this.pauseGuide(); else { this.renderer.destroy(); this.active = null; } }
      this.show(experience);
    } catch { this.checklist.setTransientActive(false); }
  }

  private resumeGuide(): void {
    const runtime = this.pausedGuide; if (!runtime) return;
    this.pausedGuide = null; this.active = runtime; this.checklist.setTransientActive(true); this.persistGuide(runtime, "active"); this.renderActiveGuide();
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
    if (runtime.currentStepId) { const previous = this.state.getGuideProgress(); this.state.setGuideProgress({ experienceId: runtime.experience.id, versionId: runtime.experience.versionId, currentStepId: runtime.currentStepId, status, ...(runtime.impressionId ? { impressionId: runtime.impressionId } : {}), ...(runtime.launchContext ? { launchContext: runtime.launchContext } : {}), ...(previous?.experienceId === runtime.experience.id && previous.navigationAttempted ? { navigationAttempted: true } : {}) }); }
  }

  private async post(runtime: ActiveExperience, event: "shown" | "dismissed" | "completed" | "action" | "interaction", action?: string, eventType: "experience_shown" | "guide_step_shown" | "guide_step_completed" | "guide_completed" | "guide_dismissed" | "survey_started" | "survey_step_completed" | "survey_submitted" | "survey_abandoned" | "widget_interacted" | "widget_dismissed" = "widget_interacted", detail?: { stepId: string; stepIndex: number; durationMs?: number }): Promise<{ impressionId?: string } | null> {
    const experience = runtime.experience;
    try {
      if (event !== "shown" && runtime.shownPromise) await runtime.shownPromise;
      const launchContext = runtime.launchContext ? runtime.launchContext.source === "checklist" ? { launchSource: "checklist", sourceExperienceId: runtime.launchContext.sourceExperienceId, sourceItemId: runtime.launchContext.sourceItemId } : { launchSource: "api" } : undefined;
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experience-events`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify({ experienceId: experience.id, versionId: experience.versionId, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? undefined, sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), impressionId: runtime.impressionId ?? undefined, event, eventType, timestamp: Date.now(), action, ...(event === "shown" && launchContext ? { launchContext } : {}), ...detail }) });
      return response.ok && response.status !== 204 ? await response.json() as { impressionId?: string } : null;
    } catch { return null; }
  }

  private async ensureSurveyResponse(runtime: ActiveExperience): Promise<string | null> {
    if (runtime.surveyResponseId) return runtime.surveyResponseId;
    if (runtime.surveyResponsePromise) return runtime.surveyResponsePromise;
    runtime.surveyResponsePromise = (async () => {
      if (!runtime.shownRequested) this.shown(runtime);
      await runtime.shownPromise;
      if (!runtime.impressionId) return null;
      try {
        const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/survey-responses`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify(this.surveyIdentity(runtime)) });
        if (!response.ok) return null;
        const body = await response.json() as { responseId?: string };
        runtime.surveyResponseId = body.responseId ?? null;
        return runtime.surveyResponseId;
      } catch { return null; }
    })();
    const result = await runtime.surveyResponsePromise;
    runtime.surveyResponsePromise = null;
    return result;
  }

  private async persistSurvey(runtime: ActiveExperience, answers: SurveyAnswers, currentStepId: string | null, state?: "submitted" | "abandoned"): Promise<void> {
    const responseId = await this.ensureSurveyResponse(runtime); if (!responseId || !runtime.impressionId) return;
    runtime.surveyAnswers = { ...answers };
    try {
      await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/survey-responses/${encodeURIComponent(responseId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify({ ...this.surveyIdentity(runtime), currentStepId, answers, ...(state === "submitted" ? { submitted: true } : {}), ...(state === "abandoned" ? { abandoned: true } : {}) }) });
    } catch { /* response persistence must never affect host code */ }
  }

  private surveyIdentity(runtime: ActiveExperience) {
    return { experienceId: runtime.experience.id, versionId: runtime.experience.versionId, impressionId: runtime.impressionId!, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? undefined, sessionId: this.session.getSessionId() };
  }
}

function currentPagePath(): string { return `${location.pathname}${location.search}${location.hash}`; }
function matchesRules(pagePath: string, rules: PageRule[]): boolean {
  const matches = (rule: PageRule) => { if (rule.operator === "equals") return pagePath === rule.value; if (rule.operator === "starts_with") return pagePath.startsWith(rule.value); if (rule.operator === "ends_with") return pagePath.endsWith(rule.value); if (rule.operator === "contains") return pagePath.includes(rule.value); const escaped = rule.value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"); return new RegExp(`^${escaped}$`).test(pagePath); };
  const includes = rules.filter(rule => rule.kind === "include");
  return includes.length > 0 && !rules.some(rule => rule.kind === "exclude" && matches(rule)) && includes.some(matches);
}
