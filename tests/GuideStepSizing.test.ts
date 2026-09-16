import { afterEach, describe, expect, it, vi } from "vitest";
import { ExperienceRenderer } from "../src/experiences/runtime/ExperienceRenderer";
import type { DeliveredExperience } from "../src/experiences/types";

describe("Guide step sizing", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

  it("uses the anchored step size instead of the Guide's modal-sized legacy envelope", () => {
    const target = document.createElement("button"); target.id = "target";
    target.getBoundingClientRect = () => rect(700, 300, 120, 40);
    document.body.appendChild(target);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    const experience: DeliveredExperience = {
      id: "guide", versionId: "v1", kind: "guide", widgetType: null, priority: 1,
      definition: {
        design: { width: "lg", size: { width: { mode: "fixed", value: 900 }, height: { mode: "auto" } }, theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } },
        steps: [{ id: "anchored", pattern: "anchored_card", size: { width: { mode: "fixed", value: 280 }, height: { mode: "auto" } }, content: { heading: "Feature", body: "Details" }, target: { primarySelector: "#target", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true, placement: "left", offset: 8 } }],
      },
    };
    const renderer = new ExperienceRenderer();
    renderer.render(experience, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() });

    const card = document.querySelector("[data-movecues-experience]")!.shadowRoot!.querySelector<HTMLElement>(".card")!;
    expect(card.style.width).toBe("280px");
    renderer.destroy();
  });
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}
