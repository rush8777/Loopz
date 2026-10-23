import type { ExperienceBehavior, ExperienceDesign } from "../types";

const PANEL_NAMES = ["top", "right", "bottom", "left"] as const;
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);

let scrollLockCount = 0;
let scrollLockCleanup: (() => void) | null = null;

/**
 * Dims the viewport around an anchored target without changing the target or
 * the page DOM. Geometry is supplied by AnchoredCardRenderer so the backdrop
 * shares its coalesced positioning lifecycle.
 */
export class AnchoredTargetBackdrop {
  private panels: HTMLElement[] = [];
  private highlight: HTMLElement;
  private releaseScrollLock: (() => void) | null;

  constructor(root: ShadowRoot, card: HTMLElement, behavior: ExperienceBehavior, design: ExperienceDesign, onDismiss: () => void) {
    this.releaseScrollLock = lockDocumentScroll();
    const opacity = finiteClamp(behavior.backdropOpacity ?? 0.45, 0, 1);
    this.panels = PANEL_NAMES.map(name => {
      const panel = document.createElement("div");
      panel.dataset.movcuesTargetBackdrop = name;
      panel.style.cssText = `position:fixed;box-sizing:border-box;background:rgba(0,0,0,${opacity});pointer-events:auto`;
      if (behavior.closeOnBackdrop && behavior.dismissible) panel.addEventListener("click", onDismiss);
      root.insertBefore(panel, card);
      return panel;
    });
    this.highlight = document.createElement("div");
    this.highlight.dataset.movcuesTargetHighlight = "";
    this.highlight.style.cssText = "position:fixed;box-sizing:border-box;border-radius:4px;pointer-events:none";
    this.highlight.style.outline = `2px solid ${design.theme.primary}`;
    root.insertBefore(this.highlight, card);
  }

  update(rect: DOMRect): void {
    const viewportWidth = Math.max(0, innerWidth);
    const viewportHeight = Math.max(0, innerHeight);
    const left = finiteClamp(rect.left, 0, viewportWidth);
    const right = finiteClamp(rect.right, 0, viewportWidth);
    const top = finiteClamp(rect.top, 0, viewportHeight);
    const bottom = finiteClamp(rect.bottom, 0, viewportHeight);
    const middleHeight = Math.max(0, bottom - top);

    setRect(this.panels[0], 0, 0, viewportWidth, top);
    setRect(this.panels[1], right, top, Math.max(0, viewportWidth - right), middleHeight);
    setRect(this.panels[2], 0, bottom, viewportWidth, Math.max(0, viewportHeight - bottom));
    setRect(this.panels[3], 0, top, left, middleHeight);
    setRect(this.highlight, rect.left, rect.top, Math.max(0, rect.width), Math.max(0, rect.height));
  }

  setHidden(hidden: boolean): void {
    if (hidden) { this.releaseScrollLock?.(); this.releaseScrollLock = null; }
    else if (!this.releaseScrollLock) this.releaseScrollLock = lockDocumentScroll();
    const visibility = hidden ? "hidden" : "";
    this.panels.forEach(panel => { panel.style.visibility = visibility; });
    this.highlight.style.visibility = visibility;
  }

  destroy(): void {
    this.releaseScrollLock?.(); this.releaseScrollLock = null;
    this.panels.forEach(panel => panel.remove());
    this.panels = [];
    this.highlight.remove();
  }
}

function lockDocumentScroll(): () => void {
  scrollLockCount += 1;
  if (scrollLockCount === 1) {
    const rootStyle = captureProperty(document.documentElement.style, "overflow");
    const bodyStyle = document.body ? captureProperty(document.body.style, "overflow") : null;
    document.documentElement.style.setProperty("overflow", "hidden", "important");
    document.body?.style.setProperty("overflow", "hidden", "important");
    const preventScroll = (event: Event) => {
      // The document stays locked, but scrollable controls and widget content
      // must remain usable (including controls inside a shadow root).
      const delta = event instanceof WheelEvent ? event.deltaY : 0;
      if (event.composedPath().some(node => node instanceof HTMLElement && node !== document.body && node !== document.documentElement &&
        /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight &&
        (!delta || (delta > 0 ? node.scrollTop + node.clientHeight < node.scrollHeight : node.scrollTop > 0)))) return;
      if (event.cancelable) event.preventDefault();
    };
    const preventScrollKey = (event: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(event.key) || event.composedPath().some(isEditableControl)) return;
      if (event.cancelable) event.preventDefault();
    };
    document.addEventListener("wheel", preventScroll, { capture: true, passive: false });
    document.addEventListener("touchmove", preventScroll, { capture: true, passive: false });
    document.addEventListener("keydown", preventScrollKey, true);
    scrollLockCleanup = () => {
      document.removeEventListener("wheel", preventScroll, true);
      document.removeEventListener("touchmove", preventScroll, true);
      document.removeEventListener("keydown", preventScrollKey, true);
      restoreProperty(document.documentElement.style, "overflow", rootStyle);
      if (bodyStyle && document.body) restoreProperty(document.body.style, "overflow", bodyStyle);
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) { scrollLockCleanup?.(); scrollLockCleanup = null; }
  };
}

function isEditableControl(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("input,textarea,select,button,[contenteditable]:not([contenteditable='false'])"));
}

interface CapturedProperty { value: string; priority: string }

function captureProperty(style: CSSStyleDeclaration, property: string): CapturedProperty {
  return { value: style.getPropertyValue(property), priority: style.getPropertyPriority(property) };
}

function restoreProperty(style: CSSStyleDeclaration, property: string, captured: CapturedProperty): void {
  if (captured.value) style.setProperty(property, captured.value, captured.priority);
  else style.removeProperty(property);
}

function setRect(element: HTMLElement, left: number, top: number, width: number, height: number): void {
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
}

function finiteClamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(value, maximum)) : minimum;
}
