import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, ExperienceTarget, WidgetBuilderState, WidgetType } from "../types";
import { mountBuilderContent } from "./BuilderContent";
import { applyBuilderSizeContent, applyWidgetSizeEnvelope } from "./WidgetSizing";

export interface RenderCallbacks { onDismiss: () => void; onPrimary: () => void; onSecondary: () => void; onBack?: () => void }

export function findTarget(target?: ExperienceTarget): Element | null {
  if (!target) return null;
  for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
    try { const matches = document.querySelectorAll(selector); if (matches.length === 1) return matches[0]; } catch { /* invalid selector cannot break host */ }
  }
  return null;
}

/** Resolves a selector that may be rendered after the experience manifest arrives. */
export function waitForTarget(target: ExperienceTarget | undefined, onFound: (element: Element) => void, onUnavailable: () => void, timeoutMs = 5000): () => void {
  const immediate = findTarget(target); if (immediate) { onFound(immediate); return () => void 0; }
  let stopped = false; let observer: MutationObserver | null = null; let timer = 0; let frameId: number | null = null;
  const stop = () => {
    if (stopped) return;
    stopped = true; observer?.disconnect(); clearTimeout(timer);
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  };
  const check = () => { if (stopped) return; const element = findTarget(target); if (element) { stop(); onFound(element); } };
  const scheduleCheck = () => {
    if (stopped || frameId !== null) return;
    frameId = requestAnimationFrame(() => { frameId = null; check(); });
  };
  if (typeof MutationObserver === "undefined" || !document.documentElement) { timer = window.setTimeout(() => { stop(); onUnavailable(); }, timeoutMs); return stop; }
  observer = new MutationObserver(scheduleCheck); observer.observe(document.documentElement, { childList: true, subtree: true }); timer = window.setTimeout(() => { if (!stopped) { stop(); onUnavailable(); } }, timeoutMs);
  return stop;
}

export function buildCard(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState, widgetType?: WidgetType): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.style.setProperty("--movcues-bg", design.theme.background);
  card.style.setProperty("--movcues-fg", design.theme.foreground);
  card.style.setProperty("--movcues-primary", design.theme.primary);
  card.dataset.width = design.width; card.dataset.radius = design.theme.borderRadius;
  if (widgetType) applyWidgetSizeEnvelope(card, widgetType, design);
  const mountedBuilder = Boolean(builder && mountBuilderContent(root, card, builder, callbacks, widgetType === "survey"));
  if (mountedBuilder && widgetType) applyBuilderSizeContent(card, widgetType, design);
  if (!mountedBuilder) {
    const primary = content.primaryAction ? `<button class="primary" data-primary>${escapeText(content.primaryAction.label)}</button>` : "";
    const secondary = content.secondaryAction ? `<button class="secondary" data-secondary>${escapeText(content.secondaryAction.label)}</button>` : "";
    card.insertAdjacentHTML("beforeend", `<div class="legacy-content"><h2>${escapeText(content.heading)}</h2><p>${escapeText(content.body)}</p><footer>${secondary}${primary}</footer></div>`);
    card.querySelector("[data-primary]")?.addEventListener("click", callbacks.onPrimary);
    card.querySelector("[data-secondary]")?.addEventListener("click", callbacks.onSecondary);
  }
  if (behavior.dismissible) mountRuntimeDismissControl(card, callbacks.onDismiss);
  root.appendChild(card);
  if (mountedBuilder && widgetType) fitBuilderWidthEnvelope(card);
  if (mountedBuilder && widgetType === "anchored_card") fitAnchoredBuilderEnvelope(card);
  return card;
}

/**
 * Runtime controls are deliberately kept outside the authored builder surface.
 * The nested shadow root means saved CSS remains authoritative for saved
 * content, while it cannot accidentally turn a dismiss control into part of an
 * authored flex or grid layout.
 */
function mountRuntimeDismissControl(card: HTMLElement, onDismiss: () => void): void {
  const chrome = document.createElement("div");
  chrome.className = "movcues-runtime-chrome";
  chrome.dataset.movcuesRuntimeChrome = "dismiss";
  chrome.style.setProperty("position", "absolute", "important");
  chrome.style.setProperty("inset", "0", "important");
  chrome.style.setProperty("z-index", "2", "important");
  chrome.style.setProperty("pointer-events", "none", "important");
  const chromeRoot = chrome.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `:host{all:initial;color:inherit}button{position:absolute;top:7px;right:8px;display:block;box-sizing:border-box;flex:none;margin:0;border:0;border-radius:7px;padding:3px 7px;background:transparent;color:inherit;font:20px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;pointer-events:auto}`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "movcues-runtime-close";
  close.dataset.dismiss = "";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", onDismiss);
  chromeRoot.append(style, close);
  card.appendChild(chrome);
}

/**
 * Old mixed-guide drafts can contain a modal-sized guide envelope around a
 * narrower authored anchored card. Placement and the runtime close button use
 * the envelope, so collapse only a genuinely oversized envelope to its visual
 * root before calculating target-relative coordinates.
 */
