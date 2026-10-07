import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, WidgetBuilderState } from "../types";
import { buildCard, type RenderCallbacks } from "./AnchoredCardRenderer";

export class CursorFollowRenderer {
  private cleanup: (() => void) | null = null;
  render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState): HTMLElement {
    const card = buildCard(root, content, design, behavior, callbacks, builder, "cursor_follow"); card.classList.add("cursor");
    const viewport = () => { const visual = window.visualViewport; const left = visual?.offsetLeft ?? 0; const top = visual?.offsetTop ?? 0; return { left, top, right: left + (visual?.width ?? innerWidth), bottom: top + (visual?.height ?? innerHeight) }; };
    const initialViewport = viewport(); let frame = 0; let x = (initialViewport.left + initialViewport.right) / 2; let y = (initialViewport.top + initialViewport.bottom) / 2; const offset = behavior.cursorOffset ?? { x: 16, y: 16 };
    const update = () => { frame = 0; const rect = card.getBoundingClientRect(); const visible = viewport(); card.style.left = `${Math.max(visible.left + 8, Math.min(x + offset.x, visible.right - rect.width - 8))}px`; card.style.top = `${Math.max(visible.top + 8, Math.min(y + offset.y, visible.bottom - rect.height - 8))}px`; };
    const move = (event: PointerEvent) => { x = event.clientX; y = event.clientY; if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("pointermove", move, { passive: true }); window.visualViewport?.addEventListener("resize", update); window.visualViewport?.addEventListener("scroll", update); this.cleanup = () => { window.removeEventListener("pointermove", move); window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); if (frame) cancelAnimationFrame(frame); }; update(); return card;
  }
  destroy(): void { this.cleanup?.(); this.cleanup = null; }
}
