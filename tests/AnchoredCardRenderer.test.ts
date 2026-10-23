import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnchoredCardRenderer, waitForTarget } from "../src/experiences/runtime/AnchoredCardRenderer";
import type { ExperienceBehavior, ExperienceContent, ExperienceDesign } from "../src/experiences/types";

const content: ExperienceContent = { heading: "Guide", body: "Anchored to the target" };
const design: ExperienceDesign = { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } };
const behavior: ExperienceBehavior = { dismissible: true, placement: "bottom" };

let nextFrameId: number;
let frames: Map<number, FrameRequestCallback>;
let resizeObservers: MockResizeObserver[];
let cardRectReads: number;

class MockResizeObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  constructor(readonly callback: ResizeObserverCallback) { resizeObservers.push(this); }
  fire(target?: Element): void {
    const entries = target ? [{ target }] as ResizeObserverEntry[] : [];
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

describe("AnchoredCardRenderer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    nextFrameId = 1;
    frames = new Map();
    resizeObservers = [];
    cardRectReads = 0;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { const id = nextFrameId++; frames.set(id, callback); return id; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => { frames.delete(id); }));
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("card")) { cardRectReads += 1; return rect(0, 0, 200, 100); }
      return rect(0, 0, 0, 0);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("positions a visible card relative to its target", () => {
    const { card, renderer } = renderAt(rect(100, 120, 50, 20));
    const pointer = card.querySelector<HTMLElement>(".movcues-anchor-pointer");

    expect(card.style.visibility).toBe("");
    expect(card.style.pointerEvents).toBe("");
    expect(card.style.left).toBe("25px");
    expect(card.style.top).toBe("148px");
    expect(pointer?.dataset.placement).toBe("bottom");
    expect(pointer?.style.left).toBe("100px");
    renderer.destroy();
  });

  it("dims around an anchored target while leaving its rectangle uncovered", () => {
    const { card, renderer } = renderAt(rect(100, 120, 50, 20), { ...behavior, backdrop: true, backdropOpacity: 0.6 });
    const root = card.getRootNode() as ShadowRoot;
    const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-movcues-target-backdrop]"));
    const highlight = root.querySelector<HTMLElement>("[data-movcues-target-highlight]");

    expect(panels).toHaveLength(4);
    expect(panels[0].style.cssText).toContain("rgba(0, 0, 0, 0.6)");
    expect(rectStyles(panels[0])).toEqual(["0px", "0px", "1000px", "120px"]);
    expect(rectStyles(panels[1])).toEqual(["150px", "120px", "850px", "20px"]);
    expect(rectStyles(panels[2])).toEqual(["0px", "140px", "1000px", "660px"]);
    expect(rectStyles(panels[3])).toEqual(["0px", "120px", "100px", "20px"]);
    expect(highlight && rectStyles(highlight)).toEqual(["100px", "120px", "50px", "20px"]);
    expect(highlight?.style.outline).toBe("2px solid #2563eb");
    expect(root.childNodes.item(root.childNodes.length - 1)).toBe(card);
    renderer.destroy();
  });

  it("updates, hides, dismisses, and removes the target backdrop with the anchored card", () => {
    let targetRect = rect(100, 120, 50, 20);
    const dismiss = vi.fn();
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" });
    const target = document.createElement("button"); target.getBoundingClientRect = () => targetRect;
    document.body.append(target, host);
    const renderer = new AnchoredCardRenderer();
    const card = renderer.render(root, target, content, design, { ...behavior, backdrop: true, closeOnBackdrop: true }, { onDismiss: dismiss, onPrimary: vi.fn(), onSecondary: vi.fn() });
    const top = root.querySelector<HTMLElement>('[data-movcues-target-backdrop="top"]')!;

    top.click();
    expect(dismiss).toHaveBeenCalledTimes(1);
    targetRect = rect(240, 260, 80, 30);
    window.dispatchEvent(new Event("scroll")); flushFrames();
    expect(rectStyles(top)).toEqual(["0px", "0px", "1000px", "260px"]);

    targetRect = rect(100, -150, 50, 20);
    window.dispatchEvent(new Event("scroll")); flushFrames();
    expect(card.style.visibility).toBe("hidden");
    expect(top.style.visibility).toBe("hidden");
    renderer.destroy();
    expect(root.querySelector("[data-movcues-target-backdrop]")).toBeNull();
    expect(root.querySelector("[data-movcues-target-highlight]")).toBeNull();
  });

  it("locks user scrolling only while an anchored target backdrop is mounted", () => {
    document.documentElement.style.setProperty("overflow", "clip");
    document.body.style.setProperty("overflow", "auto", "important");
    const { renderer } = renderAt(rect(100, 120, 50, 20), { ...behavior, backdrop: true });
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
    const touchmove = new Event("touchmove", { bubbles: true, cancelable: true });
    const pageDown = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "PageDown" });

    document.body.dispatchEvent(wheel);
    document.body.dispatchEvent(touchmove);
    document.body.dispatchEvent(pageDown);
    const input = document.createElement("input"); document.body.appendChild(input);
    const inputArrow = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown" });
    input.dispatchEvent(inputArrow);
    expect(wheel.defaultPrevented).toBe(true);
    expect(touchmove.defaultPrevented).toBe(true);
    expect(pageDown.defaultPrevented).toBe(true);
    expect(inputArrow.defaultPrevented).toBe(false);
    expect(document.documentElement.style.getPropertyValue("overflow")).toBe("hidden");
    expect(document.documentElement.style.getPropertyPriority("overflow")).toBe("important");
    expect(document.body.style.getPropertyValue("overflow")).toBe("hidden");

    renderer.destroy();
    expect(document.documentElement.style.getPropertyValue("overflow")).toBe("clip");
    expect(document.documentElement.style.getPropertyPriority("overflow")).toBe("");
    expect(document.body.style.getPropertyValue("overflow")).toBe("auto");
    expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
    const unlockedWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
    document.body.dispatchEvent(unlockedWheel);
    expect(unlockedWheel.defaultPrevented).toBe(false);
    document.documentElement.style.removeProperty("overflow");
    document.body.style.removeProperty("overflow");
  });

  it("releases a hidden spotlight's scroll lock and reacquires it only when visible", () => {
    let targetRect = rect(100, 120, 50, 20);
    const target = document.createElement("button"); document.body.append(target); target.getBoundingClientRect = () => targetRect;
    const host = document.createElement("div"); document.body.append(host); const root = host.attachShadow({ mode: "open" });
    document.body.style.setProperty("overflow", "auto", "important");
    const renderer = new AnchoredCardRenderer(); renderer.render(root, target, content, design, { ...behavior, backdrop: true }, { onDismiss: vi.fn(), onPrimary: vi.fn(), onSecondary: vi.fn() });
    expect(document.body.style.overflow).toBe("hidden");
    targetRect = rect(100, -1000, 50, 20); window.dispatchEvent(new Event("scroll")); flushFrames();
    expect(document.body.style.overflow).toBe("auto"); expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
    targetRect = rect(100, 120, 50, 20); window.dispatchEvent(new Event("scroll")); flushFrames(); expect(document.body.style.overflow).toBe("hidden");
    renderer.destroy(); renderer.destroy(); expect(document.body.style.overflow).toBe("auto"); document.body.style.removeProperty("overflow");
  });

  it("allows shadow-root inputs and nested scrolling while keeping the page locked", () => {
    const { card, renderer } = renderAt(rect(100, 120, 50, 20), { ...behavior, backdrop: true });
    const input = document.createElement("input"); card.append(input);
    const key = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, composed: true, cancelable: true }); input.dispatchEvent(key); expect(key.defaultPrevented).toBe(false);
    const scroll = document.createElement("div"); scroll.style.overflowY = "auto"; Object.defineProperties(scroll, { scrollHeight: { value: 300 }, clientHeight: { value: 100 } }); card.append(scroll);
    const wheel = new WheelEvent("wheel", { deltaY: 50, bubbles: true, composed: true, cancelable: true }); scroll.dispatchEvent(wheel); expect(wheel.defaultPrevented).toBe(false);
    scroll.scrollTop = 200; const boundary = new WheelEvent("wheel", { deltaY: 50, bubbles: true, composed: true, cancelable: true }); scroll.dispatchEvent(boundary); expect(boundary.defaultPrevented).toBe(true);
    renderer.destroy();
  });

  it("does not lock the document for a collapsed target and restores scrolling after target removal", () => {
    const target = document.createElement("button"); document.body.append(target); let bounds = rect(0, 0, 0, 0); target.getBoundingClientRect = () => bounds;
    const host = document.createElement("div"); document.body.append(host); const root = host.attachShadow({ mode: "open" });
    const renderer = new AnchoredCardRenderer(); const card = renderer.render(root, target, content, design, { ...behavior, backdrop: true }, { onDismiss: vi.fn(), onPrimary: vi.fn(), onSecondary: vi.fn() });
    expect(card.style.visibility).toBe("hidden"); expect(document.documentElement.style.overflow).not.toBe("hidden");
    bounds = rect(100, 120, 80, 20); resizeObservers[0].fire(target); flushFrames(); expect(document.documentElement.style.overflow).toBe("hidden");
    target.remove(); resizeObservers[0].fire(target); flushFrames(); expect(document.documentElement.style.overflow).not.toBe("hidden"); renderer.destroy();
  });

  it("does not lock scrolling for anchored cards without a backdrop", () => {
    const { renderer } = renderAt(rect(100, 120, 50, 20));
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
    document.body.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    renderer.destroy();
  });

  it.each([
    ["bottom", rect(400, 120, 50, 20), "100px", ""],
    ["top", rect(400, 220, 50, 20), "100px", ""],
    ["left", rect(400, 220, 50, 20), "", "50px"],
    ["right", rect(400, 220, 50, 20), "", "50px"],
  ] as const)("points toward the target for %s placement", (placement, targetRect, expectedLeft, expectedTop) => {
    const { card, renderer } = renderAt(targetRect, { ...behavior, placement });
    const pointer = card.querySelector<HTMLElement>(".movcues-anchor-pointer")!;

    expect(pointer.dataset.placement).toBe(placement);
    expect(pointer.style.left).toBe(expectedLeft);
    expect(pointer.style.top).toBe(expectedTop);
    renderer.destroy();
  });

  it.each([
    ["left viewport edge", rect(0, 120, 20, 20), "8px", "16px"],
    ["right viewport edge", rect(980, 120, 20, 20), "792px", "184px"],
  ])("keeps a bottom pointer targeted after clamping at the %s", (_label, targetRect, expectedCardLeft, expectedPointerLeft) => {
    const { card, renderer } = renderAt(targetRect);
    const pointer = card.querySelector<HTMLElement>(".movcues-anchor-pointer")!;

    expect(card.style.left).toBe(expectedCardLeft);
    expect(pointer.style.left).toBe(expectedPointerLeft);
    renderer.destroy();
  });

  it("clamps the pointer away from rounded card corners", () => {
    const { card, renderer } = renderAt(rect(-5, 120, 20, 20));
    const pointer = card.querySelector<HTMLElement>(".movcues-anchor-pointer")!;

    expect(pointer.style.left).toBe("16px");
    renderer.destroy();
  });

  it("does not render a pointer when it is disabled", () => {
    const { card, renderer } = renderAt(rect(100, 120, 50, 20), { ...behavior, pointer: { enabled: false } });

    expect(card.querySelector(".movcues-anchor-pointer")).toBeNull();
    renderer.destroy();
  });

  it("uses a custom pointer size for its shape and edge padding", () => {
    const { card, renderer } = renderAt(rect(0, 120, 20, 20), { ...behavior, pointer: { size: 24 } });
    const pointer = card.querySelector<HTMLElement>(".movcues-anchor-pointer")!;

    expect(pointer.style.getPropertyValue("--movcues-pointer-size")).toBe("24px");
    expect(pointer.style.left).toBe("30px");
    renderer.destroy();
  });

  it("uses the authored widget background for the pointer without placing it in builder content", () => {
    vi.stubGlobal("getComputedStyle", vi.fn(() => ({ backgroundColor: "rgb(13, 19, 45)" })));
    const { card, renderer } = renderBuilderAt(".movcues-widget{background:#0d132d}");
    const pointer = card.querySelector<HTMLElement>(".movcues-anchor-pointer")!;

    expect(pointer.style.color).toBe("rgb(13, 19, 45)");
    expect(card.querySelector(".builder-content")?.querySelector(".movcues-anchor-pointer")).toBeNull();
    expect(getComputedStyle).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });

  it("falls back to the theme when the authored widget background is transparent", () => {
    vi.stubGlobal("getComputedStyle", vi.fn(() => ({ backgroundColor: "rgba(0, 0, 0, 0)" })));
    const { card, renderer } = renderBuilderAt(".movcues-widget{background:transparent}");
    const pointer = card.querySelector<HTMLElement>(".movcues-anchor-pointer")!;

    expect(pointer.style.color).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });

  it("stays mounted when host UI visually overlaps the target", () => {
    const navigation = document.createElement("nav");
    document.body.appendChild(navigation);
    vi.mocked(document.elementFromPoint).mockReturnValue(navigation);
    const { card, renderer } = renderAt(rect(100, 120, 50, 20));

    expect(card.style.visibility).toBe("");
    expect(card.style.pointerEvents).toBe("");
    expect(document.elementFromPoint).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it("continues upward with its target instead of sticking to the viewport edge", () => {
    let targetRect = rect(100, 120, 50, 20);
    const { card, renderer } = renderAt(() => targetRect);
    targetRect = rect(100, 50, 50, 20);
    window.dispatchEvent(new Event("scroll")); flushFrames();
    expect(card.style.top).toBe("78px");

    targetRect = rect(100, -10, 50, 20);
    window.dispatchEvent(new Event("scroll")); flushFrames();
    expect(card.style.top).toBe("18px");
    expect(card.style.top).not.toBe("8px");
    renderer.destroy();
  });

  it("remains visible after the target leaves while the natural card is still visible", () => {
    const { card, renderer } = renderAt(rect(100, -30, 50, 20));

    expect(card.style.top).toBe("-2px");
    expect(card.style.visibility).toBe("");
    expect(card.style.pointerEvents).toBe("");
    renderer.destroy();
  });

  it("hides without recreating the card once the entire anchored pair is offscreen", () => {
    let targetRect = rect(100, 120, 50, 20);
    const { card, renderer } = renderAt(() => targetRect);
    targetRect = rect(100, -150, 50, 20);
    window.dispatchEvent(new Event("scroll")); flushFrames();

    expect(card.style.visibility).toBe("hidden");
    expect(card.style.pointerEvents).toBe("none");
    expect(card.isConnected).toBe(true);
    renderer.destroy();
  });

  it("keeps an automatically resolved placement stable during ordinary scrolling", () => {
    let targetRect = rect(100, 100, 50, 20);
    const { card, renderer } = renderAt(() => targetRect, { ...behavior, placement: "auto" });
    expect(card.style.top).toBe("128px");
    targetRect = rect(100, 700, 50, 20);
    window.dispatchEvent(new Event("scroll")); flushFrames();

    expect(card.style.top).toBe("728px");
    renderer.destroy();
  });

  it("recomputes automatic placement after a viewport resize", () => {
    let targetRect = rect(100, 100, 50, 20);
    const { card, renderer } = renderAt(() => targetRect, { ...behavior, placement: "auto" });
    targetRect = rect(100, 500, 50, 20);
    window.dispatchEvent(new Event("scroll")); flushFrames();
    expect(card.style.top).toBe("528px");

    vi.stubGlobal("innerHeight", 550);
    window.dispatchEvent(new Event("resize")); flushFrames();
    expect(card.style.top).toBe("392px");
    renderer.destroy();
  });

  it("coalesces many scroll events into one positioning frame", () => {
    const targetRect = vi.fn(() => rect(100, 120, 50, 20));
    const { renderer } = renderAt(targetRect);
    expect(targetRect).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 10; index += 1) window.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBe(1);
    flushFrames();

    expect(targetRect).toHaveBeenCalledTimes(2);
    renderer.destroy();
  });

  it("ignores scroll events from containers that cannot move the target", () => {
    const targetRect = vi.fn(() => rect(100, 120, 50, 20));
    const { target, renderer } = renderAt(targetRect);
    const unrelatedScroller = document.createElement("div"); document.body.append(unrelatedScroller);
    unrelatedScroller.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBe(0);

    const targetScroller = document.createElement("div"); document.body.append(targetScroller); targetScroller.append(target);
    targetScroller.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBe(1);
    flushFrames();
    expect(targetRect).toHaveBeenCalledTimes(2);
    renderer.destroy();
  });

  it("reuses the observed card size during scrolling and remeasures only when required", () => {
    let targetRect = rect(100, 120, 50, 20);
    const { card, renderer } = renderAt(() => targetRect);
    expect(cardRectReads).toBe(1);

    targetRect = rect(100, 100, 50, 20);
    window.dispatchEvent(new Event("scroll")); flushFrames();
    targetRect = rect(100, 80, 50, 20);
    window.dispatchEvent(new Event("scroll")); flushFrames();
    expect(cardRectReads).toBe(1);

    resizeObservers[0].fire(card); flushFrames();
    expect(cardRectReads).toBe(2);
    renderer.destroy();
  });

  it("disconnects observers, removes listeners, and cancels pending work on destroy", () => {
    const targetRect = vi.fn(() => rect(100, 120, 50, 20));
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    const { renderer } = renderAt(targetRect);
    window.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBe(1);
    renderer.destroy();
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    flushFrames();

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(targetRect).toHaveBeenCalledTimes(1);
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true, passive: true });
    expect(removeListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("does no stale-element layout work after the target disconnects", () => {
    const targetRect = vi.fn(() => rect(100, 120, 50, 20));
    const { target, card, renderer } = renderAt(targetRect);
    target.remove();
    window.dispatchEvent(new Event("scroll")); flushFrames();

    expect(targetRect).toHaveBeenCalledTimes(1);
    expect(card.style.visibility).toBe("hidden");
    expect(card.style.pointerEvents).toBe("none");
    renderer.destroy();
  });

  it("uses targeted resize observation and creates no positioning MutationObserver", () => {
    const mutationConstructor = vi.fn();
    vi.stubGlobal("MutationObserver", mutationConstructor);
    const { renderer } = renderAt(rect(100, 120, 50, 20));

    expect(mutationConstructor).not.toHaveBeenCalled();
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledTimes(2);
    renderer.destroy();
  });

  it("coalesces busy-page mutations while waiting for a delayed target", async () => {
    const query = vi.spyOn(document, "querySelectorAll");
    const found = vi.fn();
    const stop = waitForTarget({ primarySelector: "#delayed", fallbackSelectors: [], reliability: "reliable" }, found, vi.fn());
    expect(query).toHaveBeenCalledTimes(1);

    document.body.append(document.createElement("div")); await Promise.resolve();
    document.body.append(document.createElement("div")); await Promise.resolve();
    const target = document.createElement("button"); target.id = "delayed"; document.body.append(target); await Promise.resolve();

    expect(frames.size).toBe(1);
    expect(query).toHaveBeenCalledTimes(1);
    flushFrames();
    expect(query).toHaveBeenCalledTimes(2);
    expect(found).toHaveBeenCalledWith(target);
    stop();
  });

  it("coalesces target and card ResizeObserver notifications into one update", () => {
    const targetRect = vi.fn(() => rect(100, 120, 50, 20));
    const { renderer } = renderAt(targetRect, { ...behavior, placement: "auto" });
    resizeObservers[0].fire();
    resizeObservers[0].fire();
    expect(frames.size).toBe(1);
    flushFrames();

    expect(targetRect).toHaveBeenCalledTimes(2);
    renderer.destroy();
  });

  it("collapses a stale oversized envelope to the authored anchored widget", () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("card")) return rect(0, 0, Number.parseFloat(this.style.width) || 600, Number.parseFloat(this.style.height) || 200);
      if (this.classList.contains("movcues-widget")) return rect(0, 0, 400, 168);
      return rect(0, 0, 0, 0);
    });
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" });
    const target = document.createElement("button"); target.getBoundingClientRect = () => rect(850, 300, 120, 40);
    document.body.append(target, host);
    const renderer = new AnchoredCardRenderer();
    const card = renderer.render(root, target, content, { ...design, size: { width: { mode: "fixed", value: 480 }, height: { mode: "fixed", value: 300 } } }, { ...behavior, placement: "left" }, { onDismiss: vi.fn(), onPrimary: vi.fn(), onSecondary: vi.fn() }, { version: 1, projectData: {}, html: '<section class="movcues-widget">Authored card</section>', css: ".movcues-widget{width:400px;height:168px}" }, "anchored_card");

    expect(card.style.width).toBe("400px");
    expect(card.style.height).toBe("168px");
    expect(card.style.left).toBe("442px");
    renderer.destroy();
  });
});

