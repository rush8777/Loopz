import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
import { SelectorGenerator } from "../dom/SelectorGenerator";
import { closestInteractive } from "../dom/ElementUtils";
import type { ClickEventPayload } from "../types/events";

/**
 * Captures every click on the page via a single delegated listener on
 * `document` (capture phase), rather than attaching a listener per
 * element. This scales to pages with thousands of nodes.
 */
export class ClickCollector {
  private selectorGenerator = new SelectorGenerator();
  private handler = (e: MouseEvent) => this.onClick(e);
  private running = false;

  constructor(
    private bus: EventBus,
    private privacy: PrivacyFilter
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    document.addEventListener("click", this.handler, { capture: true, passive: true });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    document.removeEventListener("click", this.handler, { capture: true });
  }

  private onClick(e: MouseEvent): void {
    const rawTarget = e.target as Element | null;
    if (!rawTarget || rawTarget.nodeType !== 1) return;

    if (!this.privacy.shouldCapture(rawTarget)) return;

    // Single click event, discriminated by `interactive` rather than two
    // separate collectors/listeners: `interactiveEl` is non-null only when
    // a real interactive ancestor (button/link/role="button"/etc.) exists.
    // When it's null this is a raw/background click (whitespace, image,
    // dead zone) - we still describe whatever element was actually under
    // the cursor so the raw click map retains useful metadata.
    const interactiveEl = closestInteractive(rawTarget);
    const target = interactiveEl || rawTarget;

    const payload: ClickEventPayload = {
      coordinates: {
        clientX: e.clientX,
        clientY: e.clientY,
        pageX: e.pageX,
        pageY: e.pageY,
        documentX: e.clientX + window.scrollX,
        documentY: e.clientY + window.scrollY,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: { x: window.scrollX, y: window.scrollY },
      element: this.selectorGenerator.describe(target),
      interactive: interactiveEl !== null,
      pointerType: (e as PointerEvent).pointerType || undefined,
    };

    this.bus.emit("click", payload);
    // Also forward raw coordinates/target for the rage-click detector, which
    // needs every click regardless of privacy-filtered payload shape.
    this.bus.emit("click:raw", { x: e.clientX, y: e.clientY, documentX: payload.coordinates.documentX, documentY: payload.coordinates.documentY, target, timestamp: Date.now() });
  }
}
