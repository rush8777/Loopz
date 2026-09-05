import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, WidgetBuilderState } from "../types";
import { buildCard, type RenderCallbacks } from "./AnchoredCardRenderer";

export class ModalRenderer {
  render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState): HTMLElement {
    if (behavior.backdrop !== false) {
      const backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.style.setProperty("--loopz-backdrop-opacity", String(behavior.backdropOpacity ?? 0.45));
      if (behavior.closeOnBackdrop && behavior.dismissible) backdrop.addEventListener("click", callbacks.onDismiss);
      root.appendChild(backdrop);
    }
    const card = buildCard(root, content, design, behavior, callbacks, builder);
    card.classList.add("modal");
    card.dataset.layout = behavior.modalLayout ?? "center";
    return card;
  }

  destroy(): void {}
}
