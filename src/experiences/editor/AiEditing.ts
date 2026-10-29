import {
  applyOnsiteDocument, cloneOnsite, createBlock, createOnsiteDocument, duplicateCell, duplicateDocument, emptyCell, findBlock, findCell, insertAdjacentCell,
  listBlocks, onsiteDocumentFromBuilder, onsiteId, parentCell, removeCell, sanitizeRichText, validateOnsiteDocument,
  type OnsiteBlock, type OnsiteButtonAction, type OnsiteCell, type OnsiteDocument,
} from "../onsite/OnsiteDocument";
import type { CompositionSelection } from "./OnsiteCompositionEditor";
import { guideStepConfigurationErrors } from "../runtime/GuideStepLogic";
import { getGuideStepPattern, guideStepRequiresTarget, type ExperienceTarget, type ExperienceTargeting, type GuideAdvance, type GuidePresentation, type GuideStep, type RuntimeGuideDefinition, type WidgetBuilderState } from "../types";
import { aiDocumentContext, applySourceMarkup, sourceContext, type ReplaceMarkupOperation } from "./SourceAuthoring";

export type EditorAiOperation =
  | { type: "update_text"; stepId?: string; blockId: string; text: string }
  | { type: "update_block"; stepId?: string; blockId: string; patch: Record<string, unknown> }
  | { type: "update_cell"; stepId?: string; cellId: string; patch: Record<string, unknown> }
  | { type: "update_button_action"; stepId?: string; blockId: string; action: Omit<OnsiteButtonAction, "id"> }
  | { type: "insert_block"; stepId?: string; targetCellId: string; position: "inside" | "before" | "after"; blockType: "heading" | "text" | "button" | "image" | "divider" | "spacer" | "icon"; text?: string }
  | { type: "remove_cell"; stepId?: string; cellId: string }
  | { type: "duplicate_cell"; stepId?: string; cellId: string }
  | { type: "move_cell"; stepId?: string; cellId: string; targetCellId: string; before?: boolean }
  | ReplaceMarkupOperation;
export type GuideAiOperation =
  | { type: "add_guide_step"; afterStepId?: string; pattern: "modal" | "anchored_card"; label?: string; heading: string; body: string }
  | { type: "duplicate_guide_step"; stepId: string; afterStepId?: string; label?: string; heading?: string; body?: string }
  | { type: "remove_guide_step"; stepId: string }
  | { type: "move_guide_step"; stepId: string; beforeStepId?: string }
  | { type: "update_guide_step"; stepId: string; patch: { label?: string; pattern?: "modal" | "anchored_card" } }
  | { type: "update_guide_step_behavior"; stepId: string; patch: Partial<Pick<GuideStep["behavior"], "placement" | "alignment" | "offset" | "pointer" | "dismissible" | "backdrop" | "backdropOpacity" | "closeOnBackdrop">> }
  | { type: "update_guide_advance"; stepId: string; advance: { type: "button" } | { type: "element_click" } | { type: "element_hover"; durationMs: number } | { type: "custom_event"; eventName: string } | { type: "route"; pageRules: Array<Omit<import("../types").PageRule, "id">> } }
  | { type: "update_guide_presentation"; stepId: string; presentation: { delayMs?: number; missingTarget?: GuidePresentation["missingTarget"] | null } }
  | { type: "update_guide_targeting"; patch: Partial<Omit<Pick<ExperienceTargeting, "pageRules" | "trigger" | "frequency" | "priority" | "interruptPolicy">, "pageRules">> & { pageRules?: Array<Omit<import("../types").PageRule, "id">> } }
  | { type: "request_guide_target"; stepId: string; targetKind: "position" | "advance" };
export interface EditorAiProposal { summary: string; operations: Array<EditorAiOperation | GuideAiOperation> }
export interface GuideAiApplyResult { guide: RuntimeGuideDefinition & { targeting: ExperienceTargeting }; affectedStepIds: string[]; order: string[]; warnings: string[] }

const BLOCK_PATCH_KEYS = new Set(["align", "fontSize", "weight", "lineHeight", "color", "label", "variant", "background", "width", "paddingX", "paddingY", "radius", "alt", "fit", "size", "thickness", "icon"]);
const CELL_PATCH_KEYS = new Set(["direction", "sizing", "align", "justify", "gap", "padding", "responsiveStack", "style"]);
const plainText = (value: string) => sanitizeRichText(value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!));