function fitAnchoredBuilderEnvelope(card: HTMLElement): void {
  const widget = card.querySelector<HTMLElement>(".builder-content > .movcues-widget");
  if (!widget) return;
  const cardRect = card.getBoundingClientRect(); const widgetRect = widget.getBoundingClientRect();
  if (widgetRect.width > 0 && cardRect.width - widgetRect.width > 0.5) card.style.width = `${Math.ceil(widgetRect.width)}px`;
  if (widgetRect.height > 0 && cardRect.height - widgetRect.height > 0.5) card.style.height = `${Math.ceil(widgetRect.height)}px`;
}

/**
 * The outer card is only a positioning envelope. Once saved CSS establishes
 * the visual root width, collapse the shell to it so card positioning and
 * runtime chrome exactly follow the authored widget.
 */
function fitBuilderWidthEnvelope(card: HTMLElement): void {
  const widget = card.querySelector<HTMLElement>(".builder-content > .movcues-widget");
  if (!widget) return;
  const cardRect = card.getBoundingClientRect(); const widgetRect = widget.getBoundingClientRect();
  // A viewport-capped widget and card have the same rendered width. In that
  // case keep the authored/preferred card width so it can expand again after a
  // rotation or desktop resize. Collapse only genuinely compact authored roots.
  if (widgetRect.width <= 0 || cardRect.width - widgetRect.width <= 0.5) return;
  card.style.width = `${Math.ceil(widgetRect.width)}px`;
  card.style.minWidth = "0";
}

export class AnchoredCardRenderer {
  private cleanup: Array<() => void> = [];
  render(root: ShadowRoot, target: Element, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState, widgetType?: WidgetType): HTMLElement {
    this.destroy();
    const card = buildCard(root, content, design, behavior, callbacks, builder, widgetType);
    const pointer = behavior.pointer?.enabled === false ? null : buildPointer(card, design, behavior);
    let frameId: number | null = null;
    let destroyed = false;
    let hidden = false;
    let resolvedPlacement: ResolvedPlacement | null = null;
    let cardSize: Size | null = null;
    let measureCard = true;
    let lastLeft: number | null = null;
    let lastTop: number | null = null;
    const setHidden = (next: boolean) => {
      if (hidden === next) return;
      hidden = next;
      card.style.visibility = next ? "hidden" : "";
      card.style.pointerEvents = next ? "none" : "";
    };
    const update = () => {
      if (destroyed) return;
      if (!target.isConnected) {
        setHidden(true);
        return;
      }
      const rect = target.getBoundingClientRect();
      if (measureCard || !cardSize) {
        const bounds = card.getBoundingClientRect();
        cardSize = { width: bounds.width, height: bounds.height };
        measureCard = false;
      }
      const bounds = cardSize;
      if (!resolvedPlacement) resolvedPlacement = resolvePlacement(rect, bounds, behavior);
      const coordinates = coordinatesFor(rect, bounds, behavior, resolvedPlacement);
      const naturalCardRect = rectAt(coordinates.left, coordinates.top, bounds.width, bounds.height);
      if (!intersectsViewport(rect) && !intersectsViewport(naturalCardRect)) { setHidden(true); return; }

      setHidden(false);
      const left = clampHorizontally(coordinates.left, bounds.width);
      const top = clampVertically(coordinates.top, bounds.height);
      if (pointer) positionPointer(pointer, rect, bounds, left, top, resolvedPlacement, behavior);
      if (left !== lastLeft) { lastLeft = left; card.style.left = `${left}px`; }
      if (top !== lastTop) { lastTop = top; card.style.top = `${top}px`; }
    };
    const schedule = (reconsiderPlacement = false, remeasureCard = false) => {
      if (destroyed) return;
      if (reconsiderPlacement && isAutomaticPlacement(behavior)) resolvedPlacement = null;
      if (remeasureCard) measureCard = true;
      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => { frameId = null; update(); });
    };
    const onScroll = (event: Event) => {
      const scrollContainer = event.target;
      if (target.isConnected && scrollContainer instanceof Element && !scrollContainer.contains(target)) return;
      schedule();
    };
    const onResize = () => schedule(true, true);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    this.cleanup.push(
      () => window.removeEventListener("scroll", onScroll, true),
      () => window.removeEventListener("resize", onResize),
      () => window.visualViewport?.removeEventListener("resize", onResize),
      () => window.visualViewport?.removeEventListener("scroll", onResize),
      () => { destroyed = true; if (frameId !== null) cancelAnimationFrame(frameId); frameId = null; },
    );
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => schedule(true, entries.some(entry => entry.target === card)));
      observer.observe(target); observer.observe(card);
      this.cleanup.push(() => observer.disconnect());
    }
    update(); return card;
  }
  destroy(): void { this.cleanup.splice(0).forEach((fn) => fn()); }
}

