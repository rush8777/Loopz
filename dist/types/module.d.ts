import { Analytics as CoreAnalytics } from "./core/Analytics";
import type { AnalyticsConfig } from "./types/config";
/** npm/ESM users receive module-native runtimes without CDN globals. */
export declare class Analytics extends CoreAnalytics {
    constructor();
}
export declare function createAnalytics(config: AnalyticsConfig): Analytics;
export type { AnalyticsConfig, ResolvedAnalyticsConfig, RageClickConfig, MoveCollectorConfig, ScrollCollectorConfig, HoverCollectorConfig, CursorCollectorConfig, QueueConfig, SessionReplayConfig, FeedbackConfig, } from "./types/config";
export type { ExperienceKind, WidgetType, ExperienceTarget, GuideAdvance, GuideStep, PageRule, RuntimeDefinition, DeliveredExperience } from "./experiences/types";
export type { FunnelStep } from "./types/funnel";
export type { EventType, AnalyticsEvent, AnyPayload, ClickEventPayload, ScrollEventPayload, MoveEventPayload, MovePoint, RageClickEventPayload, HoverEventPayload, CursorEventPayload, FunnelEventPayload, CustomEventPayload, IdentifyEventPayload, PageViewEventPayload, SessionReplayEventPayload, PageContext, ElementDescriptor, Viewport, ScrollPosition, } from "./types/events";
