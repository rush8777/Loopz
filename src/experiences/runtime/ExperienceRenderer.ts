import type { DeliveredExperience, ExperienceAction, ExperienceBehavior, ExperienceContent, RuntimeGuideDefinition, RuntimeWidgetDefinition, SurveyAnswers } from "../types";
import { getGuideStepPattern, isGuideDefinition } from "../types";
import { AnchoredCardRenderer, findTarget, waitForTarget, type RenderCallbacks } from "./AnchoredCardRenderer";
import { ToastRenderer } from "./ToastRenderer";
import { CursorFollowRenderer } from "./CursorFollowRenderer";
import { ModalRenderer } from "./ModalRenderer";
import { SlideoutRenderer } from "./SlideoutRenderer";
import { HotspotRenderer } from "./HotspotRenderer";
import { BannerRenderer } from "./BannerRenderer";
import { SurveyRenderer } from "./SurveyRenderer";
import { LayerManager, type AppliedLayer } from "./layering/LayerManager";

export interface ExperienceRendererCallbacks {
  onVisible: () => void;
  onDismiss: () => void;
  onAction: (action: ExperienceAction) => void;
  onComplete: () => void;
  onGuideAdvance?: () => void;
  onGuideBack?: () => void;
  onUnavailable?: () => void;
  onSurveyProgress?: (answers: SurveyAnswers, currentStepId: string, direction: "next" | "back") => Promise<void> | void;
  onSurveySubmit?: (answers: SurveyAnswers, currentStepId: string) => Promise<void> | void;
}

export class ExperienceRenderer {
  private host: HTMLElement | null = null;
  private renderer: { destroy(): void } | null = null;
  private cancelPendingTarget: (() => void) | null = null;
  private cleanupAdvance: (() => void) | null = null;
  private appliedLayer: AppliedLayer | null = null;
  private layerManager = new LayerManager();

  render(experience: DeliveredExperience, callbacks: ExperienceRendererCallbacks, guideStepId?: string): boolean {
    this.destroy();
    if (isGuideDefinition(experience.definition)) return this.renderGuide(experience, experience.definition, callbacks, guideStepId);
    return this.renderWidget(experience, experience.definition, callbacks, guideStepId);
  }

  private root(experienceId: string, behavior: Pick<ExperienceBehavior, "layer" | "zIndex">, targetElement?: Element | null): ShadowRoot {
    this.host = document.createElement("div"); this.host.dataset.movecuesExperience = experienceId; this.host.dataset.movecuesExperienceRoot = experienceId; this.host.style.cssText = "position:fixed;inset:0;pointer-events:none";
    const root = this.host.attachShadow({ mode: "open" }); const style = document.createElement("style"); style.textContent = STYLES; root.appendChild(style); document.documentElement.appendChild(this.host);
    this.appliedLayer = this.layerManager.apply(this.host, { layer: behavior.layer, legacyZIndex: behavior.zIndex, targetElement });
    return root;
  }

