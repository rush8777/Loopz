import type { CompositionSelection } from "./OnsiteCompositionEditor";
import { applyEditorAiProposal, type EditorAiOperation, type EditorAiProposal } from "./AiEditing";
import { applyOnsiteDocument, cloneOnsite, emptyCell, findBlock, listBlocks, onsiteDocumentFromBuilder, onsiteId, parentCell, removeCell, validateOnsiteChecklistDocument, validateOnsiteDocument, type OnsiteCell, type OnsiteDocument } from "../onsite/OnsiteDocument";
import type { ChecklistItem, EditorChecklistDefinition, EditorDraft } from "../types";
import type { ChecklistView } from "../checklist/ChecklistMarkup";

export type ChecklistItemInput = Omit<ChecklistItem, "id">;
export type ChecklistAiOperation =
  | { type: "generate_checklist"; title?: string; description?: string; items: ChecklistItemInput[] }
  | { type: "add_checklist_task"; afterItemId?: string; item: ChecklistItemInput }
  | { type: "duplicate_checklist_task"; itemId: string; afterItemId?: string }
  | { type: "remove_checklist_task"; itemId: string }
  | { type: "move_checklist_task"; itemId: string; beforeItemId?: string }
  | { type: "update_checklist_task"; itemId: string; patch: { title?: string; description?: string | null } }
  | { type: "update_checklist_task_action"; itemId: string; action: ChecklistItem["action"] }
  | { type: "update_checklist_task_completion"; itemId: string; completion: ChecklistItem["completion"] }
  | { type: "update_checklist_behavior"; patch: Partial<EditorChecklistDefinition["behavior"]> }
  | { type: "update_checklist_completion_message"; patch: Partial<EditorChecklistDefinition["completionMessage"]> }
  | { type: "update_checklist_visual_state"; view: ChecklistView; width: number }
  | { type: "update_checklist_style"; blockId: string; patch: { fontSize?: number; color?: string; indicator?: "check" | "star" | "rocket" | "heart" | "info" | "warning" | "sparkles" | "arrow"; text?: string } };
export interface ChecklistAiProposal extends Omit<EditorAiProposal, "operations"> { operations: Array<EditorAiOperation | ChecklistAiOperation> }
export interface ChecklistAiApplyResult { definition: EditorChecklistDefinition; affectedItemIds: string[]; order: string[]; warnings: string[] }

const isDocumentOperation = (operation: EditorAiOperation | ChecklistAiOperation): operation is EditorAiOperation => ["update_text", "update_block", "update_cell", "update_button_action", "insert_block", "remove_cell", "duplicate_cell", "move_cell"].includes(operation.type);

function documentFor(definition: EditorChecklistDefinition): OnsiteDocument {
  const document = onsiteDocumentFromBuilder(definition.builder); if (!document || document.schemaVersion !== 4) throw new Error("This Checklist has no editable schema-v4 document."); return document;
}
function itemCell(document: OnsiteDocument, itemId: string): OnsiteCell | null { let found: OnsiteCell | null = null; const visit = (cell: OnsiteCell) => { if (cell.block?.type === "checklist_task" && cell.block.itemId === itemId) found = cell; cell.children?.forEach(visit); }; visit(document.root); return found; }
function itemContainer(document: OnsiteDocument): OnsiteCell | null { let found: OnsiteCell | null = null; const visit = (cell: OnsiteCell) => { if (cell.checklistRole === "items") found = cell; cell.children?.forEach(visit); }; visit(document.root); return found; }
function insertReference(document: OnsiteDocument, itemId: string, afterItemId?: string): void { const container = itemContainer(document); if (!container?.children) throw new Error("Checklist task container is missing."); const target = afterItemId ? itemCell(document, afterItemId) : null; if (afterItemId && (!target || parentCell(document, target.id) !== container)) throw new Error("Checklist task insertion point no longer exists."); const cell = { ...emptyCell({ id: onsiteId("block"), type: "checklist_task", itemId, fontSize: 14, indicator: "check" }), sizing: { mode: "hug" } as const }; container.children.splice(target ? container.children.indexOf(target) + 1 : container.children.length, 0, cell); }
function removeReference(document: OnsiteDocument, itemId: string): void { const cell = itemCell(document, itemId); if (!cell || !removeCell(document, cell.id)) throw new Error("Checklist task reference no longer exists."); }
function moveReference(document: OnsiteDocument, itemId: string, beforeItemId?: string): void { const container = itemContainer(document), source = itemCell(document, itemId), target = beforeItemId ? itemCell(document, beforeItemId) : null; if (!container?.children || !source || parentCell(document, source.id) !== container || beforeItemId && (!target || parentCell(document, target.id) !== container)) throw new Error("Checklist task move target is invalid."); container.children.splice(container.children.indexOf(source), 1); container.children.splice(target ? container.children.indexOf(target) : container.children.length, 0, source); }

