import type { CompositionSelection } from "./OnsiteCompositionEditor";
import { applyEditorAiProposal, type EditorAiOperation, type EditorAiProposal } from "./AiEditing";
import {
  applyOnsiteDocument, cloneOnsite, createOnsiteSurveyDocument, emptyCell, findCell, listBlocks,
  onsiteDocumentFromBuilder, onsiteId, parentCell, removeCell, sanitizeRichText, validateOnsiteDocument,
  validateOnsiteSurveyDocument, type OnsiteCell, type OnsiteDocument,
} from "../onsite/OnsiteDocument";
import { surveyBranchErrors } from "../survey/SurveyLogic";
import { surveyQuestionErrors } from "../survey/SurveyMarkup";
import type { ExperienceTargeting, RuntimeWidgetDefinition, SurveyBranching, SurveyConfig, SurveyQuestion, SurveyStep } from "../types";
import { duplicateSurveyStep } from "./SurveyEditing";
import { aiDocumentContext, applySourceMarkup, sourceContext, type ReplaceMarkupOperation } from "./SourceAuthoring";

export type SurveyQuestionInput =
  | { type: "single_choice" | "multiple_choice"; label: string; required?: boolean; options: Array<{ label: string }> }
  | { type: "short_text" | "long_text"; label: string; required?: boolean; placeholder?: string; maxLength?: number }
  | { type: "rating"; label: string; required?: boolean; min: number; max: number }
  | { type: "nps"; label: string; required?: boolean };

export type SurveyAiOperation =
  | { type: "add_survey_step"; afterStepId?: string; heading: string; body?: string; questions?: SurveyQuestionInput[] }
  | { type: "duplicate_survey_step"; stepId: string; afterStepId?: string }
  | { type: "remove_survey_step"; stepId: string; removeBranchRules?: boolean }
  | { type: "move_survey_step"; stepId: string; beforeStepId?: string }
  | { type: "update_survey_step"; stepId: string; patch: { heading?: string; body?: string } }
  | { type: "add_survey_question"; stepId: string; afterQuestionId?: string; question: SurveyQuestionInput }
  | { type: "duplicate_survey_question"; stepId: string; questionId: string; afterQuestionId?: string }
  | { type: "remove_survey_question"; stepId: string; questionId: string; removeBranchRules?: boolean }
  | { type: "move_survey_question"; stepId: string; questionId: string; beforeQuestionId?: string }
  | { type: "update_survey_question"; stepId: string; questionId: string; patch: { label?: string; required?: boolean; placeholder?: string; maxLength?: number; min?: number; max?: number } }
  | { type: "change_survey_question_type"; stepId: string; questionId: string; question: SurveyQuestionInput; removeInvalidBranchRules?: boolean }
  | { type: "add_survey_option"; stepId: string; questionId: string; afterOptionId?: string; label: string }
  | { type: "update_survey_option"; stepId: string; questionId: string; optionId: string; label: string }
  | { type: "remove_survey_option"; stepId: string; questionId: string; optionId: string; removeBranchRules?: boolean }
  | { type: "move_survey_option"; stepId: string; questionId: string; optionId: string; beforeOptionId?: string }
  | { type: "update_survey_branching"; stepId: string; branching: SurveyBranching | null }
  | { type: "remove_survey_branch_rule"; stepId: string; ruleIndex: number }
  | { type: "update_survey_configuration"; patch: Partial<Pick<SurveyConfig, "showProgress" | "allowBack" | "submitLabel">> };

export interface SurveyAiProposal extends Omit<EditorAiProposal, "operations"> { operations: Array<EditorAiOperation | SurveyAiOperation> }
export interface SurveyAiApplyResult { definition: RuntimeWidgetDefinition & { targeting: ExperienceTargeting }; affectedStepIds: string[]; order: string[]; warnings: string[] }

