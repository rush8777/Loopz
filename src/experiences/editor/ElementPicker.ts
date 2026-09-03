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
  private move = (event: PointerEvent) => { const target = document.elementFromPoint(event.clientX, event.clientY); if (target && !target.closest("[data-loopz-editor]")) this.overlay?.show(target); else this.overlay?.hide(); };
  private click = (event: MouseEvent) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target.closest("[data-loopz-editor]")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const descriptor = this.generator.describe(target); const selector = descriptor.selector;
    this.finish({ primarySelector: selector, fallbackSelectors: [], label: descriptor.label, role: descriptor.role, tagName: descriptor.tagName, reliability: reliability(selector) });
  };
  private key = (event: KeyboardEvent) => { if (event.key === "Escape") this.finish(null); };

  pick(): Promise<ExperienceTarget | null> {
    this.cancel(); this.overlay = new HighlightOverlay();
    document.addEventListener("pointermove", this.move, true); document.addEventListener("click", this.click, true); document.addEventListener("keydown", this.key, true);
    return new Promise((resolve) => { this.resolve = resolve; });
  }
  cancel(): void { if (this.resolve) this.finish(null); else this.cleanup(); }
  private finish(value: ExperienceTarget | null): void { const resolve = this.resolve; this.resolve = null; this.cleanup(); resolve?.(value); }
  private cleanup(): void { document.removeEventListener("pointermove", this.move, true); document.removeEventListener("click", this.click, true); document.removeEventListener("keydown", this.key, true); this.overlay?.destroy(); this.overlay = null; }
}

