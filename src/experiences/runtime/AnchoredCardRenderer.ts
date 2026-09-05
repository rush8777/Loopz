import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, ExperienceTarget, WidgetBuilderState } from "../types";
import { mountBuilderContent } from "./BuilderContent";

export interface RenderCallbacks { onDismiss: () => void; onPrimary: () => void; onSecondary: () => void; onBack?: () => void }

export function findTarget(target?: ExperienceTarget): Element | null {
  if (!target) return null;
  for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
    try { const element = document.querySelector(selector); if (element) return element; } catch { /* invalid selector cannot break host */ }
  }
  return null;
}

/** Resolves a selector that may be rendered after the experience manifest arrives. */
export function waitForTarget(target: ExperienceTarget | undefined, onFound: (element: Element) => void, onUnavailable: () => void, timeoutMs = 5000): () => void {
  const immediate = findTarget(target); if (immediate) { onFound(immediate); return () => void 0; }
  let stopped = false; let observer: MutationObserver | null = null; let timer = 0;
  const stop = () => { if (stopped) return; stopped = true; observer?.disconnect(); clearTimeout(timer); };
  const check = () => { if (stopped) return; const element = findTarget(target); if (element) { stop(); onFound(element); } };
  if (typeof MutationObserver === "undefined" || !document.documentElement) { timer = window.setTimeout(() => { stop(); onUnavailable(); }, timeoutMs); return stop; }
  observer = new MutationObserver(check); observer.observe(document.documentElement, { childList: true, subtree: true }); timer = window.setTimeout(() => { if (!stopped) { stop(); onUnavailable(); } }, timeoutMs);
  return stop;
}

export function buildCard(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState): HTMLElement {
  const card = document.createElement("section");
  card.className = "card";
  card.style.setProperty("--loopz-bg", design.theme.background);
  card.style.setProperty("--loopz-fg", design.theme.foreground);
  card.style.setProperty("--loopz-primary", design.theme.primary);
  card.dataset.width = design.width; card.dataset.radius = design.theme.borderRadius;
  const close = behavior.dismissible ? `<button class="close" data-dismiss aria-label="Dismiss">×</button>` : "";
  card.innerHTML = close;
  card.querySelector("[data-dismiss]")?.addEventListener("click", callbacks.onDismiss);
  if (!builder || !mountBuilderContent(root, card, builder, callbacks)) {
    const primary = content.primaryAction ? `<button class="primary" data-primary>${escapeText(content.primaryAction.label)}</button>` : "";
    const secondary = content.secondaryAction ? `<button class="secondary" data-secondary>${escapeText(content.secondaryAction.label)}</button>` : "";
    card.insertAdjacentHTML("beforeend", `<div class="legacy-content"><h2>${escapeText(content.heading)}</h2><p>${escapeText(content.body)}</p><footer>${secondary}${primary}</footer></div>`);
    card.querySelector("[data-primary]")?.addEventListener("click", callbacks.onPrimary);
    card.querySelector("[data-secondary]")?.addEventListener("click", callbacks.onSecondary);
  }
  root.appendChild(card);
  return card;
}

export class AnchoredCardRenderer {
  private cleanup: Array<() => void> = [];
  render(root: ShadowRoot, target: Element, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState): HTMLElement {
    const card = buildCard(root, content, design, behavior, callbacks, builder);
    const update = () => position(card, target.getBoundingClientRect(), behavior);
    const onWindow = () => requestAnimationFrame(update);
    window.addEventListener("scroll", onWindow, true); window.addEventListener("resize", onWindow);
    this.cleanup.push(() => window.removeEventListener("scroll", onWindow, true), () => window.removeEventListener("resize", onWindow));
    if (typeof ResizeObserver !== "undefined") { const observer = new ResizeObserver(update); observer.observe(target); observer.observe(card); this.cleanup.push(() => observer.disconnect()); }
    if (typeof MutationObserver !== "undefined") { const observer = new MutationObserver(onWindow); observer.observe(document.body, { childList: true, subtree: true, attributes: true }); this.cleanup.push(() => observer.disconnect()); }
    update(); return card;
  }
  destroy(): void { this.cleanup.splice(0).forEach((fn) => fn()); }
}

function position(card: HTMLElement, rect: DOMRect, behavior: ExperienceBehavior): void {
  const gap = behavior.offset ?? 8; const bounds = card.getBoundingClientRect(); const margin = 8;
  let placement = behavior.placement === "auto" || !behavior.placement ? "bottom" : behavior.placement;
  if (placement === "bottom" && rect.bottom + gap + bounds.height > innerHeight) placement = "top";
  if (placement === "top" && rect.top - gap - bounds.height < 0) placement = "bottom";
  let left = rect.left + (rect.width - bounds.width) / 2; let top = rect.bottom + gap;
  if (placement === "top") top = rect.top - bounds.height - gap;
  if (placement === "left") { left = rect.left - bounds.width - gap; top = rect.top + (rect.height - bounds.height) / 2; }
  if (placement === "right") { left = rect.right + gap; top = rect.top + (rect.height - bounds.height) / 2; }
  if (behavior.alignment === "start" && (placement === "top" || placement === "bottom")) left = rect.left;
  if (behavior.alignment === "end" && (placement === "top" || placement === "bottom")) left = rect.right - bounds.width;
  card.style.left = `${Math.max(margin, Math.min(left, innerWidth - bounds.width - margin))}px`;
  card.style.top = `${Math.max(margin, Math.min(top, innerHeight - bounds.height - margin))}px`;
}

function escapeText(value: string): string { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }
