import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
import { ClickCollector } from "./ClickCollector";
import { ScrollCollector } from "./ScrollCollector";
import { MoveCollector } from "./MoveCollector";
import { RageClickDetector } from "./RageClickDetector";
import { HoverCollector } from "./HoverCollector";
import { CursorCollector } from "./CursorCollector";
import { FunnelTracker } from "./FunnelTracker";
import { RRWebRecorder } from "../session/RRWebRecorder";
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
  readonly move: MoveCollector;
  readonly rageClick: RageClickDetector;
  readonly hover: HoverCollector;
  readonly cursor: CursorCollector;
  readonly funnel: FunnelTracker;
  /**
   * Session replay is opt-in and separate from the rest of autocapture:
   * it is instantiated eagerly (cheap - does nothing until start()) but
   * only ever started when sessionReplay.enabled is true, both here and
   * defensively inside RRWebRecorder itself.
   */
  readonly sessionReplay: RRWebRecorder;

  private started = false;

  constructor(private config: ResolvedAnalyticsConfig) {
    this.click = new ClickCollector(this.bus, this.privacy);
    this.scroll = new ScrollCollector(this.bus, config.scroll);
    this.move = new MoveCollector(this.bus, config.move);
    this.rageClick = new RageClickDetector(this.bus, config.rageClick);
    this.hover = new HoverCollector(this.bus, this.privacy, config.hover);
    this.cursor = new CursorCollector(this.bus, config.cursor);
    this.funnel = new FunnelTracker(this.bus);
    this.sessionReplay = new RRWebRecorder(this.bus, config.sessionReplay);
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    const ac = this.config.autocapture;
    if (ac.click) this.click.start();
    if (ac.scroll) this.scroll.start();
    if (ac.move) this.move.start();
    // Rage click detection depends on raw click data, so it must run
    // whenever click capture is active.
    if (ac.rageClick && ac.click) this.rageClick.start();
    if (ac.hover) this.hover.start();
    if (ac.cursor) this.cursor.start();
    // Fire-and-forget: replay may need to fetch its bundle first, and must
    // never block or delay the rest of autocapture from starting.
    if (this.config.sessionReplay.enabled) void this.sessionReplay.start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.click.stop();
    this.scroll.stop();
    this.move.stop();
    this.rageClick.stop();
    this.hover.stop();
    this.cursor.stop();
    this.sessionReplay.stop();
  }

  /** Called on SPA route changes - resets per-page-view collector state. */
  onRouteChange(path: string): void {
    this.scroll.reset();
    this.funnel.onPageView(path);
  }

  isRunning(): boolean {
    return this.started;
  }
}