  private renderWidget(experience: DeliveredExperience, definition: RuntimeWidgetDefinition, callbacks: ExperienceRendererCallbacks, requestedStepId?: string): boolean {
    if (experience.widgetType === "anchored_card" || experience.widgetType === "hotspot") {
      const mount = (target: Element) => { const root = this.root(experience.id, definition.behavior, target); const renderer = experience.widgetType === "hotspot" ? new HotspotRenderer() : new AnchoredCardRenderer(); this.renderer = renderer; renderer.render(root, target, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder, experience.widgetType ?? "anchored_card"); requestAnimationFrame(callbacks.onVisible); };
      const target = findTarget(definition.target);
      if (target) mount(target); else this.cancelPendingTarget = waitForTarget(definition.target, (element) => { this.cancelPendingTarget = null; mount(element); }, () => { this.cancelPendingTarget = null; callbacks.onUnavailable?.(); });
    } else if (experience.widgetType === "toast") {
      const root = this.root(experience.id, definition.behavior); const renderer = new ToastRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
    } else if (experience.widgetType === "cursor_follow") {
      const root = this.root(experience.id, definition.behavior); const renderer = new CursorFollowRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
    } else if (experience.widgetType === "modal") {
      const root = this.root(experience.id, definition.behavior); const renderer = new ModalRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
    } else if (experience.widgetType === "survey" && definition.survey) {
      const root = this.root(experience.id, definition.behavior); const renderer = new SurveyRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, definition.survey, { onDismiss: () => callbacks.onDismiss(), onProgress: (answers, stepId, direction) => callbacks.onSurveyProgress?.(answers, stepId, direction), onSubmit: (answers, stepId) => callbacks.onSurveySubmit?.(answers, stepId) }, requestedStepId);
    } else if (experience.widgetType === "slideout") {
      const root = this.root(experience.id, definition.behavior); const renderer = new SlideoutRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
    } else if (experience.widgetType === "banner") {
      const root = this.root(experience.id, definition.behavior); const renderer = new BannerRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
    } else return false;
    if (experience.widgetType !== "anchored_card" && experience.widgetType !== "hotspot") requestAnimationFrame(callbacks.onVisible); return true;
  }

  private renderGuide(experience: DeliveredExperience, definition: RuntimeGuideDefinition, callbacks: ExperienceRendererCallbacks, guideStepId?: string): boolean {
    const stepIndex = guideStepId ? definition.steps.findIndex(item => item.id === guideStepId) : 0;
    const step = definition.steps[stepIndex]; if (!step) return false;
    const stepDesign = step.size ? { ...definition.design, size: step.size } : definition.design;
    const stepCallbacks: RenderCallbacks = {
      onDismiss: () => { callbacks.onDismiss(); this.destroy(); },
      onSecondary: () => { callbacks.onDismiss(); this.destroy(); },
      onPrimary: () => {
        const action = step.content.primaryAction; if (action) callbacks.onAction(action);
        if ((step.advance?.type ?? "button") === "button") callbacks.onGuideAdvance?.();
      },
    };
    const addBack = (card: HTMLElement) => {
      if (stepIndex === 0) return;
      const back = document.createElement("button"); back.className = "secondary"; back.textContent = "Back";
      back.addEventListener("click", () => callbacks.onGuideBack?.());
      card.querySelector("footer")?.prepend(back);
    };
    if (getGuideStepPattern(step) === "modal") {
      const root = this.root(experience.id, { layer: definition.behavior?.layer }); const renderer = new ModalRenderer(); this.renderer = renderer;
      const behavior: ExperienceBehavior = { dismissible: step.behavior.dismissible ?? true };
      const card = renderer.render(root, step.content, stepDesign, behavior, stepCallbacks, step.builder);
      addBack(card);
      requestAnimationFrame(callbacks.onVisible);
      return true;
    }
    const mount = (target: Element) => {
      ensureGuideTargetInView(target);
      const root = this.root(experience.id, { layer: definition.behavior?.layer }, target); const renderer = new AnchoredCardRenderer(); this.renderer = renderer;
      const behavior: ExperienceBehavior = { dismissible: step.behavior.dismissible ?? true, placement: step.behavior.placement, alignment: step.behavior.alignment, offset: step.behavior.offset, pointer: step.behavior.pointer };
      const card = renderer.render(root, target, step.content, stepDesign, behavior, stepCallbacks, step.builder, "anchored_card");
      addBack(card);
      this.listenForAdvance(target, step.advance?.type ?? "button", step.advance?.type === "element_hover" ? step.advance.durationMs : undefined, callbacks.onGuideAdvance);
      requestAnimationFrame(callbacks.onVisible);
    };
    const target = findTarget(step.target);
    if (target) mount(target); else this.cancelPendingTarget = waitForTarget(step.target, (element) => { this.cancelPendingTarget = null; mount(element); }, () => { this.cancelPendingTarget = null; callbacks.onUnavailable?.(); });
    return true;
  }

  private listenForAdvance(target: Element, type: string, durationMs: number | undefined, advance?: () => void): void {
    if (!advance) return;
    if (type === "element_click") {
      let active = true;
      const click = () => queueMicrotask(() => { if (active) advance(); });
      target.addEventListener("click", click);
      this.cleanupAdvance = () => { active = false; target.removeEventListener("click", click); };
    } else if (type === "element_hover") {
      let timer: number | null = null;
      const leave = () => { if (timer !== null) window.clearTimeout(timer); timer = null; };
      const enter = () => { leave(); timer = window.setTimeout(advance, durationMs ?? 500); };
      target.addEventListener("mouseenter", enter); target.addEventListener("mouseleave", leave);
      this.cleanupAdvance = () => { leave(); target.removeEventListener("mouseenter", enter); target.removeEventListener("mouseleave", leave); };
    }
  }

  private callbacks(content: ExperienceContent, callbacks: ExperienceRendererCallbacks): RenderCallbacks {
    return {
      onDismiss: () => { callbacks.onDismiss(); this.destroy(); },
      onSecondary: () => { callbacks.onDismiss(); this.destroy(); },
      onPrimary: () => { if (content.primaryAction) callbacks.onAction(content.primaryAction); if (content.primaryAction?.type === "dismiss") { callbacks.onDismiss(); this.destroy(); } },
    };
  }

  private clearSurface(): void { this.cleanupAdvance?.(); this.cleanupAdvance = null; this.cancelPendingTarget?.(); this.cancelPendingTarget = null; this.renderer?.destroy(); this.renderer = null; this.appliedLayer?.destroy(); this.appliedLayer = null; this.host?.remove(); this.host = null; }
  destroy(): void { this.clearSurface(); }
}

const GUIDE_TARGET_VIEWPORT_MARGIN = 48;

function ensureGuideTargetInView(target: Element): void {
  const rect = target.getBoundingClientRect();
  const comfortablyVisible = rect.width > 0 && rect.height > 0
    && rect.top >= GUIDE_TARGET_VIEWPORT_MARGIN
    && rect.left >= GUIDE_TARGET_VIEWPORT_MARGIN
    && rect.bottom <= window.innerHeight - GUIDE_TARGET_VIEWPORT_MARGIN
    && rect.right <= window.innerWidth - GUIDE_TARGET_VIEWPORT_MARGIN;
  if (comfortablyVisible || typeof target.scrollIntoView !== "function") return;
  const prefersReducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
}

