import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HotspotRenderer } from "../src/experiences/runtime/HotspotRenderer";
import type { ExperienceBehavior, ExperienceContent, ExperienceDesign } from "../src/experiences/types";

const content: ExperienceContent = { heading: "Feature", body: "Details" };
const design: ExperienceDesign = { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } };
const behavior: ExperienceBehavior = { dismissible: true, hotspotStyle: "dot" };

let frames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let resizeObserver: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };

describe("HotspotRenderer performance", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    frames = new Map(); nextFrameId = 1;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { const id = nextFrameId++; frames.set(id, callback); return id; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => { frames.delete(id); }));
    resizeObserver = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal("ResizeObserver", class { constructor(_callback: ResizeObserverCallback) {} observe = resizeObserver.observe; disconnect = resizeObserver.disconnect; });
    vi.stubGlobal("innerWidth", 1000); vi.stubGlobal("innerHeight", 800);
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("coalesces scroll bursts into one passive captured positioning frame", () => {
    const targetRect = vi.fn(() => rect(100, 120, 50, 20));
    const addListener = vi.spyOn(window, "addEventListener");
    const { renderer, beacon } = render(targetRect);
    expect(targetRect).toHaveBeenCalledTimes(1);
    expect(beacon.style.left).toBe("143px");

    for (let index = 0; index < 10; index += 1) window.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBe(1);
    flushFrames();

    expect(targetRect).toHaveBeenCalledTimes(2);
    expect(addListener).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true, passive: true });
    renderer.destroy();
  });

  it("cancels pending work and disconnects its observer on destroy", () => {
    const targetRect = vi.fn(() => rect(100, 120, 50, 20));
    const { renderer } = render(targetRect);
    window.dispatchEvent(new Event("scroll"));
    renderer.destroy();
    flushFrames();

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(resizeObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(targetRect).toHaveBeenCalledTimes(1);
  });

  it("does no work for an unrelated nested scroller", () => {
    const targetRect = vi.fn(() => rect(100, 120, 50, 20));
    const { renderer } = render(targetRect);
    const unrelatedScroller = document.createElement("div"); document.body.append(unrelatedScroller);
    unrelatedScroller.dispatchEvent(new Event("scroll"));

    expect(frames.size).toBe(0);
    expect(targetRect).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });
});

function render(targetBounds: () => DOMRect): { renderer: HotspotRenderer; beacon: HTMLElement } {
  const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" });
  const target = document.createElement("button"); target.getBoundingClientRect = targetBounds;
  document.body.append(target, host);
  const renderer = new HotspotRenderer();
  const beacon = renderer.render(root, target, content, design, behavior, { onDismiss: vi.fn(), onPrimary: vi.fn(), onSecondary: vi.fn() });
  return { renderer, beacon };
}

function flushFrames(): void {
  const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0));
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}