const text = (value: string, max: number) => sanitizeRichText(value.trim().slice(0, max).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!));
const isDocumentOperation = (operation: EditorAiOperation | SurveyAiOperation): operation is EditorAiOperation => ["update_text", "update_block", "update_cell", "update_button_action", "insert_block", "remove_cell", "duplicate_cell", "move_cell"].includes(operation.type);

function questionFromInput(input: SurveyQuestionInput, id = onsiteId("question")): SurveyQuestion {
  const base = { id, label: input.label.trim().slice(0, 500), required: input.required ?? false };
  if (input.type === "single_choice" || input.type === "multiple_choice") return { ...base, type: input.type, options: input.options.map(option => ({ id: onsiteId("option"), label: option.label.trim().slice(0, 200) })) };
  if (input.type === "short_text" || input.type === "long_text") return { ...base, type: input.type, placeholder: input.placeholder?.slice(0, 500) ?? "", maxLength: input.maxLength ?? (input.type === "short_text" ? 200 : 2000) };
  if (input.type === "rating") return { ...base, type: input.type, min: input.min, max: input.max };
  return { ...base, type: "nps" };
}

function documentFor(step: SurveyStep): OnsiteDocument {
  const document = onsiteDocumentFromBuilder(step.builder); if (!document || document.schemaVersion !== 3 || !step.builder) throw new Error(`Survey step ${step.id} has no editable schema-v3 document.`); return document;
}

function referenceCell(document: OnsiteDocument, questionId: string): OnsiteCell | null {
  let result: OnsiteCell | null = null;
  const walk = (cell: OnsiteCell) => { if (cell.block?.type === "question" && cell.block.questionId === questionId) result = cell; cell.children?.forEach(walk); };
  walk(document.root); return result;
}

function controlsCell(document: OnsiteDocument): OnsiteCell | null {
  let result: OnsiteCell | null = null;
  const walk = (cell: OnsiteCell) => { if (cell.block?.type === "survey_controls") result = cell; cell.children?.forEach(walk); };
  walk(document.root); return result;
}

function insertQuestionReference(document: OnsiteDocument, questionId: string, afterQuestionId?: string): void {
  const target = afterQuestionId ? referenceCell(document, afterQuestionId) : controlsCell(document); if (!target) throw new Error("Survey question insertion point no longer exists.");
  const parent = parentCell(document, target.id); if (!parent?.children) throw new Error("Survey question insertion point is invalid.");
  const index = parent.children.indexOf(target) + (afterQuestionId ? 1 : 0);
  parent.children.splice(index, 0, { ...emptyCell({ id: onsiteId("block"), type: "question", questionId, fontSize: 14 }), sizing: { mode: "hug" } });
}

function removeQuestionReference(document: OnsiteDocument, questionId: string): void {
  const cell = referenceCell(document, questionId); if (!cell || !removeCell(document, cell.id)) throw new Error("Survey question reference no longer exists.");
}

function moveQuestionReference(document: OnsiteDocument, questionId: string, beforeQuestionId?: string): void {
  const source = referenceCell(document, questionId), target = beforeQuestionId ? referenceCell(document, beforeQuestionId) : controlsCell(document);
  if (!source || !target || source === target) throw new Error("Survey question move target is invalid.");
  const from = parentCell(document, source.id), to = parentCell(document, target.id); if (!from?.children || !to?.children) throw new Error("Survey question move target is invalid.");
  from.children.splice(from.children.indexOf(source), 1); to.children.splice(to.children.indexOf(target), 0, source);
}

function setStepCopy(step: SurveyStep, patch: { heading?: string; body?: string }, submitLabel: string): void {
  const document = documentFor(step), blocks = listBlocks(document.root);
  if (patch.heading !== undefined) { step.content.heading = patch.heading.trim().slice(0, 500); const block = blocks.find(value => value.type === "heading"); if (block?.type === "heading") block.html = text(patch.heading, 500); }
  if (patch.body !== undefined) { step.content.body = patch.body.trim().slice(0, 10_000); const block = blocks.find(value => value.type === "text"); if (block?.type === "text") block.html = text(patch.body, 10_000); }
  step.content = applyOnsiteDocument(step.builder!, document, "survey", { questions: step.questions, submitLabel }).content;
}

