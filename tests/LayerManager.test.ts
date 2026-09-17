import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALWAYS_ON_TOP_Z_INDEX, LayerManager, SAFE_DEFAULT_Z_INDEX } from "../src/experiences/runtime/layering/LayerManager";
import { StackingContextResolver } from "../src/experiences/runtime/layering/StackingContextResolver";
import type { ExperienceTarget } from "../src/experiences/types";

const referenceTarget: ExperienceTarget = { primarySelector: "#reference", fallbackSelectors: [], reliability: "reliable" };

describe("LayerManager", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("places automatic anchored content above a page target but below navbars and modals", () => {
    const target = element("position:relative;z-index:0");
    const navbar = element("position:fixed;z-index:100");
    const modal = element("position:fixed;z-index:500");
    document.body.append(target, navbar, modal);
    const result = new LayerManager().resolve({ layer: { mode: "auto" }, targetElement: target });
    expect(result.zIndex).toBe(1); expect(result.zIndex).toBeLessThan(Number(navbar.style.zIndex)); expect(result.zIndex).toBeLessThan(Number(modal.style.zIndex));
  });

  it("uses a safe default for automatic non-targeted experiences", () => {
    expect(new LayerManager().resolve({ layer: { mode: "auto" } }).zIndex).toBe(SAFE_DEFAULT_Z_INDEX);
  });

  it.each([["below", 499], ["above", 501]] as const)("places relative content %s the reference outer context", (relation, expected) => {
    const reference = element("position:fixed;z-index:500"); reference.id = "reference"; document.body.appendChild(reference);
    expect(new LayerManager().resolve({ layer: { mode: "relative", relation, target: referenceTarget } }).zIndex).toBe(expected);
  });

  it("does not mistake a nested z-index for the reference's global level", () => {
    const outer = element("position:relative;z-index:10"); outer.id = "reference";
    const inner = element("position:relative;z-index:999999"); outer.appendChild(inner); document.body.appendChild(outer);
    expect(new LayerManager().resolve({ layer: { mode: "relative", relation: "above", target: referenceTarget } }).zIndex).toBe(11);
  });

  it("falls from a missing relative reference to automatic target resolution", () => {
    const target = element("position:relative;z-index:7"); document.body.appendChild(target);
    expect(new LayerManager().resolve({ layer: { mode: "relative", relation: "above", target: referenceTarget }, targetElement: target })).toMatchObject({ zIndex: 8, fallback: "relative_target_missing" });
  });

  it("keeps legacy and explicit maximum-layer behavior predictable", () => {
    const manager = new LayerManager();
    expect(manager.resolve({ legacyZIndex: 1200 })).toMatchObject({ zIndex: 1200, mode: "legacy" });
    expect(manager.resolve({})).toMatchObject({ zIndex: ALWAYS_ON_TOP_Z_INDEX, mode: "legacy" });
    expect(manager.resolve({ layer: { mode: "always_on_top" } }).zIndex).toBe(ALWAYS_ON_TOP_Z_INDEX);
    expect(manager.resolve({ layer: { mode: "custom", zIndex: 321 } }).zIndex).toBe(321);
    // This remains an ordinary CSS layer; native dialog/popover top-layer semantics still win.
  });

  it("resolves an automatic stacking context only once during mount", () => {
    const target = element("position:relative;z-index:4"); const host = element("");
    document.body.append(target, host);
    const resolver = new StackingContextResolver(); const resolve = vi.spyOn(resolver, "resolve");
    const applied = new LayerManager(resolver).apply(host, { layer: { mode: "auto" }, targetElement: target });

    expect(resolve).toHaveBeenCalledTimes(1);
    applied.destroy();
  });

  it.each([
    ["legacy", {}],
    ["custom", { layer: { mode: "custom", zIndex: 42 } }],
    ["always on top", { layer: { mode: "always_on_top" } }],
  ] as const)("does not observe target ancestry for a static %s layer", (_name, options) => {
    const constructed = vi.fn();
    vi.stubGlobal("MutationObserver", class { constructor(_callback: MutationCallback) { constructed(); } observe(): void {} disconnect(): void {} });
    const target = element(""); const host = element(""); document.body.append(target, host);
    const applied = new LayerManager().apply(host, { ...options, targetElement: target });

    expect(constructed).not.toHaveBeenCalled();
    applied.destroy();
  });

  it("recomputes when the watched reference context changes", async () => {
    const reference = element("position:relative;z-index:5"); reference.id = "reference"; document.body.appendChild(reference);
    const host = element(""); document.documentElement.appendChild(host);
    const applied = new LayerManager().apply(host, { layer: { mode: "relative", relation: "above", target: referenceTarget } });
    expect(host.style.zIndex).toBe("6"); reference.style.zIndex = "20";
    await vi.waitFor(() => expect(host.style.zIndex).toBe("21"));
    applied.destroy(); host.remove();
  });
});

function element(style: string): HTMLDivElement { const value = document.createElement("div"); value.style.cssText = style; return value; }
