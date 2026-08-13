import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
import { SelectorGenerator } from "../dom/SelectorGenerator";
import { closestInteractive } from "../dom/ElementUtils";
import type { HoverCollectorConfig } from "../types/config";
import type { HoverEventPayload } from "../types/events";

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
export class HoverCollector {
  private selectorGenerator = new SelectorGenerator();
  private active = new Map<Element, { startedAt: number; x: number; y: number }>();
  private onEnter = (e: PointerEvent) => this.handleEnter(e);
  private onLeave = (e: PointerEvent) => this.handleLeave(e);
  private running = false;

  constructor(
    private bus: EventBus,
    private privacy: PrivacyFilter,
    private config: HoverCollectorConfig
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    document.addEventListener("pointerenter", this.onEnter as EventListener, {
      capture: true,
      passive: true,
    });
    document.addEventListener("pointerleave", this.onLeave as EventListener, {
      capture: true,
      passive: true,
    });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    document.removeEventListener("pointerenter", this.onEnter as EventListener, { capture: true });
    document.removeEventListener("pointerleave", this.onLeave as EventListener, { capture: true });
    this.active.clear();
  }

  private handleEnter(e: PointerEvent): void {
    const target = e.target as Element | null;
    if (!target || target.nodeType !== 1) return;

    const interactiveEl = closestInteractive(target);
    if (!interactiveEl) return; // not a tracked interactive element - ignore
    if (this.active.has(interactiveEl)) return; // already tracking (re-entered from a child)
    if (!this.privacy.shouldCapture(interactiveEl)) return;

    const rect = interactiveEl.getBoundingClientRect();
    this.active.set(interactiveEl, {
      startedAt: Date.now(),
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    });
  }

  private handleLeave(e: PointerEvent): void {
    const target = e.target as Element | null;
    if (!target || target.nodeType !== 1) return;

    const interactiveEl = closestInteractive(target);
    if (!interactiveEl) return;

    const active = this.active.get(interactiveEl);
    if (active === undefined) return;

    // Moving from the interactive element onto one of its own descendants
    // (e.g. button -> icon inside it) fires leave/enter pairs without the
    // user actually leaving the widget. A single, cheap `contains()` check
    // (no layout/reflow) filters that out.
    const related = e.relatedTarget as Element | null;
    if (related && interactiveEl.contains(related)) return;

    const hoverEnd = Date.now();
    const durationMs = hoverEnd - active.startedAt;
    this.active.delete(interactiveEl);

    if (durationMs < this.config.minHoverMs) return; // drop accidental pass-throughs

    const payload: HoverEventPayload = {
      element: this.selectorGenerator.describe(interactiveEl),
      hoverStart: active.startedAt,
      hoverEnd,
      durationMs,
      x: active.x,
      y: active.y,
    };

    this.bus.emit("hover", payload);
  }
}
