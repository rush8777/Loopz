import { describe, expect, it } from "vitest";
import { applyGuideAiProposal } from "../src/experiences/editor/AiEditing";
import { applySourceMarkup, isSourceAuthored, sourceContext, validateSourceMarkup } from "../src/experiences/editor/SourceAuthoring";
import { applyOnsiteDocument, createOnsiteDocument } from "../src/experiences/onsite/OnsiteDocument";
import type { ExperienceTargeting, RuntimeGuideDefinition, WidgetBuilderState } from "../src/experiences/types";

const html = `<section class="movcues-widget movcues-widget--modal" data-movcues-widget-type="modal" data-movcues-document-version="2"><div class="card"><h2 data-movcues-content="heading">A better welcome</h2><p data-movcues-content="body">One clear next step.</p><button type="button" data-movcues-action-id="continue_1">Continue</button></div></section>`;
const css = `.movcues-widget{padding:32px}.movcues-widget .card{display:grid;gap:16px}@media(max-width:480px){.movcues-widget .card{gap:10px}}`;

describe("SDK source authoring", () => {
  it("applies full source without deleting the structured recovery document", () => {
    const builder: WidgetBuilderState = { version: 1, projectData: {}, html: "", css: "" }, content = applyOnsiteDocument(builder, createOnsiteDocument(true), "modal").content;
    const recovery = (builder.projectData.movcues as any).onsiteDocument;
    applySourceMarkup(builder, content, { type: "replace_markup", html, css, actionBindings: { continue_1: { type: "next_step" } } }, { widgetType: "modal", guide: true });
    expect(isSourceAuthored(builder)).toBe(true); expect((builder.projectData.movcues as any).onsiteDocument).toEqual(recovery);
    expect(content).toMatchObject({ heading: "A better welcome", body: "One clear next step." });
    expect(sourceContext(builder, true).actionBindings).toEqual({ continue_1: { type: "next_step" } });
  });

  it("rejects unscoped CSS and broken action bindings before preview", () => {
    expect(validateSourceMarkup({ type: "replace_markup", html, css: "button{color:red}", actionBindings: {} }, { widgetType: "modal", guide: true }).length).toBeGreaterThan(0);
  });

  it("applies a Guide source redesign atomically to only the selected step", () => {
    const builder: WidgetBuilderState = { version: 1, projectData: {}, html: "", css: "" }, compiled = applyOnsiteDocument(builder, createOnsiteDocument(true), "modal");
    const guide: RuntimeGuideDefinition & { targeting: ExperienceTargeting } = { steps: [{ id: "step_1", pattern: "modal", content: compiled.content, builder, behavior: { dismissible: true }, advance: { type: "button" } }], design: { width: "sm", theme: { background: "#fff", foreground: "#111827", primary: "#2563eb", borderRadius: "md" } }, targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 } };
    const result = applyGuideAiProposal(guide, { summary: "Redesign", operations: [{ type: "replace_markup", stepId: "step_1", html, css, actionBindings: { continue_1: { type: "next_step" } } }] });
    expect(isSourceAuthored(result.guide.steps[0].builder)).toBe(true); expect(isSourceAuthored(guide.steps[0].builder)).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/Source mode/);
  });
});