function compileStep(step: SurveyStep, submitLabel: string): void {
  const document = documentFor(step), generic = validateOnsiteDocument(document), survey = validateOnsiteSurveyDocument(document, { questions: step.questions, submitLabel });
  const errors = [...surveyQuestionErrors(step.questions), ...generic.errors, ...survey]; if (errors.length) throw new Error(errors.join(" "));
  step.content = applyOnsiteDocument(step.builder!, document, "survey", { questions: step.questions, submitLabel }).content;
}

function referencedByBranch(survey: SurveyConfig, predicate: (rule: NonNullable<SurveyStep["branching"]>["rules"][number]) => boolean): boolean {
  return survey.steps.some(step => step.branching?.rules.some(predicate));
}

function ensureSurvey(definition: RuntimeWidgetDefinition & { targeting: ExperienceTargeting }): SurveyConfig {
  if (!definition.survey) throw new Error("This definition is not a Survey."); return definition.survey;
}

/** Applies the whole proposal to one clone and returns it only after every Survey invariant passes. */
export function applySurveyAiProposal(source: RuntimeWidgetDefinition & { targeting: ExperienceTargeting }, proposal: SurveyAiProposal): SurveyAiApplyResult {
  if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
  const definition = cloneOnsite(source), survey = ensureSurvey(definition), affected = new Set<string>(), warnings: string[] = [], withinStep = new Map<string, EditorAiOperation[]>();
  const step = (id: string) => { const value = survey.steps.find(item => item.id === id); if (!value) throw new Error(`Survey step no longer exists: ${id}`); return value; };
  const question = (owner: SurveyStep, id: string) => { const value = owner.questions.find(item => item.id === id); if (!value) throw new Error(`Survey question no longer exists: ${id}`); return value; };
  const replacement = proposal.operations.find((operation): operation is ReplaceMarkupOperation => operation.type === "replace_markup");
  if (replacement) {
    if (proposal.operations.length !== 1 || !replacement.stepId) throw new Error("A Survey source replacement must be one atomic step-scoped operation.");
    const owner = step(replacement.stepId); if (!owner.builder) throw new Error("Survey step has no builder source.");
    applySourceMarkup(owner.builder, owner.content, replacement, { widgetType: "survey", guide: false, survey: { questions: owner.questions } });
    const branchErrors = surveyBranchErrors(survey); if (branchErrors.length) throw new Error(branchErrors.join(" "));
    return { definition, affectedStepIds: [owner.id], order: survey.steps.map(value => value.id), warnings: ["This Survey step now uses Source mode; its protected questions and controls remain canonical."] };
  }

  for (const operation of proposal.operations) {
    if (isDocumentOperation(operation)) { if (!operation.stepId) throw new Error("Survey layout operations require a stable step ID."); step(operation.stepId); withinStep.set(operation.stepId, [...(withinStep.get(operation.stepId) ?? []), operation]); affected.add(operation.stepId); continue; }
    if (operation.type === "add_survey_step") {
      if (survey.steps.length >= 20) throw new Error("A Survey can contain up to 20 steps."); const questions = (operation.questions ?? []).map(value => questionFromInput(value));
      const created: SurveyStep = { id: onsiteId("step"), content: { heading: operation.heading.trim().slice(0, 500), body: operation.body?.trim().slice(0, 10_000) ?? "" }, questions, builder: { version: 1, projectData: {}, html: "", css: "" } };
      created.content = applyOnsiteDocument(created.builder!, createOnsiteSurveyDocument(questions, created.content), "survey", { questions, submitLabel: survey.submitLabel }).content;
      const index = operation.afterStepId ? survey.steps.findIndex(value => value.id === operation.afterStepId) : survey.steps.length - 1; if (operation.afterStepId && index < 0) throw new Error("Survey step insertion point no longer exists."); survey.steps.splice(index + 1, 0, created); affected.add(created.id);
    } else if (operation.type === "duplicate_survey_step") {
      if (survey.steps.length >= 20) throw new Error("A Survey can contain up to 20 steps."); const original = step(operation.stepId), copy = duplicateSurveyStep(original, survey.submitLabel); const index = operation.afterStepId ? survey.steps.findIndex(value => value.id === operation.afterStepId) : survey.steps.indexOf(original); if (index < 0) throw new Error("Survey step insertion point no longer exists."); survey.steps.splice(index + 1, 0, copy); affected.add(copy.id);
    } else if (operation.type === "remove_survey_step") {
      if (survey.steps.length <= 1) throw new Error("The final Survey step cannot be removed."); const inbound = referencedByBranch(survey, rule => rule.nextStepId === operation.stepId); if (inbound && !operation.removeBranchRules) throw new Error("This step is a branch destination. Explicitly allow removal of dependent branch rules.");
      if (inbound) { survey.steps.forEach(value => { if (value.branching) { value.branching.rules = value.branching.rules.filter(rule => rule.nextStepId !== operation.stepId); if (value.branching.defaultNextStepId === operation.stepId) delete value.branching.defaultNextStepId; } }); warnings.push("Dependent branch destinations were removed with the Survey step."); }
      survey.steps.splice(survey.steps.indexOf(step(operation.stepId)), 1); affected.add(operation.stepId); warnings.push("A Survey step and its questions were removed.");
    } else if (operation.type === "move_survey_step") {
      const value = step(operation.stepId); survey.steps.splice(survey.steps.indexOf(value), 1); const index = operation.beforeStepId ? survey.steps.findIndex(item => item.id === operation.beforeStepId) : survey.steps.length; if (index < 0) throw new Error("Survey step move destination no longer exists."); survey.steps.splice(index, 0, value); affected.add(value.id); warnings.push("Survey step order changed; branch paths were revalidated.");
    } else if (operation.type === "update_survey_step") setStepCopy(step(operation.stepId), operation.patch, survey.submitLabel), affected.add(operation.stepId);
    else if (operation.type === "add_survey_question") {
      const owner = step(operation.stepId); if (owner.questions.length >= 20) throw new Error("A Survey step can contain up to 20 questions."); if (operation.afterQuestionId) question(owner, operation.afterQuestionId);
      const created = questionFromInput(operation.question), index = operation.afterQuestionId ? owner.questions.findIndex(value => value.id === operation.afterQuestionId) + 1 : owner.questions.length; owner.questions.splice(index, 0, created); insertQuestionReference(documentFor(owner), created.id, operation.afterQuestionId); affected.add(owner.id);
    } else if (operation.type === "duplicate_survey_question") {
      const owner = step(operation.stepId); if (owner.questions.length >= 20) throw new Error("A Survey step can contain up to 20 questions."); const original = question(owner, operation.questionId), copy = cloneOnsite(original); copy.id = onsiteId("question"); if (copy.type === "single_choice" || copy.type === "multiple_choice") copy.options.forEach(value => { value.id = onsiteId("option"); });
      const afterId = operation.afterQuestionId ?? original.id; question(owner, afterId); owner.questions.splice(owner.questions.findIndex(value => value.id === afterId) + 1, 0, copy); insertQuestionReference(documentFor(owner), copy.id, afterId); affected.add(owner.id);
    } else if (operation.type === "remove_survey_question") {
      const owner = step(operation.stepId); question(owner, operation.questionId); const dependent = owner.branching?.rules.some(rule => rule.questionId === operation.questionId); if (dependent && !operation.removeBranchRules) throw new Error("This question controls branching. Explicitly allow removal of dependent branch rules.");
      if (dependent) { owner.branching!.rules = owner.branching!.rules.filter(rule => rule.questionId !== operation.questionId); warnings.push("Dependent branch rules were removed with the Survey question."); } owner.questions = owner.questions.filter(value => value.id !== operation.questionId); removeQuestionReference(documentFor(owner), operation.questionId); affected.add(owner.id); warnings.push("A Survey question and any collected value for it were removed.");
    } else if (operation.type === "move_survey_question") {
      const owner = step(operation.stepId), value = question(owner, operation.questionId); if (operation.beforeQuestionId) question(owner, operation.beforeQuestionId); owner.questions.splice(owner.questions.indexOf(value), 1); const index = operation.beforeQuestionId ? owner.questions.findIndex(item => item.id === operation.beforeQuestionId) : owner.questions.length; owner.questions.splice(index, 0, value); moveQuestionReference(documentFor(owner), value.id, operation.beforeQuestionId); affected.add(owner.id);
    } else if (operation.type === "update_survey_question") {
      const owner = step(operation.stepId), value = question(owner, operation.questionId), patch = operation.patch; if (patch.label !== undefined) value.label = patch.label.trim().slice(0, 500); if (patch.required !== undefined) value.required = patch.required;
      if (value.type === "short_text" || value.type === "long_text") { if (patch.placeholder !== undefined) value.placeholder = patch.placeholder.slice(0, 500); if (patch.maxLength !== undefined) value.maxLength = patch.maxLength; }
      if (value.type === "rating") { if (patch.min !== undefined) value.min = patch.min; if (patch.max !== undefined) value.max = patch.max; } affected.add(owner.id);
    } else if (operation.type === "change_survey_question_type") {
      const owner = step(operation.stepId), value = question(owner, operation.questionId), replacement = questionFromInput(operation.question, value.id), oldRules = owner.branching?.rules ?? []; owner.questions.splice(owner.questions.indexOf(value), 1, replacement);
      const invalid = surveyBranchErrors(survey); if (invalid.length && oldRules.some(rule => rule.questionId === value.id)) { if (!operation.removeInvalidBranchRules) throw new Error("Changing this question type invalidates branching. Explicitly allow removal of dependent rules."); owner.branching!.rules = oldRules.filter(rule => rule.questionId !== value.id); warnings.push("Branch rules using the converted question were removed."); } warnings.push(`Question type changed from ${value.type} to ${replacement.type}; existing answers may no longer be comparable.`); affected.add(owner.id);
    } else if (["add_survey_option", "update_survey_option", "remove_survey_option", "move_survey_option"].includes(operation.type)) {
      const op = operation as Extract<SurveyAiOperation, { type: "add_survey_option" | "update_survey_option" | "remove_survey_option" | "move_survey_option" }>, owner = step(op.stepId), value = question(owner, op.questionId); if (value.type !== "single_choice" && value.type !== "multiple_choice") throw new Error("Options are available only on choice questions.");
      if (op.type === "add_survey_option") { if (value.options.length >= 20) throw new Error("A choice question supports up to 20 options."); const index = op.afterOptionId ? value.options.findIndex(item => item.id === op.afterOptionId) + 1 : value.options.length; if (op.afterOptionId && index === 0) throw new Error("Survey option insertion point no longer exists."); value.options.splice(index, 0, { id: onsiteId("option"), label: op.label.trim().slice(0, 200) }); }
      else { const index = value.options.findIndex(item => item.id === op.optionId); if (index < 0) throw new Error("Survey option no longer exists."); if (op.type === "update_survey_option") value.options[index].label = op.label.trim().slice(0, 200); else if (op.type === "move_survey_option") { const [item] = value.options.splice(index, 1), destination = op.beforeOptionId ? value.options.findIndex(option => option.id === op.beforeOptionId) : value.options.length; if (destination < 0) throw new Error("Survey option move destination no longer exists."); value.options.splice(destination, 0, item); } else { const dependent = owner.branching?.rules.some(rule => rule.questionId === value.id && rule.value === op.optionId); if (dependent && !op.removeBranchRules) throw new Error("This option controls branching. Explicitly allow removal of dependent branch rules."); if (dependent) { owner.branching!.rules = owner.branching!.rules.filter(rule => !(rule.questionId === value.id && rule.value === op.optionId)); warnings.push("Dependent branch rules were removed with the Survey option."); } value.options.splice(index, 1); warnings.push("A Survey option and its answer value were removed."); } } affected.add(owner.id);
    } else if (operation.type === "update_survey_branching") { const owner = step(operation.stepId); owner.branching = operation.branching ? cloneOnsite(operation.branching) : undefined; affected.add(owner.id); warnings.push("Survey branching changed; visitor paths may differ."); }
    else if (operation.type === "remove_survey_branch_rule") { const owner = step(operation.stepId); if (!owner.branching || operation.ruleIndex < 0 || operation.ruleIndex >= owner.branching.rules.length) throw new Error("Survey branch rule no longer exists."); owner.branching.rules.splice(operation.ruleIndex, 1); affected.add(owner.id); warnings.push("A Survey branch rule was removed."); }
    else if (operation.type === "update_survey_configuration") { Object.assign(survey, cloneOnsite(operation.patch)); if (operation.patch.submitLabel !== undefined) survey.submitLabel = operation.patch.submitLabel.trim().slice(0, 80); warnings.push("Survey-wide configuration changed."); }
    else throw new Error("Unsupported Survey AI operation.");
  }

  for (const [stepId, operations] of withinStep) { const owner = step(stepId), document = applyEditorAiProposal(documentFor(owner), { summary: proposal.summary, operations }); owner.content = applyOnsiteDocument(owner.builder!, document, "survey", { questions: owner.questions, submitLabel: survey.submitLabel }).content; affected.add(stepId); }
  if (survey.steps.length < 1 || survey.steps.length > 20) throw new Error("A Survey must contain 1–20 steps.");
  const ids = new Set<string>(); for (const owner of survey.steps) { if (ids.has(owner.id)) throw new Error("Survey step IDs must be unique."); ids.add(owner.id); for (const value of owner.questions) { if (ids.has(value.id)) throw new Error("Survey question IDs must be unique."); ids.add(value.id); if (value.type === "single_choice" || value.type === "multiple_choice") for (const option of value.options) { if (ids.has(option.id)) throw new Error("Survey option IDs must be unique."); ids.add(option.id); } } compileStep(owner, survey.submitLabel); }
  const branchErrors = surveyBranchErrors(survey); if (branchErrors.length) throw new Error(branchErrors.join(" "));
  return { definition, affectedStepIds: [...affected], order: survey.steps.map(value => value.id), warnings };
}

