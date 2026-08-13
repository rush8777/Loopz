import { AutoCaptureEngine } from "../autocapture/AutoCaptureEngine";
import { SessionManager } from "./SessionManager";
import { EventQueue } from "./EventQueue";
import { Transport } from "./Transport";
import { Batcher } from "./Batcher";
import { getPageContext } from "./PageContext";
import { generateId } from "./ids";
import { resolveConfig } from "./defaultConfig";
import type { AnalyticsConfig, ResolvedAnalyticsConfig } from "../types/config";
import type {
  AnalyticsEvent,
  AnyPayload,
  ClickEventPayload,
  ScrollEventPayload,
  MoveEventPayload,
  RageClickEventPayload,
  HoverEventPayload,
  CursorEventPayload,
  FunnelEventPayload,
  CustomEventPayload,
  IdentifyEventPayload,
  SessionReplayEventPayload,
  EventType,
} from "../types/events";
import type { FunnelStep } from "../types/funnel";
import { RouteObserver } from "../dom/RouteObserver";

/**
 * The core SDK instance. Owns configuration, session identity, the
 * autocapture engine, and the delivery pipeline. This is the only class
 * that is allowed to move events from "captured" to "sent" - collectors
 * never talk to the network directly.
 */
export class Analytics {
  private config!: ResolvedAnalyticsConfig;
  private session!: SessionManager;
  private engine!: AutoCaptureEngine;
  private queue!: EventQueue;
  private transport!: Transport;
  private batcher!: Batcher;
  private routeObserver = new RouteObserver();

  private debugEnabled = false;
  private initialized = false;
  private running = false;
  private unsubscribers: Array<() => void> = [];

  init(userConfig: AnalyticsConfig): void {
    if (this.initialized) {
      this.log("already initialized, ignoring duplicate init()");
      return;
    }

    this.config = resolveConfig(userConfig);
    this.debugEnabled = !!this.config.debug;

    if (this.config.respectDoNotTrack && isDoNotTrackEnabled()) {
      this.log("Do Not Track enabled - autocapture disabled");
      this.initialized = true;
      return;
    }

    this.session = new SessionManager(this.config.sessionInactivityMs);
    this.transport = new Transport(this.config.endpoint, this.config.siteId);
    this.queue = new EventQueue({ maxQueueSize: this.config.queue.maxQueueSize });
    this.batcher = new Batcher(this.queue, this.transport, this.config.queue, (msg, ...args) =>
      this.log(msg, ...args)
    );
    this.engine = new AutoCaptureEngine(this.config);

    this.wireCollectorsToPipeline();

    this.initialized = true;
    this.log("initialized", { siteId: this.config.siteId });
    this.start();

    // Fire the initial page view + funnel evaluation.
    this.trackPageView();
    this.routeObserver.start();
    this.routeObserver.onChange(() => this.onRouteChange());
  }

  start(): void {
    if (!this.initialized || this.running) return;
    this.running = true;
    this.engine.start();
    this.batcher.start();
    this.log("autocapture started");
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.engine.stop();
    this.batcher.stop();
    this.log("autocapture stopped");
  }

  destroy(): void {
    this.stop();
    this.routeObserver.stop();
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.queue?.clear();
    this.initialized = false;
    this.log("destroyed");
  }

  event(name: string, properties?: Record<string, unknown>): void {
    if (!this.requireInit()) return;
    const payload: CustomEventPayload = { name, properties };
    this.enqueueEvent("custom", payload);
    this.engine.funnel.onCustomEvent(name);
    this.log(`event: ${name}`, properties);
  }

  identify(userId: string, attributes?: Record<string, unknown>): void {
    if (!this.requireInit()) return;
    this.session.identify(userId);
    const payload: IdentifyEventPayload = { userId, traits: attributes };
    this.enqueueEvent("identify", payload);
    this.log(`identify: ${userId}`, attributes);
  }

  page(): void {
    if (!this.requireInit()) return;
    this.trackPageView();
  }

