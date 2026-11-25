import { findTarget } from "../runtime/AnchoredCardRenderer";
import { isMovcuesSurface } from "./ElementPicker";
import { HighlightOverlay } from "./HighlightOverlay";
import { captureTargetFor, guideCapturePath, isCaptureTextInput } from "./GuideCaptureTargets";
import type { CapturedGuideTarget } from "./GuideCaptureTypes";

const interceptedEvents = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "auxclick", "dblclick", "contextmenu", "keydown"] as const;
const hoverEvents = ["pointermove", "pointerover", "pointerout", "pointerenter", "pointerleave", "mousemove", "mouseover", "mouseout", "mouseenter", "mouseleave"] as const;

export class GuideCaptureSelection {
  private readonly surface = document.createElement("div");
  private readonly observer = new MutationObserver(() => {
    if (!this.mutationTimer) this.mutationTimer = window.setTimeout(() => {
      this.mutationTimer = 0;
      this.refresh();
    }, 100);
  });
  private mutationTimer = 0;
  private hover: HighlightOverlay | undefined;
  private frame = 0;
  private enabled = false;
  private targets: CapturedGuideTarget[] = [];
  private markers = new Map<string, HTMLElement>();

  constructor(private readonly onSelect: (element: Element) => void) {
    this.surface.dataset.movcuesPickerOverlay = "";
    document.documentElement.append(this.surface);
    window.addEventListener("scroll", this.invalidate, { capture: true, passive: true });
    window.addEventListener("resize", this.invalidate);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.hover = new HighlightOverlay();
      for (const type of hoverEvents) window.addEventListener(type, this.move, { capture: true, passive: true });
      window.addEventListener("blur", this.invalidate);
      document.addEventListener("visibilitychange", this.invalidate);
      for (const type of interceptedEvents) window.addEventListener(type, this.intercept, { capture: true, passive: false });
    } else {
      this.hover?.destroy();
      this.hover = undefined;
      for (const type of hoverEvents) window.removeEventListener(type, this.move, true);
      window.removeEventListener("blur", this.invalidate);
      document.removeEventListener("visibilitychange", this.invalidate);
      for (const type of interceptedEvents) window.removeEventListener(type, this.intercept, true);
    }
  }

  setTargets(targets: CapturedGuideTarget[]): void {
    if (targets === this.targets) return;
    const hadTargets = this.targets.length > 0;
    if (targets.length && !hadTargets) {
      this.observer.observe(document.body ?? document.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ["class", "id", "hidden", "style", "aria-hidden", "data-testid", "data-test", "data-qa", "data-cy"],
      });
    } else if (!targets.length && hadTargets) {
      this.observer.disconnect();
      clearTimeout(this.mutationTimer);
      this.mutationTimer = 0;
    }
    this.targets = targets;
    const ids = new Set(targets.map(target => target.id));
    for (const [id, marker] of this.markers) if (!ids.has(id)) { marker.remove(); this.markers.delete(id); }
    this.refresh();
  }

  refresh(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.placeMarkers(); });
  }

  destroy(): void {
    this.setEnabled(false);
    this.observer.disconnect();
    clearTimeout(this.mutationTimer);
    cancelAnimationFrame(this.frame);
    window.removeEventListener("scroll", this.invalidate, true);
    window.removeEventListener("resize", this.invalidate);
    this.surface.remove();
    this.markers.clear();
  }

  private invalidate = () => { this.hover?.hide(); this.refresh(); };

  private move = (event: Event) => {
    const path = event.composedPath();
    // Menu libraries may move focus or dismiss a submenu from pointer hover alone.
    if (!path.some(node => node instanceof Element && isMovcuesSurface(node))) event.stopImmediatePropagation();
    if (event.type !== "pointermove") return;
    const element = captureTargetFor(event.target);
    if (element) this.hover?.show(element);
    else this.hover?.hide();
  };

  private intercept = (event: Event) => {
    const path = event.composedPath();
    if (path.some(node => node instanceof Element && isMovcuesSurface(node))) return;
    if (event instanceof KeyboardEvent && (
      !["Enter", " "].includes(event.key) || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || isCaptureTextInput(path) || path.some(node => node instanceof HTMLSelectElement)
    )) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event instanceof KeyboardEvent && event.repeat) return;
    if (event.type !== "click" && event.type !== "keydown") return;
    const element = captureTargetFor(event.target);
    if (element) this.onSelect(element);
  };

  private placeMarkers(): void {
    const path = guideCapturePath();
    this.targets.forEach(({ id, target }, index) => {
      const found = path === target.targetContext.pagePath ? findTarget(target) : null;
      const element = found && !isMovcuesSurface(found) ? found : null;
      const rect = element?.getBoundingClientRect();
      let marker = this.markers.get(id);
      if (!rect || !rect.width || !rect.height || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) {
        if (marker) marker.hidden = true;
        return;
      }
      if (!marker) {
        marker = document.createElement("div");
        marker.dataset.movcuesCaptureMarker = id;
        marker.setAttribute("aria-hidden", "true");
        marker.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;border:2px solid #2563eb";
        const number = document.createElement("span");
        number.style.cssText = "position:absolute;top:0;left:0;min-width:20px;padding:2px 4px;border-radius:0 0 6px 0;background:#1d4ed8;color:white;font:700 12px/16px system-ui;text-align:center";
        marker.append(number);
        this.surface.append(marker);
        this.markers.set(id, marker);
      }
      marker.hidden = false;
      marker.firstElementChild!.textContent = String(index + 1);
      Object.assign(marker.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    });
  }
}
