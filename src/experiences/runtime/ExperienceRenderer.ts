import type { DeliveredExperience, ExperienceAction, ExperienceBehavior, ExperienceContent, RuntimeGuideDefinition, RuntimeWidgetDefinition } from "../types";
import { isGuideDefinition } from "../types";
import { AnchoredCardRenderer, findTarget, type RenderCallbacks } from "./AnchoredCardRenderer";
import { ToastRenderer } from "./ToastRenderer";
import { CursorFollowRenderer } from "./CursorFollowRenderer";

export interface ExperienceRendererCallbacks {
  onVisible: () => void;
  onDismiss: () => void;
  onAction: (action: ExperienceAction) => void;
  onComplete: () => void;
}

export class ExperienceRenderer {
  private host: HTMLElement | null = null;
  private renderer: { destroy(): void } | null = null;
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
    if (experience.widgetType === "anchored_card") {
      const target = findTarget(definition.target); if (!target) return false;
      const root = this.root(); const renderer = new AnchoredCardRenderer(); this.renderer = renderer;
      renderer.render(root, target, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else if (experience.widgetType === "toast") {
      const root = this.root(); const renderer = new ToastRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else if (experience.widgetType === "cursor_follow") {
      const root = this.root(); const renderer = new CursorFollowRenderer(); this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else return false;
    requestAnimationFrame(callbacks.onVisible); return true;
  }

  private renderGuide(experience: DeliveredExperience, definition: RuntimeGuideDefinition, callbacks: ExperienceRendererCallbacks): boolean {
    const step = definition.steps[this.step]; const target = findTarget(step?.target); if (!step || !target) return false;
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
    requestAnimationFrame(callbacks.onVisible); return true;
  }

  private callbacks(content: ExperienceContent, callbacks: ExperienceRendererCallbacks): RenderCallbacks {
    return {
      onDismiss: () => { callbacks.onDismiss(); this.destroy(); },
      onSecondary: () => { callbacks.onDismiss(); this.destroy(); },
      onPrimary: () => { if (content.primaryAction) callbacks.onAction(content.primaryAction); if (content.primaryAction?.type === "dismiss") { callbacks.onDismiss(); this.destroy(); } },
    };
  }

  private clearSurface(): void { this.renderer?.destroy(); this.renderer = null; this.host?.remove(); this.host = null; }
  destroy(): void { this.clearSurface(); this.step = 0; }
}

const STYLES = `
  :host{all:initial}.card{pointer-events:auto;position:fixed;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);padding:18px;background:var(--loopz-bg);color:var(--loopz-fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.12)}
  .card[data-width=sm]{width:260px}.card[data-width=lg]{width:400px}.card[data-radius=sm]{border-radius:6px}.card[data-radius=md]{border-radius:12px}.card[data-radius=lg]{border-radius:20px}
  h2{font:600 17px/1.3 ui-sans-serif,system-ui,sans-serif;margin:0 24px 7px 0}p{margin:0;white-space:pre-wrap}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{border:0;border-radius:7px;padding:8px 12px;font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer}.primary{background:var(--loopz-primary);color:#fff}.secondary{background:transparent;color:inherit}.close{position:absolute;right:8px;top:7px;padding:3px 7px;background:transparent;color:inherit;font-size:20px}
  .toast{position:fixed!important}.toast[data-position=top-left]{top:16px;left:16px}.toast[data-position=top-right]{top:16px;right:16px}.toast[data-position=bottom-left]{bottom:16px;left:16px}.toast[data-position=bottom-right]{bottom:16px;right:16px}.cursor{will-change:left,top}@media(prefers-reduced-motion:reduce){.card{transition:none!important}}
`;
