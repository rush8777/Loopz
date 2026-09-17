import type { ExperienceLayer, ExperienceTarget } from "../../types";
import { StackingContextResolver, type StackingContextInfo } from "./StackingContextResolver";

/** Maximum ordinary CSS layer. Native dialog/popover top-layer content can still render above it. */
export const ALWAYS_ON_TOP_Z_INDEX = 2_147_483_000;
export const SAFE_DEFAULT_Z_INDEX = 1;

export interface LayerResolution {
  zIndex: number;
  mode: ExperienceLayer["mode"] | "legacy";
  context: StackingContextInfo | null;
  fallback?: "relative_target_missing";
}

export interface LayerOptions {
  layer?: ExperienceLayer;
  legacyZIndex?: number;
  targetElement?: Element | null;
}

export interface AppliedLayer {
  refresh(): LayerResolution;
  destroy(): void;
}

export class LayerManager {
  constructor(
    private resolver = new StackingContextResolver(),
    private findTarget: (target: ExperienceTarget) => Element | null = findUniqueTarget,
  ) {}

  resolve(options: LayerOptions): LayerResolution {
    if (!options.layer) {
      if (options.legacyZIndex !== undefined) return { zIndex: options.legacyZIndex, mode: "legacy", context: null };
      return { zIndex: ALWAYS_ON_TOP_Z_INDEX, mode: "legacy", context: null };
    }
    const layer = options.layer;
    if (layer.mode === "always_on_top") return { zIndex: ALWAYS_ON_TOP_Z_INDEX, mode: layer.mode, context: null };
    if (layer.mode === "custom") return { zIndex: layer.zIndex, mode: layer.mode, context: null };
    if (layer.mode === "relative") {
      const reference = this.findTarget(layer.target);
      if (!reference) {
        const automatic = this.auto(options.targetElement);
        return { ...automatic, mode: layer.mode, fallback: "relative_target_missing" };
      }
      const context = this.resolver.resolve(reference);
      return { zIndex: bounded(context.zIndex + (layer.relation === "above" ? 1 : -1)), mode: layer.mode, context };
    }
    return this.auto(options.targetElement);
  }

  private auto(targetElement?: Element | null): LayerResolution {
    const context = this.resolver.resolve(targetElement ?? null);
    return { zIndex: targetElement ? bounded(context.zIndex + 1) : SAFE_DEFAULT_Z_INDEX, mode: "auto", context };
  }

  apply(host: HTMLElement, options: LayerOptions): AppliedLayer {
    let observers: MutationObserver[] = [];
    let active = true;
    let frameId: number | null = null;
    let last!: LayerResolution;
    const disconnect = () => { observers.forEach(observer => observer.disconnect()); observers = []; };
    const refresh = () => {
      if (!active) return last;
      if (frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
      disconnect();
      const resolution = this.resolve(options);
      last = resolution;
      const zIndex = String(resolution.zIndex);
      if (host.style.zIndex !== zIndex) host.style.zIndex = zIndex;
      if (resolution.fallback) {
        if (host.dataset.movecuesLayerFallback !== resolution.fallback) host.dataset.movecuesLayerFallback = resolution.fallback;
      } else if (host.dataset.movecuesLayerFallback) delete host.dataset.movecuesLayerFallback;
      const dynamicLayer = options.layer?.mode === "auto" || options.layer?.mode === "relative";
      const watched = dynamicLayer ? (options.layer?.mode === "relative" ? this.findTarget(options.layer.target) : options.targetElement) : null;
      if (watched && typeof MutationObserver !== "undefined") {
        const observer = new MutationObserver(() => scheduleRefresh());
        for (let element: Element | null = watched; element; element = element.parentElement) {
          observer.observe(element, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
          if (element.parentElement) observer.observe(element.parentElement, { childList: true });
        }
        observers.push(observer);
      }
      return resolution;
    };
    const scheduleRefresh = () => {
      if (!active || frameId !== null) return;
      frameId = requestAnimationFrame(() => { frameId = null; refresh(); });
    };
    refresh();
    return {
      refresh,
      destroy: () => {
        active = false;
        disconnect();
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
      },
    };
  }
}

function findUniqueTarget(target: ExperienceTarget): Element | null {
  for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
    try { const matches = document.querySelectorAll(selector); if (matches.length === 1) return matches[0]; } catch { /* Invalid saved selectors fall back safely. */ }
  }
  return null;
}

function bounded(value: number): number { return Math.max(-2_147_483_648, Math.min(2_147_483_647, value)); }
