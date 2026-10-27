import { describe, expect, it } from "vitest";
import { applySurveyAiProposal, surveyAiContext, type SurveyAiProposal } from "../src/experiences/editor/SurveyAiEditing";
import { applyOnsiteDocument, createOnsiteSurveyDocument, listBlocks, onsiteDocumentFromBuilder, validateOnsiteSurveyDocument } from "../src/experiences/onsite/OnsiteDocument";
import type { EditorDefinition, RuntimeWidgetDefinition, SurveyConfig, SurveyQuestion, SurveyStep } from "../src/experiences/types";

function step(id: string, questions: SurveyQuestion[], heading = id): SurveyStep {
  const builder = { version: 1 as const, projectData: {}, html: "", css: "" }, content = { heading, body: "Body" };
  return { id, questions, content: applyOnsiteDocument(builder, createOnsiteSurveyDocument(questions, content), "survey", { questions, submitLabel: "Send" }).content, builder };
}

function definition(): RuntimeWidgetDefinition & { targeting: EditorDefinition["targeting"] } {
  const survey: SurveyConfig = { showProgress: true, allowBack: true, submitLabel: "Send", steps: [
    step("step_one", [{ id: "question_choice", type: "single_choice", label: "Plan?", options: [{ id: "option_free", label: "Free" }, { id: "option_pro", label: "Pro" }] }], "First"),
    step("step_two", [{ id: "question_text", type: "short_text", label: "Why?", maxLength: 200 }], "Second"),
  ] };
  survey.steps[0].branching = { rules: [{ questionId: "question_choice", operator: "equals", value: "option_pro", nextStepId: "step_two" }], defaultNextStepId: "submit" };
  return { content: { heading: "Survey", body: "" }, design: { width: "sm", theme: { background: "#ffffff", foreground: "#111827", primary: "#2563eb", borderRadius: "md" } }, behavior: { dismissible: true }, survey, targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 } };
}