export function surveyAiContext(input: { experience: { id: string; name: string; builderMode: "onsite" }; revision: number; definition: RuntimeWidgetDefinition & { targeting: ExperienceTargeting }; currentStepId: string; selection: CompositionSelection; scope?: "survey" | "step" }): Record<string, unknown> {
  const survey = ensureSurvey(input.definition), current = survey.steps.find(step => step.id === input.currentStepId); if (!current) throw new Error("Current Survey step no longer exists."); const document = documentFor(current);
  return {
    experience: { ...input.experience, kind: "widget", widgetType: "survey" }, revision: input.revision, scope: input.scope ?? (input.selection.kind === "step" ? "survey" : "step"), currentStepId: current.id,
    selection: cloneOnsite(input.selection), configuration: { showProgress: survey.showProgress, allowBack: survey.allowBack, submitLabel: survey.submitLabel },
    steps: survey.steps.map(step => ({ id: step.id, heading: step.content.heading, body: step.content.body, questions: cloneOnsite(step.questions), branching: cloneOnsite(step.branching) })),
    currentDocument: aiDocumentContext({ schemaVersion: document.schemaVersion, id: document.id, root: document.root }), ...(current.builder ? { source: sourceContext(current.builder, false) } : {}), targeting: cloneOnsite(input.definition.targeting), visualTheme: cloneOnsite(input.definition.visualTheme),
  };
}