function patchBlock(block: OnsiteBlock, patch: Record<string, unknown>): void {
  for (const key of Object.keys(patch)) if (!BLOCK_PATCH_KEYS.has(key)) throw new Error(`Unsupported block property: ${key}`);
  Object.assign(block, cloneOnsite(patch));
}

function patchCell(cell: OnsiteCell, patch: Record<string, unknown>): void {
  for (const key of Object.keys(patch)) if (!CELL_PATCH_KEYS.has(key)) throw new Error(`Unsupported cell property: ${key}`);
  Object.assign(cell, cloneOnsite(patch));
}

function moveCandidate(document: OnsiteDocument, sourceId: string, targetId: string, before = false): void {
  if (sourceId === document.root.id || sourceId === targetId) throw new Error("The root cell cannot be moved.");
  const source = findCell(document, sourceId), target = findCell(document, targetId), from = parentCell(document, sourceId);
  if (!source || !target || !from?.children || findCell({ ...document, root: source }, targetId)) throw new Error("Invalid move target.");
  from.children.splice(from.children.indexOf(source), 1); if (!from.children.length) delete from.children;
  if (!target.block && !target.children) target.children = [source];
  else { const to = parentCell(document, targetId); if (!to?.children) throw new Error("Invalid move target."); to.children.splice(to.children.indexOf(target) + (before ? 0 : 1), 0, source); }
}

/** Applies a complete AI proposal to a clone. The live document is untouched unless every operation validates. */
export function applyEditorAiProposal(document: OnsiteDocument, proposal: EditorAiProposal): OnsiteDocument {
  if (document.schemaVersion !== 2 && document.schemaVersion !== 3) throw new Error("AI editing requires an on-site document.");
  if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
  const candidate = cloneOnsite(document);
  for (const operation of proposal.operations) {
    if (operation.type === "replace_markup") throw new Error("Source proposals must be applied to the complete builder.");
    if (operation.type === "update_text") {
      const block = findBlock(candidate, operation.blockId); if (!block || (block.type !== "heading" && block.type !== "text")) throw new Error("Text target no longer exists.");
      block.html = plainText(operation.text.slice(0, 10_000));
    } else if (operation.type === "update_block") {
      const block = findBlock(candidate, operation.blockId); if (!block || block.type === "question" || block.type === "survey_controls" || block.type.startsWith("checklist_")) throw new Error("Block target is unavailable.");
      patchBlock(block, operation.patch);
    } else if (operation.type === "update_cell") {
      const cell = findCell(candidate, operation.cellId); if (!cell) throw new Error("Cell target no longer exists."); patchCell(cell, operation.patch);
    } else if (operation.type === "update_button_action") {
      const block = findBlock(candidate, operation.blockId); if (block?.type !== "button") throw new Error("Button target no longer exists.");
      block.action = { id: block.action.id, ...cloneOnsite(operation.action) } as OnsiteButtonAction;
    } else if (operation.type === "insert_block") {
      const target = findCell(candidate, operation.targetCellId); if (!target) throw new Error("Insert target no longer exists.");
      const block = createBlock(operation.blockType); if (operation.text && (block.type === "heading" || block.type === "text")) block.html = plainText(operation.text);
      if (operation.position === "inside") {
        if (!target.block && !target.children) target.block = block;
        else { target.children ??= target.block ? [emptyCell(target.block)] : []; delete target.block; target.children.push(emptyCell(block)); }
      } else {
        const id = insertAdjacentCell(candidate, target.id, operation.position === "before" ? "top" : "bottom"); if (!id) throw new Error("Block could not be inserted."); findCell(candidate, id)!.block = block;
      }
    } else if (operation.type === "remove_cell") {
      if (operation.cellId === candidate.root.id || !removeCell(candidate, operation.cellId)) throw new Error("Cell cannot be removed.");
    } else if (operation.type === "duplicate_cell") {
      if (operation.cellId === candidate.root.id || !duplicateCell(candidate, operation.cellId)) throw new Error("Cell cannot be duplicated.");
    } else if (operation.type === "move_cell") moveCandidate(candidate, operation.cellId, operation.targetCellId, operation.before);
    else throw new Error("Unsupported AI operation.");
  }
  const validation = validateOnsiteDocument(candidate); if (!validation.valid) throw new Error(validation.errors.join(" "));
  return candidate;
}

