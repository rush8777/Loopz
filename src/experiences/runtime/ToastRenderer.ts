import type { ExperienceBehavior, ExperienceContent, ExperienceDesign } from "../types";
import { buildCard, type RenderCallbacks } from "./AnchoredCardRenderer";

export class ToastRenderer {
  private timer: number | null = null;
  render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks): HTMLElement {
    const card = buildCard(root, content, design, behavior, callbacks); card.classList.add("toast"); card.dataset.position = behavior.toastPosition ?? "bottom-right";
    if (behavior.autoDismissMs) this.timer = window.setTimeout(callbacks.onDismiss, behavior.autoDismissMs);
    return card;
  }
  destroy(): void { if (this.timer !== null) clearTimeout(this.timer); }
}

