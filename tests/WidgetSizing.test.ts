import { describe, expect, it } from "vitest";
import type { ExperienceDesign } from "../src/experiences/types";
import { applyBuilderSizeContent, applyWidgetSizeEnvelope } from "../src/experiences/runtime/WidgetSizing";

const design = (height: NonNullable<ExperienceDesign["size"]>["height"]): ExperienceDesign => ({ width: "md", size: { width: { mode: "fixed", value: 720 }, height }, theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } });
function card(): { card: HTMLElement; content: HTMLElement; widget: HTMLElement } { const card = document.createElement("section"); const content = document.createElement("div"); const widget = document.createElement("section"); content.className = "builder-content"; widget.className = "movecues-widget"; widget.style.width = "320px"; widget.style.height = "220px"; content.appendChild(widget); card.appendChild(content); return { card, content, widget }; }

describe("runtime builder sizing envelope", () => {
  it.each([
    ["fixed", { mode: "fixed", value: 480 } as const, "480px", "100%"],
    ["viewport", { mode: "viewport" } as const, "calc(100vh - 24px)", "100%"],
    ["auto", { mode: "auto" } as const, "auto", "auto"],
  ])("matches the preview semantics for %s height", (_name, height, envelopeHeight, innerHeight) => {
    const fixture = card(); const value = design(height); applyWidgetSizeEnvelope(fixture.card, "survey", value); applyBuilderSizeContent(fixture.card, "survey", value);
    expect(fixture.card.style.width).toBe("720px"); expect(fixture.card.style.height).toBe(envelopeHeight);
    expect(fixture.content.style.width).toBe("100%"); expect(fixture.content.style.height).toBe(innerHeight);
    expect(fixture.widget.style.getPropertyValue("width")).toBe("100%"); expect(fixture.widget.style.getPropertyPriority("width")).toBe("important");
    expect(fixture.widget.style.getPropertyValue("height")).toBe(innerHeight); expect(fixture.widget.style.getPropertyPriority("height")).toBe("important");
  });
});
