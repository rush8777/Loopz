import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
import type { HoverCollectorConfig } from "../types/config";
/**
 * Measures hover duration on interactive elements only (buttons, links,
 * inputs, role="button"/"link", tabindex, onclick, data-action - the same
 * detection `closestInteractive` already uses for click attribution).
 *
 * Uses exactly two delegated listeners on `document` (capture phase):
 * `pointerenter` and `pointerleave`. Although these events don't bubble,
 * capture-phase listeners on an ancestor still fire for them (capture
 * happens on the way down to the target regardless of the bubbles flag),
 * so this is true delegation - one listener pair for the whole page, not
 * one per element.
 *
 * Nested children (e.g. an icon <span> inside a <button>) are attributed
 * to the same interactive ancestor via `closestInteractive`, and a
 * `relatedTarget.contains()` check on leave prevents moving between a
 * button and its own children from being counted as separate hovers.
 *
 * Emits only two states - enter and leave - never continuous "still
 * hovering" updates, and only after the hover has ended (so exactly one
 * event per real hover, with start/end/duration already computed).
 */
export declare class HoverCollector {
    private bus;
    private privacy;
    private config;
    private selectorGenerator;
    private active;
    private onEnter;
    private onLeave;
    private running;
    constructor(bus: EventBus, privacy: PrivacyFilter, config: HoverCollectorConfig);
    start(): void;
    stop(): void;
    private handleEnter;
    private handleLeave;
}
