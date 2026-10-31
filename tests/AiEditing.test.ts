import { describe, expect, it } from "vitest";
import { applyEditorAiProposal, applyGuideAiProposal, editorAiContext, guideAiContext } from "../src/experiences/editor/AiEditing";
import { applyOnsiteDocument, createBlock, createOnsiteDocument, emptyCell, listBlocks, onsiteDocumentFromBuilder } from "../src/experiences/onsite/OnsiteDocument";
import type { ExperienceTarget, ExperienceTargeting, GuideStep, RuntimeGuideDefinition, WidgetBuilderState } from "../src/experiences/types";

function guideStep(id: string, pattern: "modal" | "anchored_card" = "modal"): GuideStep {
  const builder: WidgetBuilderState = { version: 1, projectData: {}, html: "", css: "" };
  const compiled = applyOnsiteDocument(builder, createOnsiteDocument(true), pattern);
  return { id, label: id, pattern, content: compiled.content, builder, advance: { type: "button" }, behavior: pattern === "modal" ? { dismissible: true } : { dismissible: true, placement: "auto", alignment: "center", offset: 8 } };
}
function guide(): RuntimeGuideDefinition & { targeting: ExperienceTargeting } {
  return {
    steps: [guideStep("step_one"), guideStep("step_two", "anchored_card")],
    design: { width: "sm", theme: { background: "#ffffff", foreground: "#111827", primary: "#2563eb", borderRadius: "md" } },
    targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 },
  };
}