function setDocumentCopy(step: GuideStep, heading?: string, body?: string): void {
  const document = onsiteDocumentFromBuilder(step.builder); if (!document || !step.builder) throw new Error(`Step ${step.id} has no editable on-site document.`);
  const blocks = listBlocks(document.root);
  const headingBlock = blocks.find(block => block.type === "heading"); if (heading !== undefined && headingBlock?.type === "heading") headingBlock.html = plainText(heading.slice(0, 160));
  const bodyBlock = blocks.find(block => block.type === "text"); if (body !== undefined && bodyBlock?.type === "text") bodyBlock.html = plainText(body.slice(0, 10_000));
  const compiled = applyOnsiteDocument(step.builder, document, getGuideStepPattern(step)); step.content = compiled.content;
}

function newGuideStep(operation: Extract<GuideAiOperation, { type: "add_guide_step" }>): GuideStep {
  const document = createOnsiteDocument(true), builder: WidgetBuilderState = { version: 1, projectData: {}, html: "", css: "" };
  const step: GuideStep = { id: onsiteId("step"), label: operation.label?.trim().slice(0, 80) || (operation.pattern === "modal" ? "Modal step" : "Anchored step"), pattern: operation.pattern, content: { heading: "", body: "" }, builder, advance: { type: "button" }, behavior: operation.pattern === "modal" ? { dismissible: true } : { placement: "auto", alignment: "center", offset: 8, pointer: { enabled: true, size: 10 }, dismissible: true } };
  applyOnsiteDocument(builder, document, operation.pattern); setDocumentCopy(step, operation.heading, operation.body); return step;
}

function normalizePattern(step: GuideStep, pattern: "modal" | "anchored_card"): void {
  step.pattern = pattern;
  if (pattern === "modal") {
    delete step.target; delete step.presentation?.missingTarget;
    if (step.advance?.type === "element_click" || step.advance?.type === "element_hover") step.advance = { type: "button" };
    step.behavior = { dismissible: step.behavior.dismissible ?? true, backdrop: step.behavior.backdrop, backdropOpacity: step.behavior.backdropOpacity, closeOnBackdrop: step.behavior.closeOnBackdrop };
  } else step.behavior = { placement: step.behavior.placement ?? "auto", alignment: step.behavior.alignment ?? "center", offset: step.behavior.offset ?? 8, pointer: step.behavior.pointer ?? { enabled: true, size: 10 }, dismissible: step.behavior.dismissible ?? true, layer: step.behavior.layer };
  if (step.builder) { const document = onsiteDocumentFromBuilder(step.builder); if (document) step.content = applyOnsiteDocument(step.builder, document, pattern).content; }
}

function withPageRuleIds(rules: Array<Omit<import("../types").PageRule, "id">>): import("../types").PageRule[] {
  return rules.map(rule => ({ ...cloneOnsite(rule), id: onsiteId("cell") }));
}