  defineFunnel(name: string, steps: FunnelStep[]): void {
    if (!this.requireInit()) return;
    this.engine.funnel.define(name, steps);
    this.log(`funnel defined: ${name}`, steps);
    // Evaluate immediately in case the current page already matches step 1.
    this.engine.funnel.onPageView(location.pathname);
  }

  enableDebug(): void {
    this.debugEnabled = true;
    this.log("debug mode enabled");
  }

  disableDebug(): void {
    this.log("debug mode disabled");
    this.debugEnabled = false;
  }

  // -------------------------------------------------------------------
  // Internal wiring
  // -------------------------------------------------------------------

  private requireInit(): boolean {
    if (!this.initialized) {
      // eslint-disable-next-line no-console
      console.warn("[Analytics] call analytics.init(config) before using this method");
      return false;
    }
    return true;
  }

  private wireCollectorsToPipeline(): void {
    const bus = this.engine.bus;

    this.unsubscribers.push(
      bus.on<ClickEventPayload>("click", (p) => {
        this.enqueueEvent("click", p);
        this.log("click captured", p.element.selector);
      })
    );

    this.unsubscribers.push(
      bus.on<ScrollEventPayload>("scroll:milestone", (p) => {
        this.enqueueEvent("scroll", p);
        this.log(`scroll milestone: ${p.milestone}%`);
      })
    );

    this.unsubscribers.push(
      bus.on<MoveEventPayload>("move", (p) => {
        this.enqueueEvent("move", p);
        this.log(`move batch: ${p.points.length} points`);
      })
    );

    this.unsubscribers.push(
      bus.on<RageClickEventPayload>("rage_click", (p) => {
        this.enqueueEvent("rage_click", p);
        this.log("rage click detected", p);
      })
    );

    this.unsubscribers.push(
      bus.on<HoverEventPayload>("hover", (p) => {
        this.enqueueEvent("hover", p);
        this.log(`hover: ${p.element.selector} (${p.durationMs}ms)`);
      })
    );

    this.unsubscribers.push(
      bus.on<CursorEventPayload>("cursor", (p) => {
        this.enqueueEvent("cursor", p);
        this.log(`cursor sample: (${p.x}, ${p.y})`);
      })
    );

    this.unsubscribers.push(
      bus.on<FunnelEventPayload>("funnel", (p) => {
        this.enqueueEvent("funnel", p);
        this.log(`funnel step completed: ${p.funnelName} [${p.stepIndex}] (${p.status})`);
      })
    );

    this.unsubscribers.push(
      bus.on<SessionReplayEventPayload>("session_replay_event", (p) => {
        this.enqueueEvent("session_replay_event", p);
        this.log(`session replay event: seq ${p.seq}`);
      })
    );
  }

  private trackPageView(): void {
    this.enqueueEvent("page_view", { title: document.title });
    this.engine.funnel.onPageView(location.pathname);
  }

  private onRouteChange(): void {
    this.session.newPageView();
    this.engine.onRouteChange(location.pathname);
    this.trackPageView();
    this.log("route changed", location.pathname);
  }

  private enqueueEvent<T extends AnyPayload>(type: EventType, payload: T): void {
    this.session.touch();
    const event: AnalyticsEvent<T> = {
      eventId: generateId("evt"),
      type,
      timestamp: Date.now(),
      anonymousId: this.session.getAnonymousId(),
      sessionId: this.session.getSessionId(),
      pageViewId: this.session.getPageViewId(),
      page: getPageContext(),
      payload,
    };
    this.batcher.enqueue(event as AnalyticsEvent<AnyPayload>);
  }

  /** Called by bootstrap on visibilitychange/pagehide for unload-safe delivery. */
  flushOnUnload(): void {
    if (!this.initialized) return;
    this.batcher.flushSync();
  }

  private log(message: string, ...args: unknown[]): void {
    if (!this.debugEnabled) return;
    // eslint-disable-next-line no-console
    console.log(`[Analytics] ${message}`, ...args);
  }
}

function isDoNotTrackEnabled(): boolean {
  const dnt =
    (navigator as any).doNotTrack || (window as any).doNotTrack || (navigator as any).msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}
