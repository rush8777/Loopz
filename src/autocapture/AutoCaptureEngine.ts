import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
import { ClickCollector } from "./ClickCollector";
import { ScrollCollector } from "./ScrollCollector";
import { RageClickDetector } from "./RageClickDetector";
import { FunnelTracker } from "./FunnelTracker";
import type { ResolvedAnalyticsConfig } from "../types/config";

/**
 * Owns registration, startup, and teardown of every autocapture collector.
 * Collectors remain independent of one another - the engine is the only
 * thing that knows about all of them, and it only wires them together via
 * the shared EventBus, never via direct references between collectors.
 */
export class AutoCaptureEngine {
  readonly bus = new EventBus();
  readonly privacy = new PrivacyFilter();

  readonly click: ClickCollector;
  readonly scroll: ScrollCollector;
  readonly rageClick: RageClickDetector;
  readonly funnel: FunnelTracker;
  private started = false;

  constructor(private config: ResolvedAnalyticsConfig) {
    this.click = new ClickCollector(this.bus, this.privacy);
    this.scroll = new ScrollCollector(this.bus, config.scroll);
    this.rageClick = new RageClickDetector(this.bus, config.rageClick);
    this.funnel = new FunnelTracker(this.bus);
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    const ac = this.config.autocapture;
    if (ac.click) this.click.start();
    if (ac.scroll) this.scroll.start();
    // Rage click detection depends on raw click data, so it must run
    // whenever click capture is active.
    if (ac.rageClick && ac.click) this.rageClick.start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.click.stop();
    this.scroll.stop();
    this.rageClick.stop();
  }

  onRouteChange(path: string): void {
    this.scroll.reset();
    this.funnel.onPageView(path);
  }

  isRunning(): boolean {
    return this.started;
  }
}
