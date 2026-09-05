import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, WidgetBuilderState } from "../types";
import { buildCard, type RenderCallbacks } from "./AnchoredCardRenderer";

export class CursorFollowRenderer {
  private cleanup: (() => void) | null = null;
  render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState): HTMLElement {
    const card = buildCard(root, content, design, behavior, callbacks, builder); card.classList.add("cursor");
    let frame = 0; let x = innerWidth / 2; let y = innerHeight / 2; const offset = behavior.cursorOffset ?? { x: 16, y: 16 };
    const update = () => { frame = 0; const rect = card.getBoundingClientRect(); card.style.left = `${Math.max(8, Math.min(x + offset.x, innerWidth - rect.width - 8))}px`; card.style.top = `${Math.max(8, Math.min(y + offset.y, innerHeight - rect.height - 8))}px`; };
    const move = (event: PointerEvent) => { x = event.clientX; y = event.clientY; if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("pointermove", move, { passive: true }); this.cleanup = () => { window.removeEventListener("pointermove", move); if (frame) cancelAnimationFrame(frame); }; update(); return card;
  }
  destroy(): void { this.cleanup?.(); this.cleanup = null; }
}
