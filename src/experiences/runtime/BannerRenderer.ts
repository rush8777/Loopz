import type { ExperienceBehavior, ExperienceContent, ExperienceDesign } from "../types";
import { buildCard, type RenderCallbacks } from "./AnchoredCardRenderer";

export class BannerRenderer {
  render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks): HTMLElement {
    const card = buildCard(root, content, design, behavior, callbacks);
    card.classList.add("banner");
    card.dataset.position = behavior.bannerPosition ?? "top";
    return card;
  }

  destroy(): void {}
}
