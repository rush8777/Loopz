import { findTarget } from "../runtime/AnchoredCardRenderer";
import { captureTargetFor, guideCapturePath } from "./GuideCaptureTargets";
import type { CaptureObservation, CapturedGuideTarget } from "./GuideCaptureTypes";

type WithoutSequence<T> = T extends { sequence: number } ? Omit<T, "sequence"> : never;
export type NewCaptureObservation = WithoutSequence<CaptureObservation>;
const surfaceSelector = 'dialog[open],[role="dialog"][aria-modal="true"],[role="menu"][data-state="open"]';
const linkSelector = 'a[href],[role="link"]';
const choiceSelector = 'select,input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="switch"],[role="tab"]';
const controlSelector = `button,[role="button"],input[type="button"],input[type="submit"],${linkSelector},${choiceSelector}`;

/** Observe only discrete author interactions. A nearby click is temporal evidence. */
export class GuideCaptureJourney {
  private active = false;
  private path: string | null = null;
  private recentClick: { sequence: number; path: string; time: number } | undefined;
  private frame = 0;

  constructor(
    private readonly targets: () => CapturedGuideTarget[],
    private readonly record: (observation: NewCaptureObservation) => number,
  ) {}

  activate(previousPath?: string | null): void {
    if (this.active) return;
    this.active = true;
    this.path = previousPath ?? guideCapturePath();
    window.addEventListener("click", this.observeClick, { capture: true, passive: true });
    this.routeChanged();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.recentClick = undefined;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    window.removeEventListener("click", this.observeClick, true);
  }

  routeChanged(): void {
    if (!this.active) return;
    const from = this.path;
    const to = guideCapturePath();
    this.path = to;
    if (from && to && from !== to) {
      const click = this.recentClick;
      const afterClick = click?.path === from && performance.now() - click.time <= 2500 ? click.sequence : undefined;
      this.record({ type: "route", from, to, afterClick });
    }
    if (from !== to) this.recentClick = undefined;
  }

  private observeClick = (event: MouseEvent): void => {
    if (!event.isTrusted) return;
    this.routeChanged();
    const path = this.path;
    const element = captureTargetFor(event.target);
    if (!path || !element?.matches(controlSelector)) return;
    const control = element.matches(linkSelector) ? "link" : element.matches(choiceSelector) ? "choice" : "button";
    const targetId = this.targets().find(item => item.target.targetContext.pagePath === path && findTarget(item.target) === element)?.id;
    const afterClick = this.record({ type: "click", path, control, targetId });
    this.recentClick = { sequence: afterClick, path, time: performance.now() };
    cancelAnimationFrame(this.frame);
    if (control === "link") return;
    const before = document.querySelector(surfaceSelector);
    const alreadyExpanded = element.getAttribute("aria-expanded") === "true";
    this.frame = requestAnimationFrame(() => {
      if (!this.active || guideCapturePath() !== path) return;
      const shown = document.querySelector(surfaceSelector);
      if (shown && shown !== before && captureTargetFor(shown)) {
        this.record({ type: "ui", path, afterClick, surface: shown.getAttribute("role") === "menu" ? "menu" : "dialog" });
      } else if (!alreadyExpanded && element.getAttribute("aria-expanded") === "true") {
        this.record({ type: "ui", path, afterClick, surface: "expanded" });
      }
    });
  };
}
