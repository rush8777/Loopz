import { EventBus } from "../core/EventBus";
import type { ScrollEventPayload } from "../types/events";
import type { ScrollCollectorConfig } from "../types/config";
import { clamp } from "../dom/ElementUtils";

/**
 * Tracks scroll depth using rAF-throttled sampling (never one event per
 * native scroll tick) and emits milestone events (25/50/75/90/100%) at
 * most once per page view.
 */
export class ScrollCollector {
  private ticking = false;
  private lastScrollTop = 0;
  private maxScrollPercent = 0;
  private firedMilestones = new Set<number>();
  private handler = () => this.requestSample();
  private running = false;

  constructor(
    private bus: EventBus,
    private config: ScrollCollectorConfig
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.reset();
    window.addEventListener("scroll", this.handler, { passive: true });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener("scroll", this.handler);
  }

  /** Called by the engine on SPA route changes: scroll milestones reset per page view. */
  reset(): void {
    this.lastScrollTop = window.scrollY;
    this.maxScrollPercent = 0;
    this.firedMilestones.clear();
  }

  private requestSample(): void {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.sample();
      this.ticking = false;
    });
  }

  private sample(): void {
    const doc = document.documentElement;
    const documentHeight = Math.max(doc.scrollHeight, doc.clientHeight);
    const viewportHeight = window.innerHeight;
    const scrollTop = window.scrollY;

    const scrollable = Math.max(documentHeight - viewportHeight, 1);
    const scrollPercent = clamp(Math.round((scrollTop / scrollable) * 100), 0, 100);

    const direction: "up" | "down" = scrollTop >= this.lastScrollTop ? "down" : "up";
    this.lastScrollTop = scrollTop;

    if (scrollPercent > this.maxScrollPercent) {
      this.maxScrollPercent = scrollPercent;
    }

    const payload: ScrollEventPayload = {
      scrollPercent,
      maxScrollPercent: this.maxScrollPercent,
      scrollTop,
      documentHeight,
      viewportHeight,
      direction,
    };

    this.bus.emit("scroll", payload);
    this.checkMilestones(payload);
  }

  private checkMilestones(payload: ScrollEventPayload): void {
    for (const milestone of this.config.milestones) {
      if (this.maxScrollPercent >= milestone && !this.firedMilestones.has(milestone)) {
        this.firedMilestones.add(milestone);
        this.bus.emit("scroll:milestone", {
          ...payload,
          milestone: milestone as ScrollEventPayload["milestone"],
        });
      }
    }
  }
}
