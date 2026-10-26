import {
  cloneOnsite, createBlock, duplicateCell, emptyCell, findBlock, findCell, insertAdjacentCell,
  parentCell, removeCell, sanitizeRichText, validateOnsiteDocument,
  type OnsiteBlock, type OnsiteButtonAction, type OnsiteCell, type OnsiteDocument,
} from "../onsite/OnsiteDocument";
import type { CompositionSelection } from "./OnsiteCompositionEditor";

export type EditorAiOperation =
  | { type: "update_text"; blockId: string; text: string }
  | { type: "update_block"; blockId: string; patch: Record<string, unknown> }
  | { type: "update_cell"; cellId: string; patch: Record<string, unknown> }
  | { type: "update_button_action"; blockId: string; action: Omit<OnsiteButtonAction, "id"> }
  | { type: "insert_block"; targetCellId: string; position: "inside" | "before" | "after"; blockType: "heading" | "text" | "button" | "image" | "divider" | "spacer" | "icon"; text?: string }
  | { type: "remove_cell"; cellId: string }
  | { type: "duplicate_cell"; cellId: string }
  | { type: "move_cell"; cellId: string; targetCellId: string; before?: boolean };
export interface EditorAiProposal { summary: string; operations: EditorAiOperation[] }

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
  if (document.schemaVersion !== 2) throw new Error("AI editing is available only for standard widgets.");
  if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
  const candidate = cloneOnsite(document);
  for (const operation of proposal.operations) {
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

export function editorAiContext(input: { experience: { id: string; name: string; widgetType: string | null; builderMode: "onsite" }; selection: CompositionSelection; document: OnsiteDocument; theme?: Record<string, string | number | boolean | null> }) {
  return { experience: input.experience, selection: cloneOnsite(input.selection), document: cloneOnsite(input.document), ...(input.theme ? { theme: cloneOnsite(input.theme) } : {}) };
}
