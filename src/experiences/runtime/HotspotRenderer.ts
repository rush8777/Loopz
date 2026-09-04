import type { ExperienceBehavior, ExperienceContent, ExperienceDesign } from "../types";
import { AnchoredCardRenderer, type RenderCallbacks } from "./AnchoredCardRenderer";

export class HotspotRenderer {
  private cleanup: Array<() => void> = [];
  private cardRenderer: AnchoredCardRenderer | null = null;
  private card: HTMLElement | null = null;

  render(root: ShadowRoot, target: Element, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks): HTMLElement {
    const beacon = document.createElement("button");
    beacon.className = "hotspot";
    beacon.dataset.style = behavior.hotspotStyle ?? "pulse";
    beacon.style.setProperty("--loopz-hotspot", behavior.hotspotColor ?? design.theme.primary);
    beacon.type = "button";
    beacon.setAttribute("aria-label", `Open ${content.heading}`);
    if (beacon.dataset.style === "question") beacon.textContent = "?";
    root.appendChild(beacon);

    const update = () => {
      const rect = target.getBoundingClientRect();
      beacon.style.left = `${Math.max(4, Math.min(rect.right - 7, innerWidth - 18))}px`;
      beacon.style.top = `${Math.max(4, Math.min(rect.top - 7, innerHeight - 18))}px`;
    };
    const schedule = () => requestAnimationFrame(update);
    const toggle = () => {
      if (this.card) { this.card.remove(); this.card = null; this.cardRenderer?.destroy(); this.cardRenderer = null; return; }
      this.cardRenderer = new AnchoredCardRenderer();
      this.card = this.cardRenderer.render(root, target, content, design, behavior, callbacks);
    };
    beacon.addEventListener("click", toggle);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    this.cleanup.push(() => beacon.removeEventListener("click", toggle), () => window.removeEventListener("scroll", schedule, true), () => window.removeEventListener("resize", schedule));
    if (typeof ResizeObserver !== "undefined") { const observer = new ResizeObserver(schedule); observer.observe(target); this.cleanup.push(() => observer.disconnect()); }
    update();
    return beacon;
  }

  destroy(): void { this.cardRenderer?.destroy(); this.cardRenderer = null; this.card = null; this.cleanup.splice(0).forEach((fn) => fn()); }
}
