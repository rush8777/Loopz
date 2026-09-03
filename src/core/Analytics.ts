import { AutoCaptureEngine } from "../autocapture/AutoCaptureEngine";
import { SessionManager } from "./SessionManager";
import { EventQueue } from "./EventQueue";
import { Transport } from "./Transport";
import { Batcher } from "./Batcher";
import { getPageContext } from "./PageContext";
import { captureEnvironmentSnapshot } from "./EnvironmentContext";
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
  SessionStartEventPayload,
  ElementsSeenPayload,
  EventType,
} from "../types/events";
import type { FunnelStep } from "../types/funnel";
import { RouteObserver } from "../dom/RouteObserver";
import { HeatmapManager } from "../heatmaps/HeatmapManager";
import type { ExperienceLoader } from "../experiences/runtime/ExperienceLoader";
import type { EditorModeController } from "../experiences/editor/EditorModeController";

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
  private heatmaps!: HeatmapManager;
  private experiences: ExperienceLoader | null = null;
  private editor: EditorModeController | null = null;
  private editorMode = false;
  private editorAttempted = false;

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

    const editorToken = new URL(location.href).searchParams.get("loopz_editor_token");
    if (editorToken && !this.editorAttempted) {
      // Do not create a SessionManager, collectors, or a page view until the
      // existing editor token exchange has decided whether this is an editor.
      this.initialized = true;
      this.editorAttempted = true;
      void import("../experiences/editor/EditorModeController").then(async ({ EditorModeController }) => {
        if (!this.initialized) return;
        const editor = new EditorModeController(this.config.endpoint);
        if (await editor.start(editorToken)) {
          this.editor = editor;
          this.editorMode = true;
          this.log("experience editor mode initialized");
          return;
        }
        // Invalid/expired tokens retain the established secure failure path:
        // no editor is mounted, and the page continues as a normal visit.
        this.initialized = false;
        this.init(userConfig);
      }).catch(() => { this.initialized = false; this.init(userConfig); });
      return;
    }

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
    this.heatmaps = new HeatmapManager(this.config.endpoint, this.config.siteId, this.config.heatmapSnapshotBundleUrl);
    this.heatmaps.initialize();

    this.wireCollectorsToPipeline();

    this.initialized = true;
    this.log("initialized", { siteId: this.config.siteId });
    this.engine.initializeElementDiscovery();

    // Page/Element discovery belongs to the initialized SDK lifecycle,
    // so route observation remains active when behavioral capture stops.
    this.unsubscribers.push(this.routeObserver.onChange(() => this.onRouteChange()));
    this.routeObserver.start();

    // Preserve the SDK's established auto-start behavior for behavioral
    // collectors, without making discovery depend on start().
    this.start();

    // Fire the initial page view + funnel evaluation.
    this.trackPageView();

    if (this.config.experiences.enabled) {
      void import("../experiences/runtime/ExperienceLoader").then(({ ExperienceLoader }) => {
        if (!this.initialized) return;
        this.experiences = new ExperienceLoader(this.config.endpoint, this.config.siteId, this.session, (name) => this.event(name));
        void this.experiences.evaluate();
      }).catch(() => void 0);
    }
  }

  start(): void {
    if (!this.initialized || this.editorMode || this.running || !this.engine) return;
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
    this.engine?.destroyElementDiscovery();
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.queue?.clear();
    this.experiences?.destroy();
    this.experiences = null;
    this.editor?.destroy();
    this.editor = null;
    this.editorMode = false;
    this.initialized = false;
    this.log("destroyed");
  }

  event(name: string, properties?: Record<string, unknown>): void {
    if (!this.requireInit()) return;
    const payload: CustomEventPayload = { name, properties };
    this.enqueueEvent("custom", payload);
    this.engine.funnel.onCustomEvent(name);
    this.experiences?.onCustomEvent(name);
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
    if (!this.initialized || this.editorMode || !this.session) {
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

    this.unsubscribers.push(
      bus.on<ElementsSeenPayload>("elements_seen", (p) => {
        // Deliberately not enqueueEvent()/the batched queue - see
        // Transport.sendElements's doc comment. Best-effort, fire-and-
        // forget; a failed crawl upload just means the catalog is
        // slightly stale until the next route change re-crawls.
        void this.transport.sendElements(p.pagePath, p.elements);
        this.log(`elements crawled: ${p.elements.length}`);
      })
    );
  }

  private trackPageView(): void {
    this.enqueueEvent("page_view", { title: document.title });
    this.engine.funnel.onPageView(location.pathname);
  }

  private onRouteChange(): void {
    if (this.running) {
      this.session.newPageView();
      this.engine.onRouteChange(location.pathname, true);
      this.trackPageView();
      this.experiences?.onRouteChange();
    } else {
      this.engine.onRouteChange(location.pathname, false);
    }
    this.log("route changed", location.pathname);
  }

  private enqueueEvent<T extends AnyPayload>(type: EventType, payload: T): void {
    this.session.touch();
    if (this.session.consumeSessionStarted()) {
      // Emitted before the event that triggered it, so a session's
      // first row in the log is always its environment context - see
      // EnvironmentContext.ts. touch() above already brought the
      // session id/lastActivity up to date, so this call doesn't
      // re-touch or risk re-triggering itself.
      this.buildAndEnqueue<SessionStartEventPayload>("session_start", captureEnvironmentSnapshot());
    }
    this.buildAndEnqueue(type, payload);
  }

  private buildAndEnqueue<T extends AnyPayload>(type: EventType, payload: T): void {
    const event: AnalyticsEvent<T> = {
      eventId: generateId("evt"),
      type,
      timestamp: Date.now(),
      anonymousId: this.session.getAnonymousId(),
      sessionId: this.session.getSessionId(),
      pageViewId: this.session.getPageViewId(),
      page: getPageContext(),
      heatmap: this.heatmaps.context(),
      payload,
    };
    this.batcher.enqueue(event as AnalyticsEvent<AnyPayload>);
  }

  /** Called by bootstrap on visibilitychange/pagehide for unload-safe delivery. */
  flushOnUnload(): void {
    if (!this.initialized || this.editorMode || !this.batcher) return;
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