function buildPointer(card: HTMLElement, design: ExperienceDesign, behavior: ExperienceBehavior): HTMLElement {
  const pointer = document.createElement("span");
  const size = pointerSize(behavior);
  pointer.className = "movcues-anchor-pointer";
  pointer.setAttribute("aria-hidden", "true");
  pointer.style.setProperty("--movcues-pointer-size", `${size}px`);
  pointer.style.color = pointerColor(card, design);
  pointer.innerHTML = '<svg viewBox="0 0 10 10" focusable="false" aria-hidden="true"><path d="M5 0 10 10H0Z" fill="currentColor"/></svg>';
  card.prepend(pointer);
  return pointer;
}

function pointerColor(card: HTMLElement, design: ExperienceDesign): string {
  const widget = card.querySelector<HTMLElement>(".movcues-widget");
  if (!widget) return design.theme.background;
  const background = getComputedStyle(widget).backgroundColor.trim();
  return isTransparent(background) ? design.theme.background : background;
}

function isTransparent(color: string): boolean {
  return !color || color.toLowerCase() === "transparent" || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color);
}

function positionPointer(pointer: HTMLElement, targetRect: DOMRect, cardSize: Size, finalLeft: number, finalTop: number, placement: ResolvedPlacement, behavior: ExperienceBehavior): void {
  const size = pointerSize(behavior);
  const edgePadding = Math.max(size + 6, 14);
  pointer.dataset.placement = placement;
  if (placement === "top" || placement === "bottom") {
    const center = clamp(targetRect.left + targetRect.width / 2 - finalLeft, edgePadding, cardSize.width - edgePadding);
    pointer.style.left = `${center}px`;
    pointer.style.top = "";
  } else {
    const center = clamp(targetRect.top + targetRect.height / 2 - finalTop, edgePadding, cardSize.height - edgePadding);
    pointer.style.top = `${center}px`;
    pointer.style.left = "";
  }
}

function pointerSize(behavior: ExperienceBehavior): number {
  const requested = behavior.pointer?.size ?? 10;
  return Number.isFinite(requested) ? clamp(Math.round(requested), 4, 30) : 10;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return maximum / 2;
  return Math.max(minimum, Math.min(value, maximum));
}

type ResolvedPlacement = Exclude<NonNullable<ExperienceBehavior["placement"]>, "auto">;

interface Size { width: number; height: number }
interface Coordinates { left: number; top: number }

function isAutomaticPlacement(behavior: ExperienceBehavior): boolean {
  return !behavior.placement || behavior.placement === "auto";
}

function resolvePlacement(rect: DOMRect, bounds: Size, behavior: ExperienceBehavior): ResolvedPlacement {
  if (!isAutomaticPlacement(behavior)) return behavior.placement as ResolvedPlacement;
  const gap = behavior.offset ?? 8;
  const viewport = visibleViewport();
  const spaceBelow = viewport.bottom - rect.bottom - gap;
  const spaceAbove = rect.top - viewport.top - gap;
  if (spaceBelow >= bounds.height) return "bottom";
  if (spaceAbove >= bounds.height) return "top";
  return spaceBelow >= spaceAbove ? "bottom" : "top";
}

function coordinatesFor(rect: DOMRect, bounds: Size, behavior: ExperienceBehavior, placement: ResolvedPlacement): Coordinates {
  const gap = behavior.offset ?? 8;
  let left = rect.left + (rect.width - bounds.width) / 2; let top = rect.bottom + gap;
  if (placement === "top") top = rect.top - bounds.height - gap;
  if (placement === "left") { left = rect.left - bounds.width - gap; top = rect.top + (rect.height - bounds.height) / 2; }
  if (placement === "right") { left = rect.right + gap; top = rect.top + (rect.height - bounds.height) / 2; }
  if (behavior.alignment === "start" && (placement === "top" || placement === "bottom")) left = rect.left;
  if (behavior.alignment === "end" && (placement === "top" || placement === "bottom")) left = rect.right - bounds.width;
  return { left, top };
}

function clampHorizontally(left: number, width: number): number {
  const margin = 8;
  const viewport = visibleViewport();
  return Math.max(viewport.left + margin, Math.min(left, viewport.right - width - margin));
}

function clampVertically(top: number, height: number): number {
  const margin = 8;
  const viewport = visibleViewport();
  return Math.max(viewport.top + margin, Math.min(top, viewport.bottom - height - margin));
}

function visibleViewport(): { left: number; top: number; right: number; bottom: number } {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0; const top = viewport?.offsetTop ?? 0;
  return { left, top, right: left + (viewport?.width ?? innerWidth), bottom: top + (viewport?.height ?? innerHeight) };
}

function rectAt(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}

function intersectsViewport(rect: DOMRect): boolean {
  const viewport = visibleViewport();
  return rect.width > 0 && rect.height > 0 && rect.bottom > viewport.top && rect.right > viewport.left && rect.top < viewport.bottom && rect.left < viewport.right;
}

function escapeText(value: string): string { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }
