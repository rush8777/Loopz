import { afterEach, describe, expect, it, vi } from "vitest";
import checklistFixture from "./fixtures/checklist-v4.json";
import { OnsiteCompositionEditor } from "../src/experiences/editor/OnsiteCompositionEditor";
import { applySourceMarkup, sourceContext } from "../src/experiences/editor/SourceAuthoring";
import { duplicateSurveyStep } from "../src/experiences/editor/SurveyEditing";
import { applyOnsiteDocument, createOnsiteSurveyDocument, type OnsiteDocument } from "../src/experiences/onsite/OnsiteDocument";
import type { EditorChecklistDefinition, ExperienceContent, SurveyConfig, SurveyStep, SurveyQuestion, WidgetBuilderState } from "../src/experiences/types";

describe("source protected components", () => {
  let editor: OnsiteCompositionEditor | undefined;
  afterEach(() => { editor?.destroy(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
  const validation = vi.fn();
  function surface(builder: WidgetBuilderState, content: ExperienceContent, survey?: { config: SurveyConfig; step: SurveyStep }, checklist?: EditorChecklistDefinition) {
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 1; }); vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const host = document.createElement("div"); document.body.append(host); const root = host.attachShadow({ mode: "open" }); root.innerHTML = '<style data-movcues-builder-style></style><div data-movcues-builder-surface></div>';
    editor = new OnsiteCompositionEditor(root, builder, content, survey ? "survey" : "checklist", false, { onChange() {}, onSelectionChange() {}, onValidation: validation }, survey, checklist); editor.start(); return root;
  }
  const builder = (): WidgetBuilderState => ({ version: 1, html: "", css: "", projectData: {} });
  function makeSource(value: WidgetBuilderState, content: ExperienceContent, options: Parameters<typeof applySourceMarkup>[3]) {
    applySourceMarkup(value, content, { type: "replace_markup", html: value.html.replace("<section ", '<section data-movcues-node-id="source_root" '), css: value.css, actionBindings: sourceContext(value, false).actionBindings as {} }, options);
  }
  it("styles a Survey question while preventing destructive source operations, including after reopen", () => {
    const value = builder(), questions = [{ id: "question_one", type: "short_text" as const, label: "Your feedback", maxLength: 200 }];
    const content = applyOnsiteDocument(value, createOnsiteSurveyDocument(questions), "survey", { questions, submitLabel: "Send" }).content;
    const step: SurveyStep = { id: "step_one", content, builder: value, questions }, config: SurveyConfig = { steps: [step], showProgress: true, allowBack: true, submitLabel: "Send" };
    makeSource(value, content, { widgetType: "survey", guide: false, survey: { questions } }); const original = structuredClone(value);
    const root = surface(value, content, { step, config }); root.querySelector<HTMLElement>('[data-movcues-question-id="question_one"]')!.click();
    editor!.updateBlock({ fontSize: 18 }); expect(editor!.getValidation()).toEqual([]); const styled = value.html;
    expect(editor!.remove()).toBe(false); expect(editor!.duplicate()).toBe(false); expect(value.html).toBe(styled);
    expect(value.css).not.toBe(original.css); expect(root.querySelector("input")?.getAttribute("maxlength")).toBe("200");
    expect(step.questions).toEqual(questions); editor!.undo(); expect(value.css).toBe(original.css); editor!.redo(); expect(editor!.getValidation()).toEqual([]);
    const duplicate = duplicateSurveyStep(step, "Send"); expect((duplicate.builder!.projectData.movcues as Record<string, unknown>).authoringSurface).toBe("source");
    expect(duplicate.builder!.css).toBe(value.css); expect(duplicate.builder!.html).toContain(duplicate.questions[0].id); expect(duplicate.questions[0].id).not.toBe("question_one");
  });
  const questions: SurveyQuestion[] = [
    { id: "question_one", type: "single_choice", label: "Choose", options: [{ id: "option_one", label: "First" }, { id: "option_two", label: "Second" }] },
    { id: "question_one", type: "multiple_choice", label: "Choose", options: [{ id: "option_one", label: "First" }] },
    { id: "question_one", type: "short_text", label: "Feedback" }, { id: "question_one", type: "long_text", label: "Feedback" },
    { id: "question_one", type: "rating", label: "Rate", min: 1, max: 5 }, { id: "question_one", type: "nps", label: "Recommend" },
  ];
  it.each(questions)("retains canonical source controls for $type", question => {
    const value = builder(), content = applyOnsiteDocument(value, createOnsiteSurveyDocument([question]), "survey", { questions: [question], submitLabel: "Send" }).content;
    const step: SurveyStep = { id: "step_one", content, builder: value, questions: [question] }, config: SurveyConfig = { steps: [step], showProgress: true, allowBack: true, submitLabel: "Send" };
    makeSource(value, content, { widgetType: "survey", guide: false, survey: { questions: [question] } });
    const root = surface(value, content, { step, config }); root.querySelector<HTMLElement>('[data-movcues-question-id]')!.click();
    editor!.updateBlock({ color: "#aabbcc" }); expect(editor!.getValidation()).toEqual([]); expect(value.css).toContain("#aabbcc");
    expect(root.querySelectorAll('[data-movcues-survey-action="submit"]')).toHaveLength(1);
    expect(editor!.updateQuestion({ ...question, label: "Updated question" })).toBe(true); expect(value.html).toContain("Updated question"); expect(editor!.getValidation()).toEqual([]);
    editor!.undo(); expect(step.questions[0].label).toBe(question.label); expect(editor!.getValidation()).toEqual([]); editor!.redo(); expect(editor!.getValidation()).toEqual([]);
  });
  it("preserves Checklist tasks, actions and views through style and canonical task text edits", () => {
    const value = builder(), f = structuredClone(checklistFixture);
    const checklist = { ...f.definition, builder: value, targeting: { pageRules: [], audience: { type: "all" }, priority: 0 } } as EditorChecklistDefinition;
    const content = applyOnsiteDocument(value, f.document as OnsiteDocument, "checklist", undefined, checklist).content;
    makeSource(value, content, { widgetType: "checklist", guide: false, checklist });
    const root = surface(value, content, undefined, checklist), initialItems = structuredClone(checklist.items), css = value.css;
    root.querySelector<HTMLElement>('[data-movcues-checklist-item-id="item_one"]')!.click(); editor!.updateBlock({ fontSize: 18 });
    expect(editor!.remove()).toBe(false); expect(editor!.duplicate()).toBe(false); expect(editor!.getValidation()).toEqual([]);
    expect(editor!.updateChecklist(next => { next.items[0].title = "Invite your team"; next.items[0].action = { type: "navigate", url: "/team" }; })).toBe(true);
    expect(value.html).toContain("Invite your team"); expect(checklist.items[0].action).toEqual({ type: "navigate", url: "/team" });
    expect(checklist.items.map(item => item.id)).toEqual(initialItems.map(item => item.id)); expect(root.querySelectorAll("[data-movcues-checklist-view]")).toHaveLength(3); expect(value.css).not.toBe(css);
    editor!.undo(); expect(checklist.items[0]).toEqual(initialItems[0]); expect(value.html).not.toContain("Invite your team");
  });
});
