import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceRenderer } from "../src/experiences/runtime/ExperienceRenderer";
import type { DeliveredExperience, ExperienceDesign } from "../src/experiences/types";

const design: ExperienceDesign = { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } };
const callbacks = () => ({ onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() });

describe("Guide target auto-scroll", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("scrolls a resumed cross-page anchored step below the viewport into view once", () => {
    const target = targetAt("cross-page", rect(100, 1400, 120, 40));
    const renderer = new ExperienceRenderer();
    renderer.render(guide("#cross-page"), callbacks(), "anchored");

    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center", inline: "nearest" });
    renderer.destroy();
  });

  it("does not scroll a target already comfortably inside the viewport", () => {
    const target = targetAt("visible", rect(100, 160, 120, 40));
    const renderer = new ExperienceRenderer();
    renderer.render(guide("#visible"), callbacks(), "anchored");

    expect(target.scrollIntoView).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it("renders anchored Guide pointer chrome with the step settings", () => {
    targetAt("pointer", rect(100, 160, 120, 40));
    const experience = guide("#pointer");
    if ("steps" in experience.definition) experience.definition.steps[0].behavior.pointer = { enabled: true, size: 18 };
    const renderer = new ExperienceRenderer();
    renderer.render(experience, callbacks(), "anchored");
    const host = document.querySelector<HTMLElement>("[data-movecues-experience]")!;
    const pointer = host.shadowRoot?.querySelector<HTMLElement>(".movecues-anchor-pointer");

    expect(pointer?.dataset.placement).toBe("bottom");
    expect(pointer?.style.getPropertyValue("--movecues-pointer-size")).toBe("18px");
    renderer.destroy();
  });

  it("scrolls only after a delayed SPA target resolves", async () => {
    const renderer = new ExperienceRenderer();
    renderer.render(guide("#delayed"), callbacks(), "anchored");
    expect(document.querySelector("[data-movecues-experience]")).toBeNull();

    const target = targetAt("delayed", rect(100, 1400, 120, 40));
    await vi.waitFor(() => expect(target.scrollIntoView).toHaveBeenCalledTimes(1));
    expect(document.querySelector("[data-movecues-experience]")).not.toBeNull();
    renderer.destroy();
  });

  it("uses instant scrolling when reduced motion is preferred", () => {
    vi.mocked(matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    const target = targetAt("reduced", rect(100, 1400, 120, 40));
    const renderer = new ExperienceRenderer();
    renderer.render(guide("#reduced"), callbacks(), "anchored");

    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center", inline: "nearest" });
    renderer.destroy();
  });

  it("does not force the target back into view after the initial mount", () => {
    const target = targetAt("once", rect(100, 1400, 120, 40));
    const renderer = new ExperienceRenderer();
    renderer.render(guide("#once"), callbacks(), "anchored");
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));

    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });

  it("does not scroll for a modal guide step", () => {
    const target = targetAt("modal-target", rect(100, 1400, 120, 40));
    const experience = guide("#modal-target");
    if ("steps" in experience.definition) experience.definition.steps[0].pattern = "modal";
    const renderer = new ExperienceRenderer();
    renderer.render(experience, callbacks(), "anchored");

    expect(target.scrollIntoView).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it("does not auto-scroll standalone anchored widgets", () => {
    const target = targetAt("widget-target", rect(100, 1400, 120, 40));
    const widget: DeliveredExperience = { id: "widget", versionId: "v1", kind: "widget", widgetType: "anchored_card", priority: 1, definition: { content: { heading: "Widget", body: "Details" }, design, behavior: { dismissible: true }, target: { primarySelector: "#widget-target", fallbackSelectors: [], reliability: "reliable" } } };
    const renderer = new ExperienceRenderer();
    renderer.render(widget, callbacks());

    expect(target.scrollIntoView).not.toHaveBeenCalled();
    renderer.destroy();
  });

  it("does not scroll a target that appears after the pending render is destroyed", async () => {
    const renderer = new ExperienceRenderer();
    renderer.render(guide("#cancelled"), callbacks(), "anchored");
    renderer.destroy();
    const target = targetAt("cancelled", rect(100, 1400, 120, 40));
    await Promise.resolve();

    expect(target.scrollIntoView).not.toHaveBeenCalled();
    expect(document.querySelector("[data-movecues-experience]")).toBeNull();
  });
});

function guide(selector: string): DeliveredExperience {
  return { id: "guide", versionId: "v1", kind: "guide", widgetType: null, priority: 1, definition: { design, steps: [{ id: "anchored", pattern: "anchored_card", content: { heading: "Step", body: "Details" }, target: { primarySelector: selector, fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true, placement: "bottom" } }] } };
}

function targetAt(id: string, bounds: DOMRect): HTMLElement & { scrollIntoView: ReturnType<typeof vi.fn> } {
  const target = document.createElement("button") as HTMLElement & { scrollIntoView: ReturnType<typeof vi.fn> };
  target.id = id; target.getBoundingClientRect = () => bounds; target.scrollIntoView = vi.fn(); document.body.appendChild(target);
  return target;
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}
