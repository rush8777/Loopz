import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnchoredCardRenderer } from "../src/experiences/runtime/AnchoredCardRenderer";
import type { ExperienceBehavior, ExperienceContent, ExperienceDesign } from "../src/experiences/types";

const content: ExperienceContent = { heading: "Guide", body: "Anchored to the target" };
const design: ExperienceDesign = { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } };
const behavior: ExperienceBehavior = { dismissible: true, placement: "bottom" };

describe("AnchoredCardRenderer target visibility", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("card")) return rect(0, 0, 200, 100);
      return rect(0, 0, 0, 0);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("shows and positions an anchored card when its target is visible", () => {
    const { card, renderer } = renderAt(rect(100, 120, 50, 20));

    expect(card.style.visibility).toBe("");
    expect(card.style.pointerEvents).toBe("");
    expect(card.style.left).toBe("25px");
    expect(card.style.top).toBe("148px");
    renderer.destroy();
  });

  it.each(["above", "below", "left", "right"] as const)("hides an anchored card when its target is completely %s the viewport", (position) => {
    const positions = {
      above: rect(100, -40, 50, 20),
      below: rect(100, 800, 50, 20),
      left: rect(-50, 100, 20, 20),
      right: rect(1000, 100, 20, 20),
    };
    const { card, renderer } = renderAt(positions[position]);

    expect(card.style.visibility).toBe("hidden");
    expect(card.style.pointerEvents).toBe("none");
    expect(card.style.left).toBe("");
    expect(card.style.top).toBe("");
    renderer.destroy();
  });

  it("shows and repositions the same card when its target returns to the viewport", () => {
    let targetRect = rect(100, -40, 50, 20);
    const { card, renderer } = renderAt(() => targetRect);

    expect(card.style.visibility).toBe("hidden");
    targetRect = rect(300, 250, 50, 20);
    window.dispatchEvent(new Event("scroll"));

    expect(card.style.visibility).toBe("");
    expect(card.style.pointerEvents).toBe("");
    expect(card.style.left).toBe("225px");
    expect(card.style.top).toBe("278px");
    renderer.destroy();
  });

  it("hides an anchored card when its target disconnects instead of pinning it to the viewport", () => {
    const { target, card, renderer } = renderAt(rect(100, 120, 50, 20));

    target.remove();
    window.dispatchEvent(new Event("resize"));

    expect(card.style.visibility).toBe("hidden");
    expect(card.style.pointerEvents).toBe("none");
    expect(card.style.left).toBe("25px");
    expect(card.style.top).toBe("148px");
    renderer.destroy();
  });

  it("hides an anchored Guide card when a navigation layer covers its target", () => {
    const navigation = document.createElement("nav");
    document.body.appendChild(navigation);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(navigation);

    const { card, renderer } = renderAt(rect(100, 120, 50, 20));

    expect(card.style.visibility).toBe("hidden");
    expect(card.style.pointerEvents).toBe("none");
    renderer.destroy();
  });
});

function renderAt(targetBounds: DOMRect | (() => DOMRect)): { target: HTMLElement; card: HTMLElement; renderer: AnchoredCardRenderer } {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  const target = document.createElement("button");
  target.getBoundingClientRect = typeof targetBounds === "function" ? targetBounds : () => targetBounds;
  document.body.append(target, host);
  const renderer = new AnchoredCardRenderer();
  const card = renderer.render(root, target, content, design, behavior, { onDismiss: vi.fn(), onPrimary: vi.fn(), onSecondary: vi.fn() });
  return { target, card, renderer };
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}
