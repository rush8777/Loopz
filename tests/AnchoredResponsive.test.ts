import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnchoredCardRenderer, buildCard } from "../src/experiences/runtime/AnchoredCardRenderer";
import type { ExperienceDesign } from "../src/experiences/types";

const design: ExperienceDesign = { width: "md", size: { width: { mode: "fixed", value: 320 }, height: { mode: "auto" } }, theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } };
const callbacks = { onDismiss: vi.fn(), onPrimary: vi.fn(), onSecondary: vi.fn() };

describe("anchored responsive placement", () => {
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    document.body.innerHTML = ""; frames = [];
    vi.stubGlobal("innerWidth", 390); vi.stubGlobal("innerHeight", 844);
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("keeps the card inside horizontal bounds and positions the pointer after clamping", () => {
    const target = document.createElement("button"); target.getBoundingClientRect = () => rect(370, 200, 20, 30); document.body.appendChild(target);
    const root = shadowRoot();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { return this.classList.contains("card") ? rect(0, 0, 366, 180) : rect(0, 0, 0, 0); });
    const renderer = new AnchoredCardRenderer(); const card = renderer.render(root, target, { heading: "Guide", body: "Details" }, design, { placement: "bottom", dismissible: true }, callbacks, undefined, "anchored_card");

    expect(card.style.left).toBe("16px");
    const pointer = card.querySelector<HTMLElement>(".movcues-anchor-pointer")!;
    expect(pointer.style.left).toBe("350px"); expect(pointer.dataset.placement).toBe("bottom");
    renderer.destroy();
  });

  it("remeasures and reconsiders automatic placement after viewport resize", () => {
    const target = document.createElement("button"); target.getBoundingClientRect = () => rect(140, 300, 80, 40); document.body.appendChild(target);
    const root = shadowRoot();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { return this.classList.contains("card") ? rect(0, 0, 300, 300) : rect(0, 0, 0, 0); });
    const renderer = new AnchoredCardRenderer(); const card = renderer.render(root, target, { heading: "Guide", body: "Details" }, design, { placement: "auto", dismissible: true }, callbacks, undefined, "anchored_card");
    expect(card.querySelector<HTMLElement>(".movcues-anchor-pointer")!.dataset.placement).toBe("bottom");

    vi.stubGlobal("innerHeight", 568); window.dispatchEvent(new Event("resize")); frames.splice(0).forEach(callback => callback(0));
    expect(card.querySelector<HTMLElement>(".movcues-anchor-pointer")!.dataset.placement).toBe("top"); expect(card.style.top).toBe("8px");
    renderer.destroy();
  });

  it("does not replace an authored desktop width with its temporary mobile-clamped width", () => {
    const root = shadowRoot();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("card") || this.classList.contains("movcues-widget")) return rect(0, 0, 366, 400);
      return rect(0, 0, 0, 0);
    });
    const modalDesign: ExperienceDesign = { ...design, size: { width: { mode: "fixed", value: 720 }, height: { mode: "auto" } } };
    const card = buildCard(root, { heading: "Modal", body: "Details" }, modalDesign, { dismissible: true }, callbacks, { version: 1, projectData: {}, html: '<section class="movcues-widget">Content</section>', css: ".movcues-widget{width:700px}" }, "modal");

    expect(card.style.width).toBe("720px"); expect(card.style.maxWidth).toBe("min(960px, var(--movcues-usable-viewport-width))");
  });
});

function shadowRoot(): ShadowRoot { const host = document.createElement("div"); document.body.appendChild(host); return host.attachShadow({ mode: "open" }); }
function rect(left: number, top: number, width: number, height: number): DOMRect { return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect; }