/** Applies Guide and within-step operations to one clone. No caller state is mutated on failure. */
export function applyGuideAiProposal(source: RuntimeGuideDefinition & { targeting: ExperienceTargeting }, proposal: EditorAiProposal, resolvedTargets: ReadonlyMap<number, ExperienceTarget> = new Map()): GuideAiApplyResult {
  if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
  const guide = cloneOnsite(source), affected = new Set<string>(), withinStep = new Map<string, EditorAiOperation[]>();
  const step = (id: string) => { const value = guide.steps.find(item => item.id === id); if (!value) throw new Error(`Guide step no longer exists: ${id}`); return value; };
  const replacement = proposal.operations.find((operation): operation is ReplaceMarkupOperation => operation.type === "replace_markup");
  if (replacement) {
    if (proposal.operations.length !== 1 || !replacement.stepId) throw new Error("A source replacement must be one atomic step-scoped operation.");
    const owner = step(replacement.stepId); if (!owner.builder) throw new Error("Guide step has no builder source.");
    applySourceMarkup(owner.builder, owner.content, replacement, { widgetType: getGuideStepPattern(owner), guide: true });
    return { guide, affectedStepIds: [owner.id], order: guide.steps.map(value => value.id), warnings: ["This step now uses Source mode; cell controls are disabled until a recoverable conversion is available."] };
  }
  proposal.operations.forEach((operation, operationIndex) => {
    if (["update_text", "update_block", "update_cell", "update_button_action", "insert_block", "remove_cell", "duplicate_cell", "move_cell"].includes(operation.type)) {
      const documentOperation = operation as EditorAiOperation; if (!documentOperation.stepId) throw new Error("Within-step operations require a stable step ID."); step(documentOperation.stepId);
      withinStep.set(documentOperation.stepId, [...(withinStep.get(documentOperation.stepId) ?? []), documentOperation]); affected.add(documentOperation.stepId); return;
    }
    const guideOperation = operation as GuideAiOperation;
    if (guideOperation.type === "add_guide_step") {
      if (guide.steps.length >= 20) throw new Error("A Guide can contain up to 20 steps.");
      const created = newGuideStep(guideOperation), after = guideOperation.afterStepId ? guide.steps.findIndex(item => item.id === guideOperation.afterStepId) : guide.steps.length - 1;
      if (guideOperation.afterStepId && after < 0) throw new Error("The requested insertion step no longer exists."); guide.steps.splice(after + 1, 0, created); affected.add(created.id);
    } else if (guideOperation.type === "duplicate_guide_step") {
      if (guide.steps.length >= 20) throw new Error("A Guide can contain up to 20 steps."); const original = step(guideOperation.stepId), copy = cloneOnsite(original); copy.id = onsiteId("step");
      copy.label = guideOperation.label?.trim().slice(0, 80) || `${original.label || original.content.heading || "Step"} copy`; const document = onsiteDocumentFromBuilder(copy.builder); if (document && copy.builder) copy.content = applyOnsiteDocument(copy.builder, duplicateDocument(document), getGuideStepPattern(copy)).content;
      setDocumentCopy(copy, guideOperation.heading, guideOperation.body); const after = guideOperation.afterStepId ? guide.steps.findIndex(item => item.id === guideOperation.afterStepId) : guide.steps.indexOf(original); if (after < 0) throw new Error("The requested insertion step no longer exists."); guide.steps.splice(after + 1, 0, copy); affected.add(copy.id);
    } else if (guideOperation.type === "remove_guide_step") {
      if (guide.steps.length <= 1) throw new Error("The final Guide step cannot be removed."); const index = guide.steps.findIndex(item => item.id === guideOperation.stepId); if (index < 0) throw new Error("Guide step no longer exists."); guide.steps.splice(index, 1); affected.add(guideOperation.stepId);
    } else if (guideOperation.type === "move_guide_step") {
      const value = step(guideOperation.stepId), from = guide.steps.indexOf(value); guide.steps.splice(from, 1); const before = guideOperation.beforeStepId ? guide.steps.findIndex(item => item.id === guideOperation.beforeStepId) : guide.steps.length; if (before < 0) throw new Error("Move destination no longer exists."); guide.steps.splice(before, 0, value); affected.add(value.id);
    } else if (guideOperation.type === "update_guide_step") {
      const value = step(guideOperation.stepId); if (guideOperation.patch.label !== undefined) value.label = guideOperation.patch.label.trim().slice(0, 80) || undefined; if (guideOperation.patch.pattern) normalizePattern(value, guideOperation.patch.pattern); affected.add(value.id);
    } else if (guideOperation.type === "update_guide_step_behavior") {
      const value = step(guideOperation.stepId); Object.assign(value.behavior, cloneOnsite(guideOperation.patch)); affected.add(value.id);
    } else if (guideOperation.type === "update_guide_advance") {
      const value = step(guideOperation.stepId); if ((guideOperation.advance.type === "element_click" || guideOperation.advance.type === "element_hover") && !guideStepRequiresTarget(value)) throw new Error("Website interaction advancement requires an Anchored Card step.");
      const target = value.advance?.type === "element_click" || value.advance?.type === "element_hover" ? value.advance.target : undefined;
      const advance = cloneOnsite(guideOperation.advance); value.advance = advance.type === "route" ? { ...advance, pageRules: withPageRuleIds(advance.pageRules) } : { ...advance, ...(target ? { target } : {}) } as GuideAdvance; affected.add(value.id);
    } else if (guideOperation.type === "update_guide_presentation") {
      const value = step(guideOperation.stepId), { missingTarget, ...presentationPatch } = cloneOnsite(guideOperation.presentation);
      value.presentation = { ...value.presentation, ...presentationPatch, ...(missingTarget && { missingTarget }) }; if (missingTarget === null && value.presentation) delete value.presentation.missingTarget; affected.add(value.id);
    } else if (guideOperation.type === "update_guide_targeting") {
      const patch = cloneOnsite(guideOperation.patch); Object.assign(guide.targeting, patch, patch.pageRules ? { pageRules: withPageRuleIds(patch.pageRules) } : {});
    }
    else if (guideOperation.type === "request_guide_target") {
      const value = step(guideOperation.stepId), target = resolvedTargets.get(operationIndex); if (!target) throw new Error(`Select a ${guideOperation.targetKind === "position" ? "positioning" : "interaction"} target before applying.`);
      const safe = { ...cloneOnsite(target) }; if (guideOperation.targetKind === "position") value.target = safe;
      else { if (!(value.advance?.type === "element_click" || value.advance?.type === "element_hover")) throw new Error("Configure click or hover advancement before selecting its target."); value.advance.target = safe; }
      affected.add(value.id);
    } else throw new Error("Unsupported Guide AI operation.");
  });
  for (const [stepId, operations] of withinStep) {
    const value = step(stepId), document = onsiteDocumentFromBuilder(value.builder); if (!document || !value.builder) throw new Error(`Step ${stepId} has no editable on-site document.`);
    const next = applyEditorAiProposal(document, { summary: proposal.summary, operations }); value.content = applyOnsiteDocument(value.builder, next, getGuideStepPattern(value)).content;
  }
  const warnings: string[] = [];
  guide.steps.forEach((value, index) => { warnings.push(...guideStepConfigurationErrors(value, index)); if (value.presentation?.missingTarget?.action === "skip" && index === guide.steps.length - 1) warnings.push(`Step ${index + 1}: Skip cannot be used on the final step.`); const document = onsiteDocumentFromBuilder(value.builder); if (!document || !validateOnsiteDocument(document).valid) warnings.push(`Step ${index + 1}: on-site document is invalid.`); });
  if (warnings.length) throw new Error(warnings.join(" "));
  return { guide, affectedStepIds: [...affected], order: guide.steps.map(value => value.id), warnings };
}