function renderAt(targetBounds: DOMRect | (() => DOMRect), customBehavior: ExperienceBehavior = behavior): { target: HTMLElement; card: HTMLElement; renderer: AnchoredCardRenderer } {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  const target = document.createElement("button");
  target.getBoundingClientRect = typeof targetBounds === "function" ? targetBounds : () => targetBounds;
  document.body.append(target, host);
  const renderer = new AnchoredCardRenderer();
  const card = renderer.render(root, target, content, design, customBehavior, { onDismiss: vi.fn(), onPrimary: vi.fn(), onSecondary: vi.fn() });
  return { target, card, renderer };
}

function renderBuilderAt(css: string): { target: HTMLElement; card: HTMLElement; renderer: AnchoredCardRenderer } {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  const target = document.createElement("button");
  target.getBoundingClientRect = () => rect(100, 120, 50, 20);
  document.body.append(target, host);
  const renderer = new AnchoredCardRenderer();
  const card = renderer.render(root, target, content, design, behavior, { onDismiss: vi.fn(), onPrimary: vi.fn(), onSecondary: vi.fn() }, { version: 1, projectData: {}, html: '<section class="movcues-widget">Authored card</section>', css }, "anchored_card");
  return { target, card, renderer };
}

function flushFrames(): void {
  const pending = [...frames.entries()];
  frames.clear();
  pending.forEach(([, callback]) => callback(0));
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}

function rectStyles(element: HTMLElement): string[] {
  return [element.style.left, element.style.top, element.style.width, element.style.height];
}
