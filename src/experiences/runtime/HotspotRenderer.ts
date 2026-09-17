import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, WidgetBuilderState } from "../types";
import { AnchoredCardRenderer, type RenderCallbacks } from "./AnchoredCardRenderer";

export class HotspotRenderer {
  private cleanup: Array<() => void> = [];
  private cardRenderer: AnchoredCardRenderer | null = null;
  private card: HTMLElement | null = null;

  render(root: ShadowRoot, target: Element, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState): HTMLElement {
    this.destroy();
    const beacon = document.createElement("button");
    beacon.className = "hotspot";
    beacon.dataset.style = behavior.hotspotStyle ?? "pulse";
    beacon.style.setProperty("--movecues-hotspot", behavior.hotspotColor ?? design.theme.primary);
    beacon.type = "button";
    beacon.setAttribute("aria-label", `Open ${content.heading}`);
    if (beacon.dataset.style === "question") beacon.textContent = "?";
    root.appendChild(beacon);

    let frameId: number | null = null;
    let destroyed = false;
    let lastLeft: number | null = null;
    let lastTop: number | null = null;
    const update = () => {
      if (destroyed || !target.isConnected) return;
      const rect = target.getBoundingClientRect();
      const left = Math.max(4, Math.min(rect.right - 7, innerWidth - 18));
      const top = Math.max(4, Math.min(rect.top - 7, innerHeight - 18));
      if (left !== lastLeft) { lastLeft = left; beacon.style.left = `${left}px`; }
      if (top !== lastTop) { lastTop = top; beacon.style.top = `${top}px`; }
    };
    const schedule = () => {
      if (destroyed || frameId !== null) return;
      frameId = requestAnimationFrame(() => { frameId = null; update(); });
    };
    const toggle = () => {
      if (this.card) { this.card.remove(); this.card = null; this.cardRenderer?.destroy(); this.cardRenderer = null; return; }
      this.cardRenderer = new AnchoredCardRenderer();
      this.card = this.cardRenderer.render(root, target, content, design, behavior, callbacks, builder, "hotspot");
    };
    const onScroll = (event: Event) => {
      const scrollContainer = event.target;
      if (scrollContainer instanceof Element && !scrollContainer.contains(target)) return;
      schedule();
    };
    beacon.addEventListener("click", toggle);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    this.cleanup.push(
      () => beacon.removeEventListener("click", toggle),
      () => window.removeEventListener("scroll", onScroll, true),
      () => window.removeEventListener("resize", schedule),
      () => { destroyed = true; if (frameId !== null) cancelAnimationFrame(frameId); frameId = null; },
    );
    if (typeof ResizeObserver !== "undefined") { const observer = new ResizeObserver(schedule); observer.observe(target); this.cleanup.push(() => observer.disconnect()); }
    update();
    return beacon;
  }

  destroy(): void { this.cardRenderer?.destroy(); this.cardRenderer = null; this.card = null; this.cleanup.splice(0).forEach((fn) => fn()); }
}
