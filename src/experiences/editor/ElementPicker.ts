import { SelectorGenerator } from "../../dom/SelectorGenerator";
import type { ExperienceTarget } from "../types";
import { HighlightOverlay } from "./HighlightOverlay";

function reliability(selector: string): ExperienceTarget["reliability"] {
  if (/#[a-z][\w:-]*|\[data-(?:testid|test|qa|cy|analytics-id)=/i.test(selector)) return "reliable";
  if (/\[(?:role|aria-label|name|type|href)=|\.[a-z][\w-]*/i.test(selector) && !selector.includes(":nth-of-type")) return "moderate";
  return "fragile";
}

export class ElementPicker {
  private overlay: HighlightOverlay | null = null;
  private generator = new SelectorGenerator();
  private resolve: ((target: ExperienceTarget | null) => void) | null = null;
  private shiftPassthrough = false;
  private move = (event: PointerEvent) => {
    if (this.shiftPassthrough || event.shiftKey) { this.overlay?.hide(); return; }
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && !isMovcuesSurface(target)) this.overlay?.show(target); else this.overlay?.hide();
  };
  private click = (event: MouseEvent) => {
    if (this.shiftPassthrough || event.shiftKey || event.composedPath().some(item => item instanceof Element && isMovcuesSurface(item))) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || isMovcuesSurface(target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const descriptor = this.generator.describe(target); const selector = descriptor.selector;
    this.finish({ primarySelector: selector, fallbackSelectors: [], label: descriptor.label, role: descriptor.role, tagName: descriptor.tagName, reliability: reliability(selector) });
  };
  private keyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.finish(null);
    else if (event.key === "Shift") { this.shiftPassthrough = true; this.overlay?.hide(); }
  };
  private keyUp = (event: KeyboardEvent) => { if (event.key === "Shift") this.shiftPassthrough = false; };
  private resetPassthrough = () => { this.shiftPassthrough = false; };

  pick(): Promise<ExperienceTarget | null> {
    this.cancel(); this.overlay = new HighlightOverlay();
    document.addEventListener("pointermove", this.move, true); document.addEventListener("click", this.click, true); document.addEventListener("keydown", this.keyDown, true); document.addEventListener("keyup", this.keyUp, true); window.addEventListener("blur", this.resetPassthrough); document.addEventListener("visibilitychange", this.resetPassthrough);
    return new Promise((resolve) => { this.resolve = resolve; });
  }
  cancel(): void { if (this.resolve) this.finish(null); else this.cleanup(); }
  private finish(value: ExperienceTarget | null): void { const resolve = this.resolve; this.resolve = null; this.cleanup(); resolve?.(value); }
  private cleanup(): void { document.removeEventListener("pointermove", this.move, true); document.removeEventListener("click", this.click, true); document.removeEventListener("keydown", this.keyDown, true); document.removeEventListener("keyup", this.keyUp, true); window.removeEventListener("blur", this.resetPassthrough); document.removeEventListener("visibilitychange", this.resetPassthrough); this.shiftPassthrough = false; this.overlay?.destroy(); this.overlay = null; }
}

function isMovcuesSurface(element: Element): boolean {
  if (element.closest("[data-movecues-editor],[data-movecues-experience],[data-movecues-picker-overlay]")) return true;
  const root = element.getRootNode();
  return root instanceof ShadowRoot && isMovcuesSurface(root.host);
}