export function editorAiContext(input: { experience: { id: string; name: string; widgetType: string | null; builderMode: "onsite" }; selection: CompositionSelection; document: OnsiteDocument; builder?: WidgetBuilderState; theme?: Record<string, string | number | boolean | null> }) {
  return { experience: input.experience, selection: cloneOnsite(input.selection), document: aiDocumentContext(input.document), ...(input.builder ? { source: sourceContext(input.builder, false) } : {}), ...(input.theme ? { theme: cloneOnsite(input.theme) } : {}) };
}

export function guideAiContext(input: { experience: { id: string; name: string; builderMode: "onsite" }; revision: number; guide: RuntimeGuideDefinition & { targeting: ExperienceTargeting }; currentStepId: string; selection: CompositionSelection; theme?: unknown; scope?: "guide" | "step" }) {
  const selected = input.guide.steps.find(step => step.id === input.currentStepId); if (!selected) throw new Error("Selected Guide step no longer exists.");
  const target = (value?: ExperienceTarget) => value ? { configured: true, label: value.label, reliability: value.reliability, pagePath: value.targetContext?.pagePath } : { configured: false };
  const summaries = input.guide.steps.map((step, index) => {
    const document = onsiteDocumentFromBuilder(step.builder), buttons = document ? listBlocks(document.root).filter((block): block is Extract<OnsiteBlock, { type: "button" }> => block.type === "button").map(block => ({ id: block.id, label: block.label, action: block.action.type })) : [];
    return { id: step.id, index, label: step.label, pattern: getGuideStepPattern(step), heading: step.content.heading, description: step.content.body, buttons, advance: step.advance ? { ...cloneOnsite(step.advance), ...(step.advance.type === "element_click" || step.advance.type === "element_hover" ? { target: target(step.advance.target ?? step.target) } : {}) } : { type: "button" }, presentation: step.presentation, dismissible: step.behavior.dismissible, positionTarget: target(step.target) };
  });
  const layer = input.guide.behavior?.layer;
  const behavior = layer ? { layer: layer.mode === "relative" ? { mode: layer.mode, relation: layer.relation, target: target(layer.target) } : cloneOnsite(layer) } : undefined;
  return { experience: { ...input.experience, kind: "guide" as const, widgetType: null }, selection: { ...cloneOnsite(input.selection), scope: input.scope ?? "step", stepId: selected.id }, guide: { id: input.experience.id, name: input.experience.name, revision: input.revision, currentStepId: selected.id, totalSteps: input.guide.steps.length, steps: summaries, targeting: cloneOnsite(input.guide.targeting), ...(behavior ? { behavior } : {}), theme: cloneOnsite(input.theme ?? null) }, currentDocument: aiDocumentContext(onsiteDocumentFromBuilder(selected.builder) ?? null), ...(selected.builder ? { source: sourceContext(selected.builder, true) } : {}) };
}
