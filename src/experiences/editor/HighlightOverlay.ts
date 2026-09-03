export class HighlightOverlay {
  private element = document.createElement("div");
  constructor() {
    this.element.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #2563eb;background:rgba(37,99,235,.12);display:none;box-sizing:border-box";
    document.documentElement.appendChild(this.element);
  }
  show(target: Element): void { const rect = target.getBoundingClientRect(); Object.assign(this.element.style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }); }
  hide(): void { this.element.style.display = "none"; }
  destroy(): void { this.element.remove(); }
}

