import { EventBus } from "../core/EventBus";
import type { FunnelDefinition, FunnelProgress, FunnelStep } from "../types/funnel";
import type { FunnelEventPayload } from "../types/events";

function normalizeStep(step: FunnelStep): { kind: "page" | "event"; matcher: string } {
  if (typeof step === "string") return { kind: "page", matcher: step };
  if ("path" in step) return { kind: "page", matcher: step.path };
  return { kind: "event", matcher: step.event };
}

function matchesPath(pattern: string, path: string): boolean {
  if (pattern.endsWith("/*")) {
    return path.startsWith(pattern.slice(0, -1));
  }
  return pattern === path;
}

/**
 * Tracks progression through developer-defined funnels automatically.
 * Page-based funnels advance on SPA route changes / page loads; event-based
 * funnels advance on analytics.event() calls. The developer defines the
 * funnel once via analytics.defineFunnel() - no manual step tracking.
 */
export class FunnelTracker {
  private funnels = new Map<string, FunnelDefinition>();
  private progress = new Map<string, FunnelProgress>();

  constructor(private bus: EventBus) {}

  define(name: string, steps: FunnelStep[]): void {
    const kind = normalizeStep(steps[0]).kind;
    this.funnels.set(name, { name, steps, kind });
    this.progress.set(name, { name, currentStepIndex: -1 });
  }

  /** Called on every page view (initial load + SPA route change). */
  onPageView(path: string): void {
    for (const funnel of this.funnels.values()) {
      if (funnel.kind !== "page") continue;
      this.tryAdvance(funnel, path);
    }
  }

  /** Called on every analytics.event() call. */
  onCustomEvent(eventName: string): void {
    for (const funnel of this.funnels.values()) {
      if (funnel.kind !== "event") continue;
      this.tryAdvance(funnel, eventName);
    }
  }

  private tryAdvance(funnel: FunnelDefinition, value: string): void {
    const progress = this.progress.get(funnel.name)!;
    if (progress.completedAt) return; // already completed, funnels don't re-trigger mid-session

    const nextIndex = progress.currentStepIndex + 1;
    if (nextIndex >= funnel.steps.length) return;

    const nextStep = normalizeStep(funnel.steps[nextIndex]);
    const isMatch =
      nextStep.kind === "page" ? matchesPath(nextStep.matcher, value) : nextStep.matcher === value;

    if (!isMatch) return;

    progress.currentStepIndex = nextIndex;
    if (nextIndex === 0) progress.startedAt = Date.now();

    const completed = nextIndex === funnel.steps.length - 1;
    if (completed) progress.completedAt = Date.now();

    const payload: FunnelEventPayload = {
      funnelName: funnel.name,
      stepIndex: nextIndex,
      stepLabel: nextStep.matcher,
      status: completed ? "funnel_completed" : "step_completed",
    };

    this.bus.emit("funnel", payload);
  }

  /** Returns a snapshot of all funnel progress, useful for debugging. */
  getProgress(): FunnelProgress[] {
    return [...this.progress.values()];
  }
}