describe("editor AI operations", () => {
  it("applies a multi-operation proposal atomically without mutating the source", () => {
    const source = createOnsiteDocument(); const blocks = listBlocks(source.root); const heading = blocks[0]; const button = blocks[2];
    const result = applyEditorAiProposal(source, { summary: "Improve CTA", operations: [
      { type: "update_text", blockId: heading.id, text: "Try <Movcues> today" },
      { type: "update_block", blockId: button.id, patch: { label: "Start now", radius: 12 } },
    ] });
    expect(listBlocks(source.root)[0]).not.toMatchObject({ html: "Try &lt;Movcues&gt; today" });
    expect(listBlocks(result.root)[0]).toMatchObject({ html: "Try &lt;Movcues&gt; today" });
    expect(listBlocks(result.root)[2]).toMatchObject({ label: "Start now", radius: 12 });
  });

  it("applies a source-proposed modal width to the outer Guide step envelope", () => {
    const source = guide();
    const owner = source.steps[0];
    owner.pattern = "modal";
    const actionBindings = (owner.builder!.projectData.movcues as { actionBindings: Record<string, { type: "dismiss" | "next_step" | "previous_step" }> }).actionBindings;
    const result = applyGuideAiProposal(source, { summary: "Widen modal", operations: [{ type: "replace_markup", stepId: owner.id, widthPx: 640, html: owner.builder!.html.replace("<section ", '<section data-movcues-node-id="source_root" '), css: owner.builder!.css, actionBindings }] });
    expect(result.guide.steps[0].size).toEqual({ width: { mode: "fixed", value: 640 }, height: { mode: "auto" } });
    expect(source.steps[0].size).toBeUndefined();
  });

  it("defaults AI-created modal steps above checklists and anchored steps to automatic layering", () => {
    const source = guide();
    const modal = applyGuideAiProposal(source, { summary: "Add modal", operations: [{ type: "add_guide_step", afterStepId: "step_two", pattern: "modal", heading: "Modal", body: "Top" }] }).guide.steps[2];
    const anchored = applyGuideAiProposal(source, { summary: "Add anchored", operations: [{ type: "add_guide_step", afterStepId: "step_two", pattern: "anchored_card", heading: "Anchor", body: "Automatic" }] }).guide.steps[2];
    expect(modal.behavior.layer).toEqual({ mode: "always_on_top" });
    expect(anchored.behavior.layer).toEqual({ mode: "auto" });
  });

  it("rejects the whole proposal when any operation is invalid", () => {
    const source = createOnsiteDocument(); const before = JSON.stringify(source);
    expect(() => applyEditorAiProposal(source, { summary: "Unsafe", operations: [
      { type: "update_text", blockId: listBlocks(source.root)[0].id, text: "Safe" },
      { type: "remove_cell", cellId: source.root.id },
    ] })).toThrow(/cannot be removed/);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("builds a bounded authored-data context with stable selection IDs", () => {
    const document = createOnsiteDocument(); const block = listBlocks(document.root)[0]; const cell = document.root.children![0];
    const context = editorAiContext({ experience: { id: "exp_1", name: "Welcome", widgetType: "modal", builderMode: "onsite" }, selection: { kind: "block", label: "Heading", cellId: cell.id, blockId: block.id, blockType: block.type }, document });
    expect(context.selection).toMatchObject({ blockId: block.id, cellId: cell.id });
    expect(JSON.stringify(context)).not.toMatch(/accessToken|cookie|localStorage/);
  });

  it("shares all Guide summaries but only the selected step document and never selectors", () => {
    const source = guide(); if (!("steps" in source)) throw new Error("fixture");
    source.steps[1].target = { primarySelector: "#secret-target", fallbackSelectors: ["[data-secret]"], reliability: "reliable", label: "Billing", targetContext: { pagePath: "/settings" } };
    source.behavior = { layer: { mode: "relative", relation: "above", target: { primarySelector: "#secret-layer", fallbackSelectors: [], reliability: "moderate", label: "Dialog" } } };
    const document = onsiteDocumentFromBuilder(source.steps[0].builder)!; const block = listBlocks(document.root)[0]; const cell = document.root.children![0];
    const context = guideAiContext({ experience: { id: "guide_1", name: "Onboarding", builderMode: "onsite" }, revision: 4, guide: source, currentStepId: "step_one", selection: { kind: "block", label: "Heading", cellId: cell.id, blockId: block.id, blockType: block.type } });
    expect(context.guide.steps.map(step => step.id)).toEqual(["step_one", "step_two"]);
    expect(context.currentDocument?.id).toBe(document.id);
    expect(JSON.stringify(context)).not.toMatch(/#secret-target|#secret-layer|data-secret|primarySelector|fallbackSelectors/);
    expect(context.guide.steps[1].positionTarget).toMatchObject({ configured: true, label: "Billing", pagePath: "/settings" });
  });

  it("keeps inline images in source HTML without duplicating them in the structured AI context", () => {
    const source = guide(); if (!("steps" in source)) throw new Error("fixture");
    const selected = source.steps[0], document = onsiteDocumentFromBuilder(selected.builder)!;
    const image = createBlock("image"); if (image.type !== "image") throw new Error("image fixture");
    document.root.children!.unshift(emptyCell(image));
    const inlineImage = `data:image/png;base64,${btoa(`\x89PNG\r\n\x1a\n${"A".repeat(44_900)}`)}`;
    image.src = inlineImage;
    applyOnsiteDocument(selected.builder!, document, "modal");
    const context = guideAiContext({ experience: { id: "guide_1", name: "Onboarding", builderMode: "onsite" }, revision: 4, guide: source, currentStepId: selected.id, selection: { kind: "cell", label: "Widget", cellId: document.root.id } });
    expect(context.source?.html).toContain(inlineImage);
    expect(JSON.stringify(context.currentDocument)).not.toContain(inlineImage);
    expect(JSON.stringify(context.currentDocument)).toContain("inline image data omitted from structured context");
    expect(JSON.stringify(context).length).toBeLessThan(120_000);
  });

  it("applies structural, within-step, advance and targeting operations as one Guide transaction", () => {
    const source = guide(); if (!("steps" in source)) throw new Error("fixture");
    const firstDocument = onsiteDocumentFromBuilder(source.steps[0].builder)!; const heading = listBlocks(firstDocument.root)[0];
    const result = applyGuideAiProposal(source, { summary: "Improve the flow", operations: [
      { type: "update_text", stepId: "step_one", blockId: heading.id, text: "Welcome <team>" },
      { type: "add_guide_step", afterStepId: "step_one", pattern: "modal", label: "New value", heading: "See value", body: "One focused benefit." },
      { type: "move_guide_step", stepId: "step_two", beforeStepId: "step_one" },
      { type: "update_guide_advance", stepId: "step_two", advance: { type: "route", pageRules: [{ kind: "include", operator: "starts_with", value: "/settings" }] } },
      { type: "update_guide_targeting", patch: { pageRules: [{ kind: "include", operator: "contains", value: "/app" }], priority: 7 } },
    ] });
    expect(source.steps.map(step => step.id)).toEqual(["step_one", "step_two"]);
    expect(result.order[0]).toBe("step_two"); expect(result.guide.steps).toHaveLength(3);
    expect(result.guide.targeting.pageRules[0]).toMatchObject({ kind: "include", value: "/app" });
    expect(result.guide.targeting.pageRules[0].id).toMatch(/^cell_/);
    expect(listBlocks(onsiteDocumentFromBuilder(result.guide.steps.find(step => step.id === "step_one")!.builder)!.root)[0]).toMatchObject({ html: "Welcome &lt;team&gt;" });
  });

  it("requires browser-selected Guide targets and rolls the whole proposal back on failure", () => {
    const source = guide(); if (!("steps" in source)) throw new Error("fixture");
    const target: ExperienceTarget = { primarySelector: "[data-tour=billing]", fallbackSelectors: [], reliability: "reliable", label: "Billing" };
    const proposal = { summary: "Anchor step", operations: [{ type: "request_guide_target" as const, stepId: "step_two", targetKind: "position" as const }] };
    expect(() => applyGuideAiProposal(source, proposal)).toThrow(/Select a positioning target/);
    expect(applyGuideAiProposal(source, proposal, new Map([[0, target]])).guide.steps[1].target).toEqual(target);
    const before = JSON.stringify(source);
    expect(() => applyGuideAiProposal(source, { summary: "Invalid", operations: [{ type: "remove_guide_step", stepId: "step_one" }, { type: "remove_guide_step", stepId: "step_two" }] })).toThrow(/final Guide step/);
    expect(JSON.stringify(source)).toBe(before);
  });
});
