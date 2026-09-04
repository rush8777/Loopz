import type { DeliveredExperience, ExperienceAction, ExperienceBehavior, ExperienceContent, RuntimeGuideDefinition, RuntimeWidgetDefinition } from "../types";
import { isGuideDefinition } from "../types";
import { AnchoredCardRenderer, findTarget, waitForTarget, type RenderCallbacks } from "./AnchoredCardRenderer";
import { ToastRenderer } from "./ToastRenderer";
import { CursorFollowRenderer } from "./CursorFollowRenderer";
import { ModalRenderer } from "./ModalRenderer";
import { SlideoutRenderer } from "./SlideoutRenderer";
import { HotspotRenderer } from "./HotspotRenderer";
import { BannerRenderer } from "./BannerRenderer";

export interface ExperienceRendererCallbacks {
  onVisible: () => void;
  onDismiss: () => void;
  onAction: (action: ExperienceAction) => void;
  onComplete: () => void;
  onUnavailable?: () => void;
}

export class ExperienceRenderer {
  private host: HTMLElement | null = null;
  private renderer: { destroy(): void } | null = null;
  private cancelPendingTarget: (() => void) | null = null;
  private step = 0;

  render(experience: DeliveredExperience, callbacks: ExperienceRendererCallbacks): boolean {
    this.destroy(); this.step = 0;
    if (isGuideDefinition(experience.definition)) return this.renderGuide(experience, experience.definition, callbacks);
    return this.renderWidget(experience, experience.definition, callbacks);
  }

  private root(): ShadowRoot {
    this.host = document.createElement("div"); this.host.dataset.loopzExperience = ""; this.host.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:none";
    const root = this.host.attachShadow({ mode: "open" }); const style = document.createElement("style"); style.textContent = STYLES; root.appendChild(style); document.documentElement.appendChild(this.host); return root;
  }

