import { findTarget } from "../runtime/AnchoredCardRenderer";
import { isMovcuesSurface } from "./ElementPicker";
import { HighlightOverlay } from "./HighlightOverlay";
import { captureTargetFor, guideCapturePath } from "./GuideCaptureTargets";
import type { CapturedGuideTarget } from "./GuideCaptureTypes";

const interceptedEvents = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "auxclick", "dblclick", "contextmenu", "beforeinput", "submit", "keydown"] as const;

export class GuideCaptureSelection {
  private readonly surface = document.createElement("div");
  private readonly observer = new MutationObserver(() => this.refresh());
  private hover: HighlightOverlay | undefined;
  private frame = 0;
  private enabled = false;
  private targets: CapturedGuideTarget[] = [];
  private markers = new Map<string, HTMLElement>();

  constructor(private readonly onSelect: (element: Element) => void) {
    this.surface.dataset.movcuesPickerOverlay = "";
    document.documentElement.append(this.surface);
    this.observer.observe(document.body ?? document.documentElement, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ["class", "id", "hidden", "style", "aria-hidden", "data-testid", "data-test", "data-qa", "data-cy"],
    });
    window.addEventListener("scroll", this.invalidate, { capture: true, passive: true });
    window.addEventListener("resize", this.invalidate);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.hover = new HighlightOverlay();
      window.addEventListener("pointermove", this.move, { capture: true, passive: true });
      for (const type of interceptedEvents) window.addEventListener(type, this.intercept, { capture: true, passive: false });
    } else {
      this.hover?.destroy();
      this.hover = undefined;
      window.removeEventListener("pointermove", this.move, true);
      for (const type of interceptedEvents) window.removeEventListener(type, this.intercept, true);
    }
  }

  setTargets(targets: CapturedGuideTarget[]): void {
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
    cancelAnimationFrame(this.frame);
    window.removeEventListener("scroll", this.invalidate, true);
    window.removeEventListener("resize", this.invalidate);
    this.surface.remove();
    this.markers.clear();
  }

  private invalidate = () => { this.hover?.hide(); this.refresh(); };

  private move = (event: PointerEvent) => {
    const element = captureTargetFor(event.target);
    if (element) this.hover?.show(element);
    else this.hover?.hide();
  };

  private intercept = (event: Event) => {
    if (event.composedPath().some(node => node instanceof Element && isMovcuesSurface(node))) return;
    if (event instanceof KeyboardEvent && !["Enter", " ", "Escape"].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event instanceof KeyboardEvent && (event.repeat || event.key === "Escape")) return;
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
