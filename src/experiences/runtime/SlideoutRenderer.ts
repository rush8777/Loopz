import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, WidgetBuilderState } from "../types";
import { buildCard, type RenderCallbacks } from "./AnchoredCardRenderer";

export class SlideoutRenderer {
  render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState): HTMLElement {
    if (behavior.backdrop) {
      const backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.style.setProperty("--loopz-backdrop-opacity", String(behavior.backdropOpacity ?? 0.35));
      if (behavior.closeOnBackdrop && behavior.dismissible) backdrop.addEventListener("click", callbacks.onDismiss);
      root.appendChild(backdrop);
    }
    const card = buildCard(root, content, design, behavior, callbacks, builder);
    card.classList.add("slideout");
    card.dataset.position = behavior.slideoutPosition ?? "bottom-right";
    return card;
  }

  destroy(): void {}
}