describe("Survey AI editing", () => {
  it("adds all six question types and keeps canonical and visual references synchronized", () => {
    const source = definition(), inputs: SurveyAiProposal["operations"] = [
      { type: "add_survey_question", stepId: "step_two", question: { type: "single_choice", label: "Single", options: [{ label: "A" }] } },
      { type: "add_survey_question", stepId: "step_two", question: { type: "multiple_choice", label: "Multiple", options: [{ label: "A" }, { label: "B" }] } },
      { type: "add_survey_question", stepId: "step_two", question: { type: "short_text", label: "Short" } },
      { type: "add_survey_question", stepId: "step_two", question: { type: "long_text", label: "Long" } },
      { type: "add_survey_question", stepId: "step_two", question: { type: "rating", label: "Rating", min: 1, max: 5 } },
      { type: "add_survey_question", stepId: "step_two", question: { type: "nps", label: "NPS" } },
    ];
    const result = applySurveyAiProposal(source, { summary: "Add questions", operations: inputs }); const owner = result.definition.survey!.steps[1], document = onsiteDocumentFromBuilder(owner.builder)!;
    expect(owner.questions.map(question => question.type)).toEqual(["short_text", "single_choice", "multiple_choice", "short_text", "long_text", "rating", "nps"]);
    expect(validateOnsiteSurveyDocument(document, { questions: owner.questions, submitLabel: "Send" })).toEqual([]);
    expect(listBlocks(document.root).filter(block => block.type === "question")).toHaveLength(owner.questions.length);
  });

  it("applies document, structural, branching and configuration changes as one transaction", () => {
    const source = definition(), document = onsiteDocumentFromBuilder(source.survey!.steps[0].builder)!, heading = listBlocks(document.root).find(block => block.type === "heading")!;
    const result = applySurveyAiProposal(source, { summary: "Improve survey", operations: [
      { type: "update_text", stepId: "step_one", blockId: heading.id, text: "Choose <carefully>" },
      { type: "update_survey_question_style", stepId: "step_one", questionId: "question_choice", patch: { fontSize: 17, color: "#1d4ed8", align: "left" } },
      { type: "update_survey_option", stepId: "step_one", questionId: "question_choice", optionId: "option_pro", label: "Professional" },
      { type: "update_survey_branching", stepId: "step_one", branching: { rules: [{ questionId: "question_choice", operator: "equals", value: "option_free", nextStepId: "step_two" }] } },
      { type: "update_survey_configuration", patch: { allowBack: false, submitLabel: "Finish" } },
    ] });
    expect(source.survey!.submitLabel).toBe("Send"); expect(result.definition.survey).toMatchObject({ allowBack: false, submitLabel: "Finish" });
    expect(listBlocks(onsiteDocumentFromBuilder(result.definition.survey!.steps[0].builder)!.root).find(block => block.type === "heading")).toMatchObject({ html: "Choose &lt;carefully&gt;" });
    expect(listBlocks(onsiteDocumentFromBuilder(result.definition.survey!.steps[0].builder)!.root).find(block => block.type === "question")).toMatchObject({ fontSize: 17, color: "#1d4ed8", align: "left" });
    expect(result.warnings.join(" ")).toMatch(/branching changed|configuration changed/i);
  });

  it("redesigns a Survey step while preserving canonical questions and protected controls", () => {
    const source = definition(), result = applySurveyAiProposal(source, { summary: "Redesign survey", operations: [{ type: "redesign_layout", stepId: "step_one", layout: { type: "group", gap: 16, padding: { top: 28, right: 24, bottom: 24, left: 24 }, style: { background: "#ffffff", borderColor: "#bfdbfe", borderWidth: 1, borderRadius: 20 }, children: [{ type: "icon", icon: "sparkles", size: 30, color: "#2563eb" }, { type: "heading", text: "Help us personalize your experience", fontSize: 26 }, { type: "text", text: "This takes less than a minute.", color: "#64748b" }, { type: "survey_questions", fontSize: 16, color: "#0f172a", gap: 14 }, { type: "survey_controls" }] } }] });
    const owner = result.definition.survey!.steps[0], document = onsiteDocumentFromBuilder(owner.builder)!; expect(owner.questions.map(question => question.id)).toEqual(["question_choice"]); expect(listBlocks(document.root).map(block => block.type)).toEqual(["icon", "heading", "text", "question", "survey_controls"]); expect(validateOnsiteSurveyDocument(document, { questions: owner.questions, submitLabel: "Send" })).toEqual([]);
    expect(() => applySurveyAiProposal(source, { summary: "Invalid", operations: [{ type: "redesign_layout", stepId: "step_one", layout: { type: "group", children: [{ type: "heading", text: "Missing controls" }, { type: "survey_questions" }] } }] })).toThrow(/navigation region/);
  });

  it("requires explicit approval before removing branch dependencies and remains atomic", () => {
    const source = definition(), before = JSON.stringify(source);
    expect(() => applySurveyAiProposal(source, { summary: "Remove", operations: [{ type: "remove_survey_option", stepId: "step_one", questionId: "question_choice", optionId: "option_pro" }] })).toThrow(/Explicitly allow/);
    expect(JSON.stringify(source)).toBe(before);
    const result = applySurveyAiProposal(source, { summary: "Remove", operations: [{ type: "remove_survey_option", stepId: "step_one", questionId: "question_choice", optionId: "option_pro", removeBranchRules: true }] });
    expect(result.definition.survey!.steps[0].branching!.rules).toEqual([]); expect(result.warnings[0]).toMatch(/branch rules/i);
  });

  it("rejects invalid forward navigation without mutating the source", () => {
    const source = definition(), before = JSON.stringify(source);
    expect(() => applySurveyAiProposal(source, { summary: "Loop", operations: [{ type: "update_survey_branching", stepId: "step_two", branching: { rules: [{ questionId: "question_text", operator: "answered", nextStepId: "step_one" }] } }] })).toThrow(/later step|forward/i);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("builds authored-only context for every step and only the current schema-v3 document", () => {
    const source = definition(), document = onsiteDocumentFromBuilder(source.survey!.steps[0].builder)!, heading = listBlocks(document.root).find(block => block.type === "heading")!, cell = document.root.children![0];
    const context = surveyAiContext({ experience: { id: "survey_1", name: "Research", builderMode: "onsite" }, revision: 9, definition: source, currentStepId: "step_one", selection: { kind: "block", label: "Heading", cellId: cell.id, blockId: heading.id, blockType: heading.type } });
    expect(context).toMatchObject({ revision: 9, currentStepId: "step_one", configuration: { submitLabel: "Send" } }); expect((context.steps as unknown[])).toHaveLength(2); expect((context.currentDocument as { schemaVersion: number }).schemaVersion).toBe(3);
    expect(JSON.stringify(context)).not.toMatch(/visitor|answerValues|cookie|localStorage|primarySelector|fallbackSelectors/);
  });
});