function validateResource(item: ChecklistItem, references: NonNullable<EditorDraft["references"]>, warnings: string[]): void {
  if (item.action.type === "launch_guide") { const experienceId = item.action.experienceId, guide = references.guides.find(value => value.id === experienceId); if (!guide) throw new Error(`Unknown site Guide: ${experienceId}`); if (guide.status !== "published") warnings.push(`Guide “${guide.name}” is not published and cannot currently launch for visitors.`); }
  if (item.completion.type === "guide_completed") { const experienceId = item.completion.experienceId, guide = references.guides.find(value => value.id === experienceId); if (!guide) throw new Error(`Unknown site Guide: ${experienceId}`); if (guide.status !== "published") warnings.push(`Guide “${guide.name}” is not published, so Guide-completion progress cannot currently occur.`); }
  if (item.completion.type === "segment") { const segmentId = item.completion.segmentId; if (!references.segments.some(value => value.id === segmentId)) throw new Error(`Unknown site Segment: ${segmentId}`); }
  if (item.action.type === "navigate" && !/^\/(?!\/)/.test(item.action.url)) throw new Error("Checklist navigation must use a safe site-relative path.");
  if (item.action.type === "open_url" && !/^https?:\/\//i.test(item.action.url)) throw new Error("Checklist external URLs must use HTTP or HTTPS.");
  if (item.action.type === "none" && item.completion.type !== "item_clicked") throw new Error("A task without an action must use click completion.");
}
function validateAndCompile(definition: EditorChecklistDefinition, document: OnsiteDocument, references: NonNullable<EditorDraft["references"]>, warnings: string[]): void {
  if (!definition.title.trim() || definition.title.length > 160 || !definition.completionMessage.title.trim() || !definition.completionMessage.acknowledgeLabel.trim() || definition.completionMessage.acknowledgeLabel.length > 80) throw new Error("Checklist and completion copy is invalid.");
  definition.items.forEach(item => { if (!item.title.trim() || item.title.length > 200 || (item.description?.length ?? 0) > 1000) throw new Error("Checklist task copy is invalid."); validateResource(item, references, warnings); });
  const errors = [...validateOnsiteDocument(document).errors, ...validateOnsiteChecklistDocument(document, definition)]; if (errors.length) throw new Error(errors.join(" "));
  applyOnsiteDocument(definition.builder, document, "checklist", undefined, definition);
}

/** Applies canonical tasks and schema-v4 visuals together, returning nothing until the entire proposal validates. */
export function applyChecklistAiProposal(source: EditorChecklistDefinition, proposal: ChecklistAiProposal, references: NonNullable<EditorDraft["references"]>): ChecklistAiApplyResult {
  if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
  const definition = cloneOnsite(source), document = cloneOnsite(documentFor(definition)), affected = new Set<string>(), warnings: string[] = [], visual: EditorAiOperation[] = [];
  const item = (id: string) => { const value = definition.items.find(entry => entry.id === id); if (!value) throw new Error(`Checklist task no longer exists: ${id}`); return value; };
  for (const operation of proposal.operations) {
    if (isDocumentOperation(operation)) { visual.push(operation); continue; }
    if (operation.type === "generate_checklist") {
      if (!operation.items.length || operation.items.length > 20) throw new Error("A Checklist needs 1–20 tasks."); definition.title = operation.title?.trim().slice(0, 160) || definition.title; definition.description = operation.description?.trim().slice(0, 2000) || definition.description; const container = itemContainer(document); if (!container) throw new Error("Checklist task container is missing."); container.children = []; definition.items = operation.items.map(value => ({ ...cloneOnsite(value), id: onsiteId("item") })); definition.items.forEach(value => insertReference(document, value.id)); definition.items.forEach(value => affected.add(value.id)); warnings.push("The complete Checklist task list was replaced.");
    } else if (operation.type === "add_checklist_task") { if (definition.items.length >= 20) throw new Error("A Checklist supports up to 20 tasks."); if (operation.afterItemId) item(operation.afterItemId); const created = { ...cloneOnsite(operation.item), id: onsiteId("item") }, index = operation.afterItemId ? definition.items.findIndex(value => value.id === operation.afterItemId) + 1 : definition.items.length; definition.items.splice(index, 0, created); insertReference(document, created.id, operation.afterItemId); affected.add(created.id);
    } else if (operation.type === "duplicate_checklist_task") { if (definition.items.length >= 20) throw new Error("A Checklist supports up to 20 tasks."); const original = item(operation.itemId), created = { ...cloneOnsite(original), id: onsiteId("item") }, after = operation.afterItemId ?? original.id; item(after); definition.items.splice(definition.items.findIndex(value => value.id === after) + 1, 0, created); insertReference(document, created.id, after); affected.add(created.id);
    } else if (operation.type === "remove_checklist_task") { if (definition.items.length <= 1) throw new Error("The final Checklist task cannot be removed."); item(operation.itemId); definition.items = definition.items.filter(value => value.id !== operation.itemId); removeReference(document, operation.itemId); affected.add(operation.itemId); warnings.push("A Checklist task and its existing visitor progress reference were removed.");
    } else if (operation.type === "move_checklist_task") { const value = item(operation.itemId); if (operation.beforeItemId) item(operation.beforeItemId); definition.items.splice(definition.items.indexOf(value), 1); const index = operation.beforeItemId ? definition.items.findIndex(entry => entry.id === operation.beforeItemId) : definition.items.length; definition.items.splice(index, 0, value); moveReference(document, value.id, operation.beforeItemId); affected.add(value.id); if (definition.behavior.order === "sequential") warnings.push("Task order changed for a sequential Checklist, changing visitor progression.");
    } else if (operation.type === "update_checklist_task") { const value = item(operation.itemId); if (operation.patch.title !== undefined) value.title = operation.patch.title.trim().slice(0, 200); if (operation.patch.description !== undefined) value.description = operation.patch.description === null ? undefined : operation.patch.description.trim().slice(0, 1000); affected.add(value.id);
    } else if (operation.type === "update_checklist_task_action") { const value = item(operation.itemId); value.action = cloneOnsite(operation.action); affected.add(value.id); warnings.push("A task click action changed.");
    } else if (operation.type === "update_checklist_task_completion") { const value = item(operation.itemId); value.completion = cloneOnsite(operation.completion); affected.add(value.id); warnings.push("A task completion condition changed; visitor progress behavior may differ.");
    } else if (operation.type === "update_checklist_behavior") { const oldOrder = definition.behavior.order; Object.assign(definition.behavior, cloneOnsite(operation.patch)); if (operation.patch.order && operation.patch.order !== oldOrder) warnings.push("Checklist progression order changed."); }
    else if (operation.type === "update_checklist_completion_message") Object.assign(definition.completionMessage, cloneOnsite(operation.patch));
    else if (operation.type === "update_checklist_visual_state") { const view = document.root.children?.find(cell => cell.checklistRole === operation.view); if (!view) throw new Error(`Checklist visual state is missing: ${operation.view}`); view.checklistWidth = operation.width; }
    else if (operation.type === "update_checklist_style") { const block = findBlock(document, operation.blockId); if (!block || !block.type.startsWith("checklist_")) throw new Error("Checklist style target no longer exists."); const patch = operation.patch, visual = block as typeof block & { fontSize: number; color?: string }; if (patch.fontSize !== undefined) visual.fontSize = patch.fontSize; if (patch.color !== undefined) visual.color = patch.color; if (block.type === "checklist_task" && patch.indicator !== undefined) block.indicator = patch.indicator; if (block.type === "checklist_text" && patch.text !== undefined) block.text = patch.text.slice(0, 200); }
    else throw new Error("Unsupported Checklist AI operation.");
  }
  const finalDocument = visual.length ? applyEditorAiProposal(document, { summary: proposal.summary, operations: visual }) : document;
  validateAndCompile(definition, finalDocument, references, warnings);
  return { definition, affectedItemIds: [...affected], order: definition.items.map(value => value.id), warnings: [...new Set(warnings)] };
}

export function checklistAiContext(input: { experience: { id: string; name: string; builderMode: "onsite" }; revision: number; checklist: EditorChecklistDefinition; references: NonNullable<EditorDraft["references"]>; selection: CompositionSelection; currentView: ChecklistView; theme?: unknown }): Record<string, unknown> {
  const document = documentFor(input.checklist), blockId = input.selection.kind === "block" ? input.selection.blockId : undefined, selected = blockId ? listBlocks(document.root).find(block => block.id === blockId) : undefined, selectedItemId = selected?.type === "checklist_task" ? selected.itemId : undefined;
  return { experience: { ...input.experience, kind: "checklist", widgetType: null }, revision: input.revision, currentView: input.currentView, selection: cloneOnsite(input.selection), selectedItemId, checklist: { title: input.checklist.title, description: input.checklist.description, totalTasks: input.checklist.items.length, behavior: cloneOnsite(input.checklist.behavior), completionMessage: cloneOnsite(input.checklist.completionMessage), items: input.checklist.items.map((item, index) => ({ ...cloneOnsite(item), position: index })) }, resources: { guides: input.references.guides.map(value => ({ id: value.id, name: value.name, status: value.status })), segments: input.references.segments.map(value => ({ id: value.id, name: value.name })) }, currentDocument: cloneOnsite(document), targeting: cloneOnsite(input.checklist.targeting), theme: cloneOnsite(input.theme) };
}
