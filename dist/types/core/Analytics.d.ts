import type { AnalyticsConfig } from "../types/config";
import type { FunnelStep } from "../types/funnel";
import type { AnalyticsRuntimeProviders } from "../experiences/runtimeInterfaces";
/**
 * The core SDK instance. Owns configuration, session identity, the
 * autocapture engine, and the delivery pipeline. This is the only class
 * that is allowed to move events from "captured" to "sent" - collectors
 * never talk to the network directly.
 */
export declare class Analytics {
    private runtimeProviders;
    private config;
    private session;
    private engine;
    private queue;
    private transport;
    private batcher;
    private routeObserver;
    private heatmaps;
    private activityMonitor;
    private experiences;
    private pendingExperienceLaunches;
    private editor;
    private editorMode;
    private editorAttempted;
    private debugEnabled;
    private initialized;
    private running;
    private generation;
    private unsubscribers;
    constructor(runtimeProviders?: AnalyticsRuntimeProviders);
    init(userConfig: AnalyticsConfig): void;
    start(): void;
    stop(): void;
    destroy(): void;
    event(name: string, properties?: Record<string, unknown>): void;
    identify(userId: string, attributes?: Record<string, unknown>): void;
    /** Clear the active identity and begin future activity as a new visitor. */
    reset(): void;
    page(): void;
    /** Explicitly launch a published Guide, bypassing automatic targeting. */
    launchExperience(experienceId: string): void;
    defineFunnel(name: string, steps: FunnelStep[]): void;
    enableDebug(): void;
    disableDebug(): void;
    private requireInit;
    private initializeEditor;
    private fallbackFromEditor;
    private initializeExperiences;
    private wireCollectorsToPipeline;
    private trackPageView;
    private onRouteChange;
    private enqueueEvent;
    private refreshExperiencesAfterFlush;
    private buildAndEnqueue;
    /** Called by bootstrap on visibilitychange/pagehide for unload-safe delivery. */
    flushOnUnload(): void;
    private log;
}
