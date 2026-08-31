import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
import { ClickCollector } from "./ClickCollector";
import { ScrollCollector } from "./ScrollCollector";
import { MoveCollector } from "./MoveCollector";
import { RageClickDetector } from "./RageClickDetector";
import { HoverCollector } from "./HoverCollector";
import { CursorCollector } from "./CursorCollector";
import { FunnelTracker } from "./FunnelTracker";
import { ElementCrawler } from "./ElementCrawler";
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
   * Not a behavioral start/stop collector like the others - a one-shot
   * `.crawl()` triggered from SDK initialization and `onRouteChange()` (SPA
   * navigation) rather than any continuous listener. See ElementCrawler.ts.
   */
  readonly elementCrawler: ElementCrawler;
  /**
   * Session replay is opt-in and separate from the rest of autocapture:
   * it is instantiated eagerly (cheap - does nothing until start()) but
   * only ever started when sessionReplay.enabled is true, both here and
   * defensively inside RRWebRecorder itself.
   */
  readonly sessionReplay: RRWebRecorder;

  private started = false;
  private discoveryInitialized = false;
  private pendingInitialCrawl: (() => void) | null = null;

  constructor(private config: ResolvedAnalyticsConfig) {
    this.click = new ClickCollector(this.bus, this.privacy);
    this.scroll = new ScrollCollector(this.bus, config.scroll);
    this.move = new MoveCollector(this.bus, config.move);
    this.rageClick = new RageClickDetector(this.bus, config.rageClick);
    this.hover = new HoverCollector(this.bus, this.privacy, config.hover);
    this.cursor = new CursorCollector(this.bus, config.cursor);
    this.funnel = new FunnelTracker(this.bus);
    this.elementCrawler = new ElementCrawler(this.bus, this.privacy);
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

  /**
   * Starts structural Page/Element discovery for the initialized SDK.
   * This lifecycle is intentionally independent of behavioral start/stop.
   */
  initializeElementDiscovery(): void {
    if (this.discoveryInitialized || !this.config.autocapture.elementCrawler) return;
    this.discoveryInitialized = true;
    this.scheduleInitialCrawl();
  }

  /** Runs the first crawl once the DOM actually has content - a crawl fired before parsing finishes would just find nothing. */
  private scheduleInitialCrawl(): void {
    if (typeof document === "undefined") return;
    if (document.readyState === "loading") {
      this.pendingInitialCrawl = () => {
        this.pendingInitialCrawl = null;
        if (this.discoveryInitialized) this.elementCrawler.crawl();
      };
      document.addEventListener("DOMContentLoaded", this.pendingInitialCrawl, { once: true });
    } else {
      this.elementCrawler.crawl();
    }
  }

  /** Completely tears down discovery scheduling during Analytics.destroy(). */
  destroyElementDiscovery(): void {
    this.discoveryInitialized = false;
    if (this.pendingInitialCrawl && typeof document !== "undefined") {
      document.removeEventListener("DOMContentLoaded", this.pendingInitialCrawl);
      this.pendingInitialCrawl = null;
    }
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

  /** Called on SPA route changes; discovery remains active even when behavioral capture is stopped. */
  onRouteChange(path: string, behavioralCaptureActive = true): void {
    if (behavioralCaptureActive) {
      this.scroll.reset();
      this.funnel.onPageView(path);
    }
    if (this.discoveryInitialized) this.elementCrawler.crawl();
  }

  isRunning(): boolean {
    return this.started;
  }
}