  private renderWidget(experience: DeliveredExperience, definition: RuntimeWidgetDefinition, callbacks: ExperienceRendererCallbacks): boolean {
    if (experience.widgetType === "anchored_card" || experience.widgetType === "hotspot") {
      const mount = (target: Element) => { const root = this.root(); const renderer = experience.widgetType === "hotspot" ? new HotspotRenderer() : new AnchoredCardRenderer(); this.renderer = renderer; renderer.render(root, target, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks)); requestAnimationFrame(callbacks.onVisible); };
      const target = findTarget(definition.target);
      if (target) mount(target); else this.cancelPendingTarget = waitForTarget(definition.target, (element) => { this.cancelPendingTarget = null; mount(element); }, () => { this.cancelPendingTarget = null; callbacks.onUnavailable?.(); });
    } else if (experience.widgetType === "toast") {
      const root = this.root(); const renderer = new ToastRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else if (experience.widgetType === "cursor_follow") {
      const root = this.root(); const renderer = new CursorFollowRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else if (experience.widgetType === "modal") {
      const root = this.root(); const renderer = new ModalRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else if (experience.widgetType === "slideout") {
      const root = this.root(); const renderer = new SlideoutRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else if (experience.widgetType === "banner") {
      const root = this.root(); const renderer = new BannerRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else return false;
    if (experience.widgetType !== "anchored_card" && experience.widgetType !== "hotspot") requestAnimationFrame(callbacks.onVisible); return true;
  }

  private renderGuide(experience: DeliveredExperience, definition: RuntimeGuideDefinition, callbacks: ExperienceRendererCallbacks): boolean {
    const step = definition.steps[this.step]; if (!step) return false;
    const mount = (target: Element) => {
    const root = this.root(); const renderer = new AnchoredCardRenderer(); this.renderer = renderer;
    const behavior: ExperienceBehavior = { dismissible: step.behavior.dismissible ?? true, placement: step.behavior.placement, alignment: step.behavior.alignment, offset: step.behavior.offset };
    const card = renderer.render(root, target, step.content, definition.design, behavior, {
      onDismiss: () => { callbacks.onDismiss(); this.destroy(); },
      onSecondary: () => { callbacks.onDismiss(); this.destroy(); },
      onPrimary: () => {
        const action = step.content.primaryAction; if (action) callbacks.onAction(action);
        if (this.step < definition.steps.length - 1) { this.clearSurface(); this.step++; this.renderGuide(experience, definition, callbacks); }
        else { callbacks.onComplete(); this.destroy(); }
      },
    });
    if (this.step > 0) {
      const back = document.createElement("button"); back.className = "secondary"; back.textContent = "Back";
      back.addEventListener("click", () => { this.clearSurface(); this.step--; this.renderGuide(experience, definition, callbacks); });
      card.querySelector("footer")?.prepend(back);
    }
    requestAnimationFrame(callbacks.onVisible);
    };
    const target = findTarget(step.target);
    if (target) mount(target); else this.cancelPendingTarget = waitForTarget(step.target, (element) => { this.cancelPendingTarget = null; mount(element); }, () => { this.cancelPendingTarget = null; callbacks.onUnavailable?.(); });
    return true;
  }

  private callbacks(content: ExperienceContent, callbacks: ExperienceRendererCallbacks): RenderCallbacks {
    return {
      onDismiss: () => { callbacks.onDismiss(); this.destroy(); },
      onSecondary: () => { callbacks.onDismiss(); this.destroy(); },
      onPrimary: () => { if (content.primaryAction) callbacks.onAction(content.primaryAction); if (content.primaryAction?.type === "dismiss") { callbacks.onDismiss(); this.destroy(); } },
    };
  }

  private clearSurface(): void { this.cancelPendingTarget?.(); this.cancelPendingTarget = null; this.renderer?.destroy(); this.renderer = null; this.host?.remove(); this.host = null; }
  destroy(): void { this.clearSurface(); this.step = 0; }
}

const STYLES = `
  :host{all:initial}.card{pointer-events:auto;position:fixed;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);padding:18px;background:var(--loopz-bg);color:var(--loopz-fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.12)}
  .card[data-width=sm]{width:260px}.card[data-width=lg]{width:400px}.card[data-radius=sm]{border-radius:6px}.card[data-radius=md]{border-radius:12px}.card[data-radius=lg]{border-radius:20px}
  h2{font:600 17px/1.3 ui-sans-serif,system-ui,sans-serif;margin:0 24px 7px 0}p{margin:0;white-space:pre-wrap}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{border:0;border-radius:7px;padding:8px 12px;font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer}.primary{background:var(--loopz-primary);color:#fff}.secondary{background:transparent;color:inherit}.close{position:absolute;right:8px;top:7px;padding:3px 7px;background:transparent;color:inherit;font-size:20px}
  .toast{position:fixed!important}.toast[data-position=top-left]{top:16px;left:16px}.toast[data-position=top-right]{top:16px;right:16px}.toast[data-position=bottom-left]{bottom:16px;left:16px}.toast[data-position=bottom-right]{bottom:16px;right:16px}.cursor{will-change:left,top}@media(prefers-reduced-motion:reduce){.card{transition:none!important}}
  .backdrop{pointer-events:auto;position:fixed;inset:0;background:rgba(0,0,0,var(--loopz-backdrop-opacity,.45))}
  .modal{left:50%;top:50%;transform:translate(-50%,-50%)}.modal[data-layout=fullscreen]{inset:16px;width:auto!important;max-width:none;transform:none;display:flex;flex-direction:column;justify-content:center}.modal[data-layout=fullscreen] footer{justify-content:center}
  .slideout[data-position=top-left]{top:16px;left:16px}.slideout[data-position=top-right]{top:16px;right:16px}.slideout[data-position=bottom-left]{bottom:16px;left:16px}.slideout[data-position=bottom-right]{bottom:16px;right:16px}.slideout[data-position=center-left]{left:16px;top:50%;transform:translateY(-50%)}.slideout[data-position=center-right]{right:16px;top:50%;transform:translateY(-50%)}
  .banner{left:0;right:0;width:auto!important;max-width:none;border-radius:0!important;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:center}.banner[data-position=top]{top:0}.banner[data-position=bottom]{bottom:0}.banner h2,.banner p{grid-column:1}.banner footer{grid-column:2;grid-row:1/span 2;margin:0;padding-right:24px}
  .hotspot{pointer-events:auto;position:fixed;width:18px;height:18px;padding:0;border:3px solid #fff;border-radius:50%;background:var(--loopz-hotspot);box-shadow:0 1px 5px rgba(0,0,0,.35);color:#fff;font:700 12px/12px ui-sans-serif,system-ui,sans-serif}.hotspot[data-style=pulse]::after{content:"";position:absolute;inset:-7px;border:2px solid var(--loopz-hotspot);border-radius:50%;animation:loopz-pulse 1.8s ease-out infinite}.hotspot[data-style=dot]{width:14px;height:14px}.hotspot[data-style=question]{width:22px;height:22px}@keyframes loopz-pulse{0%{transform:scale(.65);opacity:.85}100%{transform:scale(1.45);opacity:0}}@media(prefers-reduced-motion:reduce){.hotspot::after{animation:none}}
`;
