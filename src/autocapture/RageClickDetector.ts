import { EventBus } from "../core/EventBus";
import type { RageClickConfig } from "../types/config";
import type { RageClickEventPayload } from "../types/events";
import { distance } from "../dom/ElementUtils";
import { SelectorGenerator } from "../dom/SelectorGenerator";

interface RawClick {
  x: number;
  y: number;
  target: Element;
  timestamp: number;
}

/**
 * Consumes raw click events (already privacy-filtered upstream) and
 * detects tight spatial+temporal clusters indicative of user frustration,
 * as opposed to normal repeated clicking or an intentional double-click.
 *
 * Emits exactly ONE aggregated rage_click event per cluster - never the
 * individual underlying clicks - and will not re-fire for clicks that were
 * already attributed to a cluster.
 */
export class RageClickDetector {
  private cluster: RawClick[] = [];
  private selectorGenerator = new SelectorGenerator();
  private lastEmittedClusterEnd = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private bus: EventBus,
    private config: RageClickConfig
  ) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.bus.on<RawClick>("click:raw", (c) => this.onClick(c));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cluster = [];
  }

  private onClick(click: RawClick): void {
    // Drop clicks that fall outside the time window relative to the first
    // click currently anchoring the cluster.
    if (this.cluster.length > 0) {
      const first = this.cluster[0];
      const withinTime = click.timestamp - first.timestamp <= this.config.timeWindowMs;
      const withinSpace = distance(first.x, first.y, click.x, click.y) <= this.config.radiusPx;

      if (!withinTime || !withinSpace) {
        // Cluster broken - evaluate what we had, then start a new cluster.
        this.evaluateAndReset();
      }
    }

    this.cluster.push(click);

    if (this.cluster.length >= this.config.minClicks) {
      this.emitRageCluster();
    }
  }

  private emitRageCluster(): void {
    if (this.cluster.length === 0) return;

    const first = this.cluster[0];
    const last = this.cluster[this.cluster.length - 1];

    // Prevent duplicate rage events from the same underlying cluster: once
    // emitted, we keep absorbing further clicks that belong to the same
    // burst but don't emit again until the cluster breaks and a *new*
    // cluster reaches the threshold.
    if (first.timestamp <= this.lastEmittedClusterEnd) return;

    const durationMs = last.timestamp - first.timestamp;

    const payload: RageClickEventPayload = {
      coordinates: { x: first.x, y: first.y },
      clickCount: this.cluster.length,
      durationMs,
      targetSelector: this.selectorGenerator.generate(last.target),
    };

    this.bus.emit("rage_click", payload);
    this.lastEmittedClusterEnd = last.timestamp;
  }

  private evaluateAndReset(): void {
    this.cluster = [];
  }
}