const STYLES = `
  :host{all:initial}.card{pointer-events:auto;position:fixed;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);padding:18px;background:var(--movecues-bg);color:var(--movecues-fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.12)}
  .card[data-width=sm]{width:260px}.card[data-width=lg]{width:400px}.card[data-radius=sm]{border-radius:6px}.card[data-radius=md]{border-radius:12px}.card[data-radius=lg]{border-radius:20px}
  .builder-card{padding:0;background:transparent;border:0;box-shadow:none}.builder-content{box-sizing:border-box;width:100%;max-width:100%;overflow:visible}.builder-card>.close{z-index:2}
  .movecues-anchor-pointer{position:absolute;width:var(--movecues-pointer-size);height:var(--movecues-pointer-size);pointer-events:none;z-index:0}.movecues-anchor-pointer svg{display:block;width:100%;height:100%;overflow:visible}.movecues-anchor-pointer[data-placement=bottom]{top:calc(-1 * var(--movecues-pointer-size));transform:translateX(-50%)}.movecues-anchor-pointer[data-placement=top]{bottom:calc(-1 * var(--movecues-pointer-size));transform:translateX(-50%) rotate(180deg)}.movecues-anchor-pointer[data-placement=right]{left:calc(-1 * var(--movecues-pointer-size));transform:translateY(-50%) rotate(-90deg)}.movecues-anchor-pointer[data-placement=left]{right:calc(-1 * var(--movecues-pointer-size));transform:translateY(-50%) rotate(90deg)}.builder-content,.legacy-content{position:relative;z-index:1}
  h2{font:600 17px/1.3 ui-sans-serif,system-ui,sans-serif;margin:0 24px 7px 0}p{margin:0;white-space:pre-wrap}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{border:0;border-radius:7px;padding:8px 12px;font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer}.primary{background:var(--movecues-primary);color:#fff}.secondary{background:transparent;color:inherit}.close{position:absolute;right:8px;top:7px;padding:3px 7px;background:transparent;color:inherit;font-size:20px}
  .toast{position:fixed!important}.toast[data-position=top-left]{top:16px;left:16px}.toast[data-position=top-right]{top:16px;right:16px}.toast[data-position=bottom-left]{bottom:16px;left:16px}.toast[data-position=bottom-right]{bottom:16px;right:16px}.cursor{will-change:left,top}@media(prefers-reduced-motion:reduce){.card{transition:none!important}}
  .backdrop{pointer-events:auto;position:fixed;inset:0;background:rgba(0,0,0,var(--movecues-backdrop-opacity,.45))}
  .modal{left:50%;top:50%;transform:translate(-50%,-50%)}.modal[data-layout=fullscreen],.modal[data-size-width=full]{inset:12px;width:auto!important;max-width:none!important;transform:none;display:flex;flex-direction:column;justify-content:center}.modal[data-layout=fullscreen] footer,.modal[data-size-width=full] footer{justify-content:center}
  .slideout[data-position=top-left]{top:16px;left:16px}.slideout[data-position=top-right]{top:16px;right:16px}.slideout[data-position=bottom-left]{bottom:16px;left:16px}.slideout[data-position=bottom-right]{bottom:16px;right:16px}.slideout[data-position=center-left]{left:16px;top:50%;transform:translateY(-50%)}.slideout[data-position=center-right]{right:16px;top:50%;transform:translateY(-50%)}
  .banner{left:0;right:0;width:auto!important;max-width:none;border-radius:0!important;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:center}.banner[data-position=top]{top:0}.banner[data-position=bottom]{bottom:0}.banner h2,.banner p{grid-column:1}.banner footer{grid-column:2;grid-row:1/span 2;margin:0;padding-right:24px}
  .hotspot{pointer-events:auto;position:fixed;width:18px;height:18px;padding:0;border:3px solid #fff;border-radius:50%;background:var(--movecues-hotspot);box-shadow:0 1px 5px rgba(0,0,0,.35);color:#fff;font:700 12px/12px ui-sans-serif,system-ui,sans-serif}.hotspot[data-style=pulse]::after{content:"";position:absolute;inset:-7px;border:2px solid var(--movecues-hotspot);border-radius:50%;animation:movecues-pulse 1.8s ease-out infinite}.hotspot[data-style=dot]{width:14px;height:14px}.hotspot[data-style=question]{width:22px;height:22px}@keyframes movecues-pulse{0%{transform:scale(.65);opacity:.85}100%{transform:scale(1.45);opacity:0}}@media(prefers-reduced-motion:reduce){.hotspot::after{animation:none}}
  .movecues-survey-question.has-error{outline:2px solid #fecaca;outline-offset:6px;border-radius:6px}.movecues-survey-validation{color:#b91c1c}.movecues-survey-option.is-selected{border-color:var(--movecues-primary)!important;background:color-mix(in srgb,var(--movecues-primary) 12%,white)!important}.movecues-survey-input{font:inherit}
`;
