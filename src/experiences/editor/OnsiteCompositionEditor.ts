import { SourceDocumentAdapter, type SourceSnapshot } from "./SourceDocumentAdapter";
import { isSourceAuthored } from "./SourceAuthoring";
import type { ChecklistItem } from "../types";
import type { ChecklistView, OnsiteChecklistContext } from "../checklist/ChecklistMarkup";
import { newSurveyQuestion } from "./SurveyEditing";
import { surveyBranchErrors } from "../survey/SurveyLogic";
import { QUESTION_TYPES, surveyQuestionErrors } from "../survey/SurveyMarkup";
import { editorRange, setEditorRange } from "./EditorSelection";
import type { ExperienceContent, SurveyConfig, SurveyStep, SurveyQuestion, WidgetBuilderState, WidgetType } from "../types";
import {
  applyOnsiteDocument,
  cellForBlock,
  cloneOnsite,
  createBlock,
  duplicateCell,
  duplicateSurveyCell,
  duplicateChecklistCell,
  validateOnsiteChecklistDocument,
  validateOnsiteSurveyDocument,
  emptyCell,
  findBlock,
  findCell,
  insertAdjacentCell,
  insertEdgeCell,
  listBlocks,
  migrateV1Builder,
  moveCell,
  onsiteId,
  onsiteImageSourceIsSafe,
  onsiteDocumentFromBuilder,
  parentCell,
  removeCell,
  resizeSiblings,
  sanitizeRichText,
  splitCell,
  validateOnsiteDocument,
  type OnsiteBlock,
  type OnsiteButtonAction,
  type OnsiteCell,
  type OnsiteDocument,
  type OnsiteSizing,
} from "../onsite/OnsiteDocument";
import { builderLinkUrlIsSafe } from "../runtime/BuilderContentContract";
import { prepareImageFile } from "./ImageFile";
import { applyEditorAiProposal, type EditorAiProposal } from "./AiEditing";

export type CompositionSelection =
  | { kind: "step"; label: string }
  | { kind: "cell"; label: string; cellId: string }
  | { kind: "block"; label: string; cellId: string; blockId: string; blockType: OnsiteBlock["type"] };
interface Callbacks { onUndo?(): void; onRedo?(): void; canUndo?(): boolean; canRedo?(): boolean; onTransaction?(): void; onChange(typing?: boolean): void; onSelectionChange(selection: CompositionSelection): void; onValidation(errors: string[]): void; onImageStatus?(message: string): void; onPatch?(): void }
interface HistoryEntry { source?: SourceSnapshot; checklist?: OnsiteChecklistContext; questions?: SurveyQuestion[]; branching?: SurveyStep["branching"]; document: OnsiteDocument; selection: CompositionSelection; bytes: number }
type CellEdge = "top" | "right" | "bottom" | "left";

const BLOCK_LABEL: Record<OnsiteBlock["type"], string> = { checklist_task:"Task",checklist_text:"Checklist text",checklist_control:"Checklist control",checklist_progress:"Progress", question: "Question", survey_controls: "Survey controls", heading: "Heading", text: "Text", button: "Button", image: "Image", divider: "Divider", spacer: "Spacer", icon: "Icon" };
const HISTORY_LIMIT = 50;
const HISTORY_BYTES = 2_000_000;

/** Structured on-site authoring. It is imported only by the lazy editor bundle. */
export class OnsiteCompositionEditor {
  private document: OnsiteDocument;
  private source: SourceDocumentAdapter | null = null;
  private surface: HTMLElement | null;
  private toolbar: HTMLElement;
  private palette: HTMLElement;
  private edgeButtons: HTMLButtonElement[] = [];
  private insertion: { cellId: string; edge: CellEdge } | null = null;
  private paletteAnchor: HTMLElement | null = null;
  private toolFrame = 0;
  private handles: HTMLElement[] = [];
  private selection: CompositionSelection = { kind: "step", label: "Step" };
  private history: HistoryEntry[] = [];
  private historyIndex = -1;
  private historyBytes = 0;
  private compileTimer = 0;
  private typingTimer = 0;
  private composing = false;
  private resizeCleanup: (() => void) | null = null;
  private resizeFrame = 0;
  private destroyed = false;
  private compiledState = "";
  private readonly migrated: boolean;
  private imageInput: HTMLInputElement;
  private imageFileTarget: string | null = null;
  private imageRequest = 0;
  private imagePlaceholders = new Map<HTMLElement, HTMLImageElement>();
  private imageDropTarget: HTMLElement | null = null;
  private savedRange: Range | null = null;
  private moveSource: string | null = null;
  private checklistView: ChecklistView = "expanded";

  constructor(
    private root: ShadowRoot,
    private builder: WidgetBuilderState,
    private content: ExperienceContent,
    private widgetType: WidgetType | "anchored_card" | "modal" | "checklist",
    private guide: boolean,
    private callbacks: Callbacks,
    private survey?: { config: SurveyConfig; step: SurveyStep },
    private checklist?: OnsiteChecklistContext,
  ) {
    this.source = isSourceAuthored(builder) ? new SourceDocumentAdapter(builder, content, { widgetType, guide, survey: survey ? { questions: survey.step.questions } : undefined, checklist: checklist ? { items: checklist.items } : undefined }) : null;
    const existing = this.source?.getDocument() ?? onsiteDocumentFromBuilder(builder);
    this.document = existing ?? migrateV1Builder(builder, content, widgetType, guide) ?? (() => { throw new Error("This v1 layout cannot be converted safely. Continue editing it with the compatibility editor."); })();
    this.migrated = this.source?.upgraded ?? !existing;
    this.surface = root.querySelector<HTMLElement>("[data-movcues-builder-surface]");
    this.toolbar = document.createElement("div"); this.toolbar.dataset.movcuesCompositionToolbar = "";
    this.palette = document.createElement("div"); this.palette.dataset.movcuesBlockPalette = ""; this.palette.hidden = true;
    this.imageInput = document.createElement("input"); this.imageInput.type = "file"; this.imageInput.accept = "image/png,image/jpeg,image/webp";
    this.imageInput.hidden = true; this.imageInput.dataset.movcuesImageFile = "";
    this.imageInput.addEventListener("change", () => {
      const id = this.imageFileTarget; this.imageFileTarget = null;
      const file = this.imageInput.files?.[0]; if (id && file) void this.setImageFile(file, id);
    });
  }

  start(): void {
    if (!this.surface) return;
    const repaired = this.repairDocumentStructure();
    this.compileAndPatch();
    const style = document.createElement("style"); style.dataset.movcuesCompositionStyle = ""; style.textContent = AUTHORING_STYLE; this.root.append(style);
    this.toolbar.setAttribute("role", "toolbar"); this.toolbar.setAttribute("aria-label", "Selected element tools");
    const tools = [
      ["add", "Add block", '<path d="M8 3v10M3 8h10"/>'],
      ["columns", "Split into columns", '<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M8 2v12"/>'],
      ["rows", "Split into rows", '<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 8h12"/>'],
      ["parent", "Select parent", '<path d="M8 13V3m-4 4 4-4 4 4"/>'],
      ["duplicate", "Duplicate", '<rect x="6" y="6" width="8" height="8" rx="1"/><path d="M10 4V2H2v8h2"/>'],
      ["move-up", "Move before", '<path d="M13 8H3m4-4L3 8l4 4"/>'],
      ["move-down", "Move after", '<path d="M3 8h10M9 4l4 4-4 4"/>'],
      ["move", "Move to another cell: drag or click, then choose a cell", '<path d="M8 2v12M2 8h12m-4-4 4 4-4 4M6 4 2 8l4 4"/>'],
      ["delete", "Delete", '<path d="m4 4 8 8m0-8-8 8"/>'],
    ];
    this.toolbar.innerHTML = tools.map(([command, label, icon]) => `<button type="button" data-command="${command}" title="${label}" aria-label="${label}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></button>`).join("");
    this.toolbar.querySelector<HTMLButtonElement>('[data-command="move"]')!.draggable = true;
    this.palette.innerHTML = (Object.keys(BLOCK_LABEL) as OnsiteBlock["type"][]).filter(type => type !== "question" && type !== "survey_controls" && !type.startsWith("checklist_") && !(this.checklist && type === "button")).map(type => `<button type="button" data-insert-block="${type}">${BLOCK_LABEL[type]}</button>`).join("");
    if (this.survey && !this.source) this.palette.insertAdjacentHTML("beforeend", QUESTION_TYPES.map(type => `<button type="button" data-insert-question="${type}">${({ single_choice: "Single choice", multiple_choice: "Multiple choice", short_text: "Short text", long_text: "Long text", rating: "Rating", nps: "NPS" })[type]}</button>`).join(""));
    this.root.append(this.toolbar, this.palette, this.imageInput);
    const edgeLabels = { top: "Add above", right: "Add to the right", bottom: "Add below", left: "Add to the left" };
    this.edgeButtons = (["top", "right", "bottom", "left"] as const).map(edge => {
      const button = document.createElement("button"); button.type = "button"; button.dataset.movcuesInsertEdge = edge;
      button.textContent = "+"; button.title = edgeLabels[edge]; button.setAttribute("aria-label", edgeLabels[edge]); button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => { const cell = this.getSelectedCell(); if (this.paletteAnchor === button && !this.palette.hidden) this.closePalette(); else if (cell) this.openPalette(button, { cellId: cell.id, edge }); });
      this.root.append(button); return button;
    });
    if(this.checklist && !this.source)this.palette.insertAdjacentHTML("afterbegin",'<button type="button" data-insert-task>Task</button>');
    this.surface.addEventListener("click", this.onSurfaceClick);
    this.surface.addEventListener("dblclick", this.onDoubleClick);
    this.surface.addEventListener("input", this.onInput);
    this.surface.addEventListener("blur", this.onBlur, true);
    this.surface.addEventListener("compositionstart", this.onCompositionStart);
    this.surface.addEventListener("compositionend", this.onCompositionEnd);
    this.surface.addEventListener("keydown", this.onSurfaceKeyDown);
    this.surface.addEventListener("dragover", this.onImageDragOver);
    this.surface.addEventListener("dragleave", this.onImageDragLeave);
    this.surface.addEventListener("drop", this.onImageDrop);
    this.surface.addEventListener("keyup", this.rememberSelection);
    this.surface.addEventListener("mouseup", this.rememberSelection);
    this.surface.addEventListener("paste", this.onPaste);
    this.toolbar.addEventListener("dragstart", this.onMoveDragStart);
    this.toolbar.addEventListener("dragend", this.cancelMove);
    this.toolbar.addEventListener("click", this.onToolbarClick);
    this.palette.addEventListener("click", this.onPaletteClick);
    this.root.addEventListener("scroll", this.positionTools, true);
    window.addEventListener("scroll", this.positionTools, true); window.addEventListener("resize", this.positionTools);
    window.addEventListener("pointerdown", this.dismissPalette, true); window.addEventListener("keydown", this.onPaletteKeyDown);
    this.select({ kind: "step", label: "Step" }); this.pushHistory(); if (this.migrated || repaired) this.callbacks.onChange();
  }

  restoreBuilder(builder: WidgetBuilderState, content: ExperienceContent): void {
    Object.assign(this.builder, cloneOnsite(builder));
    for (const key of Object.keys(this.content)) Reflect.deleteProperty(this.content, key);
    Object.assign(this.content, cloneOnsite(content));
    this.source = isSourceAuthored(this.builder) ? new SourceDocumentAdapter(this.builder, this.content, { widgetType: this.widgetType, guide: this.guide, survey: this.survey ? { questions: this.survey.step.questions } : undefined, checklist: this.checklist ? { items: this.checklist.items } : undefined }) : null;
    this.document = this.source?.getDocument() ?? onsiteDocumentFromBuilder(this.builder)!;
    this.compileAndPatch(); this.restoreSelection(this.selection); this.callbacks.onChange();
  }

  isSource(): boolean { return Boolean(this.source); }

  getDocument(): OnsiteDocument { return this.document; }
  getSelection(): CompositionSelection { return this.selection; }
  getSelectedCell(): OnsiteCell | null { const id = this.selection.kind === "step" ? (this.checklist && !this.source ? this.document.root.children!.find(cell=>cell.checklistRole===this.checklistView)!.id : this.document.root.id) : this.selection.cellId; return findCell(this.document, id); }
  getSelectedBlock(): OnsiteBlock | null { return this.selection.kind === "block" ? findBlock(this.document, this.selection.blockId) : null; }
  canUndo(): boolean { if (this.callbacks.canUndo) return this.callbacks.canUndo(); return this.historyIndex > 0 || this.historyIndex >= 0 && this.historyState() !== this.historyState(this.history[this.historyIndex]); }
  canRedo(): boolean { if (this.callbacks.canRedo) return this.callbacks.canRedo(); return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1 && this.historyState() === this.historyState(this.history[this.historyIndex]); }
  isComposing(): boolean { return this.composing; }
  getValidation(): string[] { if (this.source) { this.source.setContracts(this.survey?.step.questions, this.checklist?.items); return this.source.validate(this.document); } return [...validateOnsiteDocument(this.document).errors, ...(this.survey ? validateOnsiteSurveyDocument(this.document, this.surveyContext()!) : []), ...(this.checklist ? validateOnsiteChecklistDocument(this.document,this.checklist) : [])]; }

  /** Commits an already-reviewed AI proposal as one undoable transaction. */
  applyAiProposal(proposal: EditorAiProposal): boolean {
    if (this.guide || this.survey || this.checklist || this.composing || !this.beforeTransaction()) return false;
    try {
      this.document = applyEditorAiProposal(this.document, proposal);
      return this.commit(this.selection);
    } catch (error) {
      const previous = this.history[this.historyIndex]; if (previous) this.document = cloneOnsite(previous.document);
      this.callbacks.onValidation([error instanceof Error ? error.message : "AI proposal is invalid."]); return false;
    }
  }

  flush(): boolean {
    if (this.composing) return false;
    clearTimeout(this.compileTimer); this.compileTimer = 0;
    this.repairDocumentStructure();
    const state = this.historyState(); if (state === this.compiledState) return true;
    const errors = this.getValidation(); this.callbacks.onValidation(errors); if (errors.length) return false;
    try { const compiled = this.compile(); Object.assign(this.content, compiled.content); this.compiledState = state; this.callbacks.onTransaction?.(); return true; } catch (error) { this.callbacks.onValidation([error instanceof Error ? error.message : "Source edit failed."]); return false; }
  }

  snapshot(): { builder: WidgetBuilderState; content: ExperienceContent } { this.flush(); return { builder: cloneOnsite(this.builder), content: cloneOnsite(this.content) }; }

  undo(): void { if (this.callbacks.onUndo) { this.callbacks.onUndo(); return; } if (this.composing) return; if (!this.flush()) { clearTimeout(this.typingTimer); const current = this.history[this.historyIndex]; if (current) this.restore(current); return; } this.pushHistory(); if (!this.canUndo()) return; clearTimeout(this.typingTimer); this.historyIndex--; this.restore(this.history[this.historyIndex]); }
  redo(): void { if (this.callbacks.onRedo) { this.callbacks.onRedo(); return; } if (!this.canRedo() || this.composing) return; this.historyIndex++; this.restore(this.history[this.historyIndex]); }

  restoreSelection(selection: CompositionSelection): void {
    if (selection.kind === "block") {
      const cell = cellForBlock(this.document, selection.blockId);
      if (cell?.block) { this.select({ ...selection, cellId: cell.id, blockType: cell.block.type }); return; }
    } else if (selection.kind === "step" || findCell(this.document, selection.cellId)) { this.select(selection); return; }
    this.selectStep();
  }

  selectStep(): void { this.select({ kind: "step", label: "Step" }); }
  selectParent(): void {
    if (this.selection.kind === "block") {
      const cell = this.source?.componentIsCell(this.selection.cellId) ? parentCell(this.document, this.selection.cellId) : findCell(this.document, this.selection.cellId);
      cell ? this.select({ kind: "cell", label: "Cell", cellId: cell.id }) : this.selectStep(); return;
    }
    if (this.selection.kind === "cell") { const parent = parentCell(this.document, this.selection.cellId); parent ? this.select({ kind: "cell", label: "Parent cell", cellId: parent.id }) : this.selectStep(); }
  }
  selectChild(): void {
    if (this.selection.kind === "step") { this.select({ kind: "cell", label: "Root cell", cellId: this.document.root.id }); return; }
    if (this.selection.kind !== "cell") return; const cell = findCell(this.document, this.selection.cellId); if (!cell) return;
    if (cell.block) this.select({ kind: "block", label: BLOCK_LABEL[cell.block.type], cellId: cell.id, blockId: cell.block.id, blockType: cell.block.type }); else if (cell.children?.[0]) { const child = cell.children[0]; this.select(this.source && child.block ? { kind: "block", label: BLOCK_LABEL[child.block.type], cellId: child.id, blockId: child.block.id, blockType: child.block.type } : { kind: "cell", label: "Child cell", cellId: child.id }); }
  }

  insertBlock(type: OnsiteBlock["type"], insertion?: { cellId: string; edge: CellEdge }): boolean {
    const cell = this.getSelectedCell(); if (!cell || this.composing) return false;
    if (!this.beforeTransaction()) return false; const block = createBlock(type, this.guide);
    if (insertion) {
      // Validate a candidate first: canceled/invalid insertions never alter the saved tree.
      const candidate = cloneOnsite(this.document);
      const id = insertAdjacentCell(candidate, insertion.cellId, insertion.edge); if (!id) return false;
      findCell(candidate, id)!.block = block;
      const validation = this.source ? (() => { const errors = this.source.validate(candidate); return { valid: !errors.length, errors }; })() : validateOnsiteDocument(candidate); this.callbacks.onValidation(validation.errors); if (!validation.valid) return false;
      this.document = candidate;
      return this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: id, blockId: block.id, blockType: type });
    }
    if (cell.children) {
      const added = emptyCell(block); cell.children.push(added);
      return this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: added.id, blockId: block.id, blockType: type });
    }
    if (!cell.block) {
      cell.block = block;
      return this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: cell.id, blockId: block.id, blockType: type });
    }
    // Adding from a selected block inserts the new block after it instead of
    // silently replacing the author’s current content.
    const addedId = duplicateCell(this.document, cell.id) ?? splitCell(this.document, cell.id, "column");
    const added = addedId ? findCell(this.document, addedId) : null;
    if (!added) return false;
    delete added.children; added.block = block;
    return this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: added.id, blockId: block.id, blockType: type });
  }
  split(direction: "row" | "column"): boolean { const cell = this.getSelectedCell(); if (!cell || this.composing) return false; if (!this.beforeTransaction()) return false; const id = this.source ? insertAdjacentCell(this.document, cell.id, direction === "row" ? "right" : "bottom") : splitCell(this.document, cell.id, direction); if (!id) return false; return this.commit({ kind: "cell", label: direction === "row" ? "Right cell" : "Lower cell", cellId: id }); }
  addEdge(edge: "top" | "right" | "bottom" | "left"): void { if (this.composing) return; if (!this.beforeTransaction()) return; const id = insertEdgeCell(this.document, edge); this.commit({ kind: "cell", label: `${edge} cell`, cellId: id }); }
  duplicate(): boolean {
    const cell = this.getSelectedCell(); if (!cell || cell === this.document.root || this.composing) return false;
    if (!this.beforeTransaction()) return false;
    if (this.checklist && !this.source) {
      const duplicated=duplicateChecklistCell(this.document,this.checklist,cell.id);if(!duplicated){this.callbacks.onValidation(["Required Checklist components cannot be duplicated."]);return false;}
      this.document=duplicated.document;this.checklist.items=duplicated.items;this.commit({kind:"cell",label:"Duplicated cell",cellId:duplicated.cellId});return true;
    }
    if (this.survey && !this.source) {
      const duplicated = duplicateSurveyCell(this.document, this.survey.step.questions, cell.id); if (!duplicated) return false;
      this.document = duplicated.document; this.survey.step.questions = duplicated.questions;
      return this.commit({ kind: "cell", label: "Duplicated cell", cellId: duplicated.cellId });
    }
    const id = duplicateCell(this.document, cell.id); if (!id) return false; this.source?.duplicate(cell.id, id); return this.commit({ kind: "cell", label: "Duplicated cell", cellId: id });
  }
  remove(): boolean { const cell = this.getSelectedCell(); if (!cell || cell === this.document.root || this.composing) return false; if (!this.beforeTransaction()) return false;
    if (this.survey && listBlocks(cell).some(block => block.type === "survey_controls")) { this.callbacks.onValidation(["Keep the Survey navigation block so visitors can continue or submit."]); return false; }
    if(this.checklist && !this.source){
      const components=listBlocks(cell);if(cell.checklistRole||components.some(block=>block.type.startsWith("checklist_")&&block.type!=="checklist_task")){this.callbacks.onValidation(["Keep the required Checklist views and controls. You can style or move them within their view."]);return false;}
      const removedTasks=new Set(components.filter((block):block is Extract<OnsiteBlock,{type:"checklist_task"}>=>block.type==="checklist_task").map(block=>block.itemId));
      if(this.checklist.items.length-removedTasks.size<1){this.callbacks.onValidation(["Keep at least one task in this Checklist."]);return false;}
      this.checklist.items=this.checklist.items.filter(item=>!removedTasks.has(item.id));
    }
    const removed = new Set(listBlocks(cell).filter(block => block.type === "question").map(block => block.type === "question" ? block.questionId : ""));
    const parent = parentCell(this.document, cell.id); if (!(this.source ? this.source.removeCell(this.document, cell.id) : removeCell(this.document, cell.id))) return false;
    if (this.survey && !this.source) { this.survey.step.questions = this.survey.step.questions.filter(question => !removed.has(question.id)); if (this.survey.step.branching) this.survey.step.branching.rules = this.survey.step.branching.rules.filter(rule => !removed.has(rule.questionId)); } return this.commit(parent ? { kind: "cell", label: "Parent cell", cellId: parent.id } : { kind: "step", label: "Step" }); }
  move(delta: -1 | 1): boolean { const cell = this.getSelectedCell(); if (!cell || this.composing) return false; if (!this.beforeTransaction()) return false; if (!moveCell(this.document, cell.id, delta)) return false; return this.commit(this.selection); }

  /** Move the existing subtree; never regenerate its cell/block/action IDs. */
  moveTo(targetId: string, before = false, sourceId = this.moveSource ?? this.getSelectedCell()?.id): boolean {
    if (!sourceId || sourceId === targetId || this.composing) return false;
    const candidate = cloneOnsite(this.document); const source = findCell(candidate, sourceId); const target = findCell(candidate, targetId);
    const from = parentCell(candidate, sourceId); if (!source || !target || !from?.children || findCell({ ...candidate, root: source }, targetId)) return false;
    from.children.splice(from.children.indexOf(source), 1); if (!from.children.length) delete from.children;
    if (!target.block && !target.children) target.children = [source];
    else { const to = parentCell(candidate, targetId); if (!to?.children) return false; to.children.splice(to.children.indexOf(target) + (before ? 0 : 1), 0, source); }
    const validation = this.source ? (() => { const errors = this.source.validate(candidate); return { valid: !errors.length, errors }; })() : validateOnsiteDocument(candidate); this.callbacks.onValidation(validation.errors); if (!validation.valid) return false;
    if (!this.beforeTransaction()) return false; this.document = candidate; this.cancelMove();
    return this.commit(source.block ? { kind: "block", label: BLOCK_LABEL[source.block.type], cellId: source.id, blockId: source.block.id, blockType: source.block.type } : { kind: "cell", label: "Cell", cellId: source.id });
  }

  private checklistState(): OnsiteChecklistContext { const value=this.checklist!;return cloneOnsite({title:value.title,description:value.description,items:value.items,behavior:value.behavior,completionMessage:value.completionMessage}); }
  updateChecklistViewWidth(width:number):void{if(this.source||!this.checklist||!this.beforeTransaction())return;const view=this.document.root.children!.find(cell=>cell.checklistRole===this.checklistView)!;view.checklistWidth=width;this.commit(this.selection);}
  refreshChecklist():void {this.callbacks.onPatch?.();this.callbacks.onSelectionChange(this.selection);}
  setChecklistView(view: ChecklistView):void {this.checklistView=view;}
  getSelectedTask(): ChecklistItem | null {const block=this.getSelectedBlock();return block?.type==="checklist_task"?this.checklist?.items.find(item=>item.id===block.itemId)??null:null;}
  updateChecklist(update:(next:OnsiteChecklistContext)=>void):boolean {
    if(!this.checklist||!this.beforeTransaction())return false;const next=this.checklistState();update(next);
    if(!next.title.trim()||next.title.length>160||!next.completionMessage.title.trim()||!next.completionMessage.acknowledgeLabel.trim()||next.completionMessage.acknowledgeLabel.length>80||next.items.some(item=>!item.title.trim()||item.title.length>200||(item.description?.length??0)>1000||item.action.type==="none"&&item.completion.type!=="item_clicked")){this.callbacks.onValidation(["Use a title and valid task settings. Tasks without an action must complete when clicked."]);return false;}
    if (this.source) {
      try { this.source.synchronizeChecklist(next); this.document = this.source.getDocument(); }
      catch (error) { this.callbacks.onValidation([error instanceof Error ? error.message : "Checklist update failed."]); return false; }
    }
    Object.assign(this.checklist,next); return this.commit(this.selection);
  }
  insertTask(insertion?:{cellId:string;edge:CellEdge}): boolean {
    if(this.source||!this.checklist||this.checklist.items.length>=20||!this.beforeTransaction())return false;
    let container:OnsiteCell|undefined;const visit=(cell:OnsiteCell)=>{if(cell.checklistRole==="items")container=cell;cell.children?.forEach(visit);};visit(this.document.root);if(!container)return false;
    const item:ChecklistItem={id:onsiteId("item"),title:"New task",description:"Describe the next step.",action:{type:"none"},completion:{type:"item_clicked"}};
    let cell:OnsiteCell;
    if(insertion){let target=findCell(this.document,insertion.cellId);while(target&&target!==container)target=parentCell(this.document,target.id);if(!target){this.callbacks.onValidation(["Insert tasks inside the Expanded task list."]);return false;}const id=insertAdjacentCell(this.document,insertion.cellId,insertion.edge);if(!id)return false;cell=findCell(this.document,id)!;cell.block={id:onsiteId("block"),type:"checklist_task",itemId:item.id,fontSize:14,indicator:"check"};}
    else{cell=emptyCell({id:onsiteId("block"),type:"checklist_task",itemId:item.id,fontSize:14,indicator:"check"});container.children!.push(cell);}
    cell.sizing={mode:"hug"};this.checklist.items.push(item);
    this.checklistView="expanded";this.commit({kind:"block",label:"Task",cellId:cell.id,blockId:cell.block!.id,blockType:"checklist_task"});return true;
  }
  private surveyContext() { return this.survey ? { questions: this.survey.step.questions, submitLabel: this.survey.config.submitLabel } : undefined; }
  private historyState(entry?: Pick<HistoryEntry, "document" | "questions" | "branching" | "checklist">): string { return JSON.stringify(this.checklist ? {document:entry?.document??this.document,checklist:entry?entry.checklist:this.checklistState()} : this.survey ? (entry ? { document: entry.document, questions: entry.questions, branching: entry.branching } : { document: this.document, questions: this.survey.step.questions, branching: this.survey.step.branching }) : entry?.document ?? this.document); }
  getSelectedQuestion(): SurveyQuestion | null { const block = this.getSelectedBlock(); return block?.type === "question" ? this.survey?.step.questions.find(question => question.id === block.questionId) ?? null : null; }
  refreshSurvey(): void { if (this.source) { this.source.refresh(); this.document = this.source.getDocument(); } this.compileAndPatch(); this.select(this.selection); }

  insertQuestion(type: SurveyQuestion["type"], insertion?: { cellId: string; edge: CellEdge }): boolean {
    if (this.source || !this.survey || !QUESTION_TYPES.includes(type) || this.survey.step.questions.length >= 20 || !this.beforeTransaction()) return false;
    const selected = this.getSelectedCell(); if (!selected) return false;
    const candidate = cloneOnsite(this.document), question = newSurveyQuestion(type);
    const block: OnsiteBlock = { id: onsiteId("block"), type: "question", questionId: question.id, fontSize: 14 };
    let cell = findCell(candidate, selected.id)!;
    if (insertion) { const id = insertAdjacentCell(candidate, insertion.cellId, insertion.edge); if (!id) return false; cell = findCell(candidate, id)!; }
    else if (cell.children) { const added = emptyCell(); cell.children.push(added); cell = added; }
    else if (cell.block) { const id = insertAdjacentCell(candidate, cell.id, "bottom"); if (!id) return false; cell = findCell(candidate, id)!; }
    cell.block = block; cell.sizing = { mode: "hug" };
    const questions = [...this.survey.step.questions, question];
    const errors = [...validateOnsiteDocument(candidate).errors, ...validateOnsiteSurveyDocument(candidate, { questions })];
    if (errors.length) { this.callbacks.onValidation(errors); return false; }
    this.document = candidate; this.survey.step.questions = questions;
    return this.commit({ kind: "block", label: "Question", cellId: cell.id, blockId: block.id, blockType: block.type });
  }

  updateStepHeading(label: string): boolean {
    if (!this.survey || !this.beforeTransaction()) return false;
    const heading = listBlocks(this.document.root).find(block => block.type === "heading");
    if (heading?.type !== "heading") { this.callbacks.onValidation(["Insert a Heading block to set the step heading."]); return false; }
    heading.html = escapeHtmlAttribute(label.slice(0, 160)); return this.commit(this.selection);
  }

  updateBranching(branching: NonNullable<SurveyStep["branching"]>): boolean {
    if (!this.survey || !this.beforeTransaction()) return false;
    const step = { ...this.survey.step, branching: cloneOnsite(branching) };
    const errors = surveyBranchErrors({ ...this.survey.config, steps: this.survey.config.steps.map(value => value.id === step.id ? step : value) });
    if (errors.length) { this.callbacks.onValidation(errors); return false; }
    this.survey.step.branching = step.branching; return this.commit(this.selection);
  }

  updateQuestion(question: SurveyQuestion): boolean {
    const current = this.getSelectedQuestion(); if (!this.survey || !current || current.id !== question.id || !this.beforeTransaction()) return false;
    const questions = this.survey.step.questions.map(value => value.id === question.id ? cloneOnsite(question) : value);
    const errors = surveyQuestionErrors(questions); if (errors.length) { this.callbacks.onValidation(errors); return false; }
    if (this.source) {
      try { this.source.synchronizeQuestion(question, current, questions); this.document = this.source.getDocument(); }
      catch (error) { this.callbacks.onValidation([error instanceof Error ? error.message : "Question update failed."]); return false; }
    }
    this.survey.step.questions = questions;
    if (this.survey.step.branching) this.survey.step.branching.rules = this.survey.step.branching.rules.filter(rule => {
      if (rule.questionId !== question.id) return true;
      const step = { ...this.survey!.step, branching: { rules: [rule] } };
      return !surveyBranchErrors({ ...this.survey!.config, steps: this.survey!.config.steps.map(value => value.id === step.id ? step : value) }).length;
    });
    return this.commit(this.selection);
  }

  updateCell(update: Partial<Pick<OnsiteCell, "direction" | "align" | "justify" | "gap" | "padding" | "style" | "responsiveStack">> & { sizing?: OnsiteSizing }): void {
    const cell = this.getSelectedCell(); if (!cell || this.composing) return; if (!this.beforeTransaction()) return; Object.assign(cell, cloneOnsite(update)); this.commit(this.selection);
  }
  updateBlock(update: Partial<OnsiteBlock>): void {
    const block = this.getSelectedBlock(); if (!block || this.composing) return; if (!this.beforeTransaction()) return; Object.assign(block, cloneOnsite(update)); this.commit(this.selection);
  }
  chooseImageFile(blockId?: string): void {
    const block = blockId ? findBlock(this.document, blockId) : this.getSelectedBlock(); if (block?.type !== "image" || this.destroyed) return;
    this.imageFileTarget = block.id; this.imageInput.value = ""; this.imageInput.click();
  }

  setImageSource(src: string): boolean {
    if (this.getSelectedBlock()?.type !== "image") return false;
    if (!onsiteImageSourceIsSafe(src)) { this.callbacks.onValidation(["Use an HTTP(S) image URL, a /path on your site, or choose an image file."]); return false; }
    this.callbacks.onValidation([]); this.updateBlock({ src } as Partial<OnsiteBlock>); return true;
  }

  async setImageFile(file: File, blockId?: string): Promise<boolean> {
    const block = blockId ? findBlock(this.document, blockId) : this.getSelectedBlock(); if (block?.type !== "image" || this.destroyed) return false;
    const request = ++this.imageRequest; const id = block.id; const previousSrc = block.src;
    const placeholder = this.surface?.querySelector<HTMLButtonElement>(`[data-movcues-image-placeholder][data-movcues-block-id="${id}"]`);
    if (placeholder) { placeholder.disabled = true; placeholder.setAttribute("aria-busy", "true"); }
    this.callbacks.onImageStatus?.("Preparing image…");
    try {
      const src = await prepareImageFile(file);
      if (this.destroyed || request !== this.imageRequest) return false;
      const current = findBlock(this.document, id); if (current?.type !== "image" || current.src !== previousSrc) return false;
      const candidate = cloneOnsite(this.document); const image = findBlock(candidate, id); if (image?.type !== "image") return false; image.src = src;
      const validation = this.source ? (() => { const errors = this.source.validate(candidate); return { valid: !errors.length, errors }; })() : validateOnsiteDocument(candidate); this.callbacks.onValidation(validation.errors); if (!validation.valid) return false;
      if (!this.flush()) return false;
      this.document = candidate; return this.commit(this.selection);
    } catch (error) {
      if (!this.destroyed && request === this.imageRequest) this.callbacks.onValidation([error instanceof Error ? error.message : "Image could not be added. Try another file."]);
      return false;
    } finally {
      if (placeholder) { placeholder.disabled = false; placeholder.removeAttribute("aria-busy"); }
      if (!this.destroyed && request === this.imageRequest) this.callbacks.onImageStatus?.("");
      this.imageInput.value = "";
    }
  }
  updateButtonAction(action: { type: "next_step" | "previous_step" | "dismiss" } | { type: "open_url"; url: string } | { type: "track_event"; eventName: string }): void { const block = this.getSelectedBlock(); if (block?.type !== "button") return; if (!this.beforeTransaction()) return; block.action = { id: block.action.id, ...action } as OnsiteButtonAction; this.commit(this.selection); }
  editSelected(): void { if (this.selection.kind !== "block") return; const block = this.getSelectedBlock(); if (!block || !["heading", "text", "button"].includes(block.type)) return; const element = this.surface?.querySelector<HTMLElement>(`[data-movcues-block-id="${block.id}"]`); if (element) { element.contentEditable = "true"; element.focus(); } }
  setAlignment(align: "left" | "center" | "right"): void { this.updateBlock({ align } as Partial<OnsiteBlock>); }
  formatInline(tag: "strong" | "em" | "u"): boolean { return this.wrapSelection(tag); }
  toggleList(tag: "ul" | "ol"): boolean { const block = this.getSelectedBlock(); if (block?.type !== "text" || this.composing) return false; if (!this.beforeTransaction()) return false; const current = block.html.trim(); block.html = current.startsWith(`<${tag}>`) ? current.replace(new RegExp(`^<${tag}><li>|</li></${tag}>$`, "g"), "") : `<${tag}><li>${current}</li></${tag}>`; return this.commit(this.selection); }
  applyLink(url: string): boolean { if (!builderLinkUrlIsSafe(url)) return false; return this.wrapSelection("a", url); }

  private wrapSelection(tag: "strong" | "em" | "u" | "a", href?: string): boolean {
    if (this.composing) return false;
    const block = this.getSelectedBlock(); if (!block || (block.type !== "heading" && block.type !== "text")) return false; const element = this.surface?.querySelector<HTMLElement>(`[data-movcues-block-id="${block.id}"]`); if (!element) return false;
    if (!this.beforeTransaction()) return false;
    if (this.savedRange && element.contains(this.savedRange.commonAncestorContainer)) { setEditorRange(this.root, this.savedRange); }
    const range = editorRange(this.root); const selectedInside = range && element.contains(range.commonAncestorContainer) && !range.collapsed;
    if (tag === "a" && (selectedInside ? range?.cloneContents().querySelector("a") || range?.startContainer.parentElement?.closest("a") || range?.endContainer.parentElement?.closest("a") : element.querySelector("a"))) return false;
    if (selectedInside && range) { const wrapper = document.createElement(tag); if (tag === "a" && href) { wrapper.setAttribute("href", href); if (/^https?:\/\//i.test(href)) { wrapper.setAttribute("target", "_blank"); wrapper.setAttribute("rel", "noopener noreferrer"); } } try { range.surroundContents(wrapper); } catch { wrapper.append(range.extractContents()); range.insertNode(wrapper); } block.html = this.source ? element.innerHTML : sanitizeRichText(element.innerHTML); }
    else { const open = tag === "a" ? `<a href="${escapeHtmlAttribute(href ?? "")}"${/^https?:\/\//i.test(href ?? "") ? ' target="_blank" rel="noopener noreferrer"' : ""}>` : `<${tag}>`; block.html = `${open}${block.html}</${tag}>`; }
    if (!selectedInside) element.innerHTML = block.html;
    element.contentEditable = "true"; element.focus({ preventScroll: true });
    this.rememberSelection(); this.flush(); this.pushHistory(); this.callbacks.onChange(); this.positionTools(); return true;
  }

  rememberSelection = (): void => { const range = editorRange(this.root); if (range && this.surface?.contains(range.commonAncestorContainer)) this.savedRange = range.cloneRange(); };

  private select(selection: CompositionSelection): void {
    this.closePalette();
    this.selection = selection; this.surface?.querySelectorAll("[data-movcues-editor-selected]").forEach(element => element.removeAttribute("data-movcues-editor-selected"));
    const target = selection.kind === "block" ? this.surface?.querySelector(`[data-movcues-block-id="${selection.blockId}"]`) : selection.kind === "cell" ? this.surface?.querySelector(`[data-movcues-node-id="${selection.cellId}"]`) : this.surface?.querySelector(".movcues-widget");
    target?.setAttribute("data-movcues-editor-selected", selection.kind); this.syncToolbarState(); this.callbacks.onSelectionChange(selection); this.renderResizeHandles(); this.positionTools();
  }

  private beforeTransaction(): boolean { clearTimeout(this.typingTimer); this.repairDocumentStructure(); if (!this.flush()) return false; this.pushHistory(); return true; }
  private commit(selection: CompositionSelection): boolean {
    this.repairDocumentStructure();
    if(this.checklist && !this.source){const byId=new Map(this.checklist.items.map(item=>[item.id,item]));this.checklist.items=listBlocks(this.document.root).filter((block):block is Extract<OnsiteBlock,{type:"checklist_task"}>=>block.type==="checklist_task").map(block=>byId.get(block.itemId)!).filter(Boolean);}
    const errors = this.getValidation(); const validation = { valid: !errors.length, errors };
    if (!validation.valid) { const previous = this.history[this.historyIndex]; if (previous) { this.document = cloneOnsite(previous.document); if(this.checklist&&previous.checklist)Object.assign(this.checklist,cloneOnsite(previous.checklist)); if (this.survey && previous.questions) { this.survey.step.questions = cloneOnsite(previous.questions); this.survey.step.branching = previous.branching ? cloneOnsite(previous.branching) : undefined; } this.compileAndPatch(); this.select(previous.selection); } this.callbacks.onValidation(validation.errors); return false; }
    if (this.historyState() === this.compiledState) { this.select(selection); return true; }
    this.selection = selection; this.compileAndPatch(); this.pushHistory(); this.callbacks.onChange(); this.select(selection); return true;
  }
  private compileAndPatch(): void {
    const compiled = this.compile(); Object.assign(this.content, compiled.content);
    this.compiledState = this.historyState();
    const template = document.createElement("template"); template.innerHTML = compiled.html; this.surface?.replaceChildren(...Array.from(template.content.childNodes));
    if (this.surface) this.source?.prepareSurface(this.surface);
    this.imagePlaceholders.clear();
    this.surface?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-movcues-question-input]").forEach(input => { input.readOnly = true; input.tabIndex = -1; });
    this.savedRange = null;
    this.surface?.querySelectorAll<HTMLElement>("[data-movcues-node-id]").forEach(cell => {
      cell.tabIndex = 0; if (!cell.hasAttribute("data-movcues-block-id")) cell.setAttribute("aria-label", "Layout cell");
      if (!cell.children.length && !cell.hasAttribute("data-movcues-block-id")) { const add = document.createElement("button"); add.type = "button"; add.dataset.movcuesEmptyCell = ""; add.textContent = "+ Add content"; cell.append(add); }
    });
    this.surface?.querySelectorAll<HTMLImageElement>('img[data-movcues-block-id][src=""]').forEach(image => {
      const placeholder = document.createElement("button"); placeholder.type = "button"; placeholder.className = image.className;
      placeholder.dataset.movcuesBlockId = image.dataset.movcuesBlockId; if (image.dataset.movcuesNodeId) placeholder.dataset.movcuesNodeId = image.dataset.movcuesNodeId; placeholder.dataset.movcuesImagePlaceholder = "";
      placeholder.setAttribute("aria-label", "Choose image");
      placeholder.innerHTML = '<svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg><span>Drop an image or click to browse</span>';
      image.replaceWith(placeholder); this.imagePlaceholders.set(placeholder, image);
    });
    const style = this.root.querySelector<HTMLStyleElement>("style[data-movcues-builder-style]"); if (style) style.textContent = `${compiled.css}\n[data-movcues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movcues-builder-surface]>.movcues-widget{position:relative!important;inset:auto!important}`;
    this.callbacks.onPatch?.();
  }
  private scheduleCompile(): void { clearTimeout(this.compileTimer); this.compileTimer = window.setTimeout(() => { if (!this.destroyed && !this.composing) this.flush(); }, 160); }

  private compile() { return this.source ? this.source.apply(this.document) : applyOnsiteDocument(this.builder, this.document, this.widgetType, this.surveyContext(), this.checklist); }

  private repairDocumentStructure(): boolean {
    if (this.source) return false;
    let repaired = false; const blockIds = new Set<string>();
    const repair = (cell: OnsiteCell): void => {
      if (cell.children && cell.block) {
        const block = cell.block; delete cell.block;
        // Keep a single copy when an earlier malformed mutation stored the same
        // block both on a layout cell and within one of its descendants.
        if (!cell.children.some(child => listBlocks(child).some(candidate => candidate.id === block.id))) cell.children.unshift(emptyCell(block));
        repaired = true;
      }
      cell.children?.forEach(repair);
      if (!cell.block) return;
      if (blockIds.has(cell.block.id)) {
        cell.block.id = onsiteId("block");
        if (cell.block.type === "button") cell.block.action.id = onsiteId("action");
        repaired = true;
      }
      blockIds.add(cell.block.id);
    };
    repair(this.document.root); return repaired;
  }

  private pushHistory(): void {
    const document = cloneOnsite(this.document), questions = this.survey ? cloneOnsite(this.survey.step.questions) : undefined, branching = this.survey?.step.branching ? cloneOnsite(this.survey.step.branching) : undefined; const bytes = this.historyState().length; const entry = { source: this.source?.snapshot(), document, questions, branching, checklist:this.checklist?this.checklistState():undefined, selection: cloneOnsite(this.selection), bytes };
    if (this.historyIndex >= 0 && this.historyState(this.history[this.historyIndex]) === this.historyState()) return;
    if (this.callbacks.onUndo) { this.history = [entry]; this.historyIndex = 0; this.historyBytes = bytes; return; }
    if (this.historyIndex < this.history.length - 1) { this.historyBytes -= this.history.slice(this.historyIndex + 1).reduce((sum, item) => sum + item.bytes, 0); this.history.splice(this.historyIndex + 1); }
    this.history.push(entry); this.historyBytes += bytes;
    while (this.history.length > HISTORY_LIMIT || this.historyBytes > HISTORY_BYTES) { const removed = this.history.shift(); this.historyBytes -= removed?.bytes ?? 0; }
    this.historyIndex = this.history.length - 1;
  }
  private restore(entry: HistoryEntry): void { this.document = cloneOnsite(entry.document); if (this.source && entry.source) this.source.restore(entry.source, this.document); if(this.checklist&&entry.checklist)Object.assign(this.checklist,cloneOnsite(entry.checklist)); if (this.survey && entry.questions) { this.survey.step.questions = cloneOnsite(entry.questions); this.survey.step.branching = entry.branching ? cloneOnsite(entry.branching) : undefined; } this.compileAndPatch(); this.selection = cloneOnsite(entry.selection); this.callbacks.onChange(); this.select(this.selection); }

  private onSurfaceClick = (event: Event): void => {
    const element = event.target instanceof Element ? event.target : null; if (!element) return;
    const blockElement = element.closest<HTMLElement>("[data-movcues-block-id]"); const cellElement = element.closest<HTMLElement>("[data-movcues-node-id]");
    if (this.moveSource && cellElement) { event.preventDefault(); event.stopImmediatePropagation(); this.moveTo(cellElement.dataset.movcuesNodeId!); return; }
    if (blockElement && cellElement) { const block = findBlock(this.document, blockElement.dataset.movcuesBlockId!); if (block) this.select({ kind: "block", label: BLOCK_LABEL[block.type], cellId: cellElement.dataset.movcuesNodeId!, blockId: block.id, blockType: block.type }); }
    else if (cellElement) this.select({ kind: "cell", label: "Cell", cellId: cellElement.dataset.movcuesNodeId! }); else this.selectStep();
    if (blockElement?.hasAttribute("data-movcues-image-placeholder")) this.chooseImageFile(blockElement.dataset.movcuesBlockId);
    if (element.closest("[data-movcues-empty-cell]")) this.openPalette(element.closest<HTMLElement>("[data-movcues-empty-cell]")!);
    if (blockElement?.matches("button,a")) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  private onImageDragOver = (event: DragEvent): void => {
    if (this.moveSource && event.dataTransfer?.types.includes("application/x-movcues-cell")) {
      event.preventDefault(); event.stopPropagation(); this.clearImageDrop();
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-movcues-node-id]") : null;
      const source = findCell(this.document, this.moveSource);
      if (target && source && target.dataset.movcuesNodeId !== this.document.root.id && !findCell({ ...this.document, root: source }, target.dataset.movcuesNodeId!)) {
        this.imageDropTarget = target; const row = parentCell(this.document, target.dataset.movcuesNodeId!)?.direction === "row"; target.setAttribute("data-movcues-insertion-edge", this.dropBefore(target, event) ? row ? "left" : "top" : row ? "right" : "bottom"); event.dataTransfer.dropEffect = "move";
      } else event.dataTransfer.dropEffect = "none";
      return;
    }
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-movcues-block-id]") : null;
    const block = target ? findBlock(this.document, target.dataset.movcuesBlockId!) : null;
    this.clearImageDrop(); event.dataTransfer.dropEffect = block?.type === "image" ? "copy" : "none";
    if (target && block?.type === "image") { this.imageDropTarget = target; target.setAttribute("data-movcues-image-drop", ""); }
  };
  private onImageDragLeave = (event: DragEvent): void => {
    if (!(event.relatedTarget instanceof Node) || !this.imageDropTarget?.contains(event.relatedTarget)) this.clearImageDrop();
  };
  private clearImageDrop(): void { this.imageDropTarget?.removeAttribute("data-movcues-image-drop"); this.imageDropTarget?.removeAttribute("data-movcues-insertion-edge"); this.imageDropTarget = null; }
  private dropBefore(target: HTMLElement, event: DragEvent): boolean { const rect = target.getBoundingClientRect(); const parent = parentCell(this.document, target.dataset.movcuesNodeId!); return parent?.direction === "row" ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2; }
  private onMoveDragStart = (event: DragEvent): void => { if (!(event.target instanceof Element) || !event.target.closest('[data-command="move"]')) return; const cell = this.getSelectedCell(); if (!cell || cell === this.document.root || !event.dataTransfer) { event.preventDefault(); return; } this.moveSource = cell.id; event.dataTransfer.setData("application/x-movcues-cell", cell.id); event.dataTransfer.effectAllowed = "move"; };
  private cancelMove = (): void => { this.moveSource = null; this.clearImageDrop(); this.surface?.removeAttribute("data-movcues-moving"); this.toolbar.querySelector('[data-command="move"]')?.setAttribute("aria-pressed", "false"); };
  private onImageDrop = (event: DragEvent): void => {
    if (this.moveSource && event.dataTransfer?.types.includes("application/x-movcues-cell")) { event.preventDefault(); event.stopPropagation(); const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-movcues-node-id]") : null; if (target) this.moveTo(target.dataset.movcuesNodeId!, this.dropBefore(target, event)); this.cancelMove(); return; }
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault(); event.stopPropagation(); this.clearImageDrop();
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-movcues-block-id]") : null;
    const block = target ? findBlock(this.document, target.dataset.movcuesBlockId!) : null;
    if (block?.type !== "image") { this.callbacks.onValidation(["Drop the file onto an image block."]); return; }
    if (event.dataTransfer.files.length !== 1) { this.callbacks.onValidation(["Choose one image at a time."]); return; }
    void this.setImageFile(event.dataTransfer.files[0], block.id);
  };
  private onDoubleClick = (event: Event): void => { const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-movcues-block-id]") : null; const block = element ? findBlock(this.document, element.dataset.movcuesBlockId!) : null; if (element && (block?.type === "heading" || block?.type === "text" || block?.type === "button")) { element.contentEditable = "true"; element.focus(); } };
  private onInput = (event: Event): void => { const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-movcues-block-id]") : null; const block = element ? findBlock(this.document, element.dataset.movcuesBlockId!) : null; if (!block || !element) return; if (block.type === "heading" || block.type === "text") block.html = this.source ? element.innerHTML : sanitizeRichText(element.innerHTML); else if (block.type === "button") { this.source?.captureButtonHtml(block.id, element.innerHTML); block.label = (element.textContent ?? "").slice(0, this.source ? 10_000 : 80); } else return; this.scheduleCompile(); this.positionTools(); this.callbacks.onChange(true); clearTimeout(this.typingTimer); this.typingTimer = window.setTimeout(() => this.pushHistory(), 300); };
  private onBlur = (event: Event): void => { const element = event.target instanceof HTMLElement ? event.target : null; if (element?.isContentEditable) { this.rememberSelection(); if ((event as FocusEvent).relatedTarget) element.contentEditable = "false"; this.flush(); this.pushHistory(); } };
  private onCompositionStart = (): void => { this.composing = true; };
  private onCompositionEnd = (): void => { this.composing = false; this.scheduleCompile(); };
  private onSurfaceKeyDown = (event: KeyboardEvent): void => {
    if (this.composing) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (event.key === "Escape") { this.cancelMove(); if (target?.isContentEditable) target.blur(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && target?.isContentEditable) {
      event.preventDefault(); const range = document.createRange(); range.selectNodeContents(target);
      setEditorRange(this.root, range); this.savedRange = range.cloneRange(); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.stopImmediatePropagation(); event.shiftKey ? this.redo() : this.undo(); return; }
    if ((event.ctrlKey || event.metaKey) && ["b", "i", "u"].includes(event.key.toLowerCase())) { event.preventDefault(); this.rememberSelection(); this.formatInline(event.key.toLowerCase() === "b" ? "strong" : event.key.toLowerCase() === "i" ? "em" : "u"); return; }
    if (this.source && event.key === "Enter" && target?.isContentEditable && ["heading", "text"].includes(this.getSelectedBlock()?.type ?? "")) {
      const range = editorRange(this.root);
      if (range && target.contains(range.commonAncestorContainer)) { event.preventDefault(); const br = document.createElement("br"); range.deleteContents(); range.insertNode(br); range.setStartAfter(br); range.collapse(true); setEditorRange(this.root, range); target.dispatchEvent(new Event("input", { bubbles: true })); return; }
    }
    if (target?.isContentEditable) return;
    if (this.moveSource && event.key === "Tab" && target?.hasAttribute("data-movcues-node-id")) {
      const destinations = this.moveDestinations(); const index = destinations.indexOf(target);
      destinations[(index + (event.shiftKey ? -1 : 1) + destinations.length) % destinations.length]?.focus({ preventScroll: true }); event.preventDefault(); return;
    }
    if (event.key === "Enter" && target?.matches("[data-movcues-node-id]")) { event.preventDefault(); if (this.moveSource) this.moveTo(target.dataset.movcuesNodeId!); else target.click(); }
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); this.move(event.key === "ArrowUp" ? -1 : 1); }
    else if (event.ctrlKey || event.metaKey) { if (event.key === "ArrowUp") { this.selectParent(); event.preventDefault(); } if (event.key === "ArrowDown") { this.selectChild(); event.preventDefault(); } }
  };
  private onPaste = (event: ClipboardEvent): void => { const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[contenteditable="true"]') : null; if (!target || !event.clipboardData) return; const range = editorRange(this.root); if (!range || !target.contains(range.commonAncestorContainer)) return; event.preventDefault(); const text = document.createTextNode(event.clipboardData.getData("text/plain")); range.deleteContents(); range.insertNode(text); range.setStartAfter(text); range.collapse(true); setEditorRange(this.root, range); target.dispatchEvent(new Event("input", { bubbles: true })); };

  private moveDestinations(): HTMLElement[] {
    const source = this.moveSource ? findCell(this.document, this.moveSource) : null;
    return source ? Array.from(this.surface?.querySelectorAll<HTMLElement>("[data-movcues-node-id]") ?? []).filter(cell => cell.dataset.movcuesNodeId !== this.document.root.id && !findCell({ ...this.document, root: source }, cell.dataset.movcuesNodeId!)) : [];
  }

  private onToolbarClick = (event: Event): void => { const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-command]") : null; if (!button || button.disabled) return; event.preventDefault(); event.stopPropagation(); const command = button.dataset.command; if (command === "add") { if (this.palette.hidden) this.openPalette(button); else this.closePalette(); } else if (command === "columns") this.split("row"); else if (command === "rows") this.split("column"); else if (command === "parent") this.selectParent(); else if (command === "duplicate") this.duplicate(); else if (command === "delete") this.remove(); else if (command === "move-up") this.move(-1); else if (command === "move-down") this.move(1); else if (command === "move") { if (this.moveSource) this.cancelMove(); else { this.moveSource = this.getSelectedCell()?.id ?? null; this.surface?.setAttribute("data-movcues-moving", ""); button.setAttribute("aria-pressed", "true"); button.title = "Choose a destination cell, or press Escape to cancel"; if ((event as MouseEvent).detail === 0) this.moveDestinations()[0]?.focus({ preventScroll: true }); } } };
  private onPaletteClick = (event: Event): void => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-insert-block],[data-insert-question],[data-insert-task]") : null; if (!button) return;
    event.preventDefault(); event.stopPropagation();
    if (button.hasAttribute("data-insert-task") ? this.insertTask(this.insertion ?? undefined) : button.dataset.insertQuestion ? this.insertQuestion(button.dataset.insertQuestion as SurveyQuestion["type"], this.insertion ?? undefined) : this.insertBlock(button.dataset.insertBlock as OnsiteBlock["type"], this.insertion ?? undefined)) {
      this.closePalette();
      const block = this.getSelectedBlock(); const element = block ? this.surface?.querySelector<HTMLElement>(`[data-movcues-block-id="${block.id}"]`) : null;
      if (element) { element.tabIndex = -1; element.focus({ preventScroll: true }); }
    }
  };

  private openPalette(anchor: HTMLElement, insertion: { cellId: string; edge: CellEdge } | null = null): void {
    this.closePalette(); this.insertion = insertion; this.paletteAnchor = anchor; this.palette.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    if (insertion) this.surface?.querySelector<HTMLElement>(`[data-movcues-node-id="${insertion.cellId}"]`)?.setAttribute("data-movcues-insertion-edge", insertion.edge);
    this.positionTools(); this.palette.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }
  private closePalette(): void {
    this.palette.hidden = true; this.paletteAnchor?.setAttribute("aria-expanded", "false"); this.paletteAnchor = null; this.insertion = null;
    this.surface?.querySelectorAll("[data-movcues-insertion-edge]").forEach(element => element.removeAttribute("data-movcues-insertion-edge"));
  }
  private dismissPalette = (event: Event): void => {
    if (!this.palette.hidden && !event.composedPath().some(node => node === this.palette || node === this.paletteAnchor)) this.closePalette();
  };
  private onPaletteKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.moveSource) { this.cancelMove(); event.preventDefault(); }
    if (event.key !== "Escape" || this.palette.hidden) return;
    const anchor = this.paletteAnchor; this.closePalette(); anchor?.focus({ preventScroll: true }); event.preventDefault();
  };

  private syncToolbarState(): void {
    const cell = this.getSelectedCell(); const atRoot = !cell || cell === this.document.root;
    for (const command of ["delete", "duplicate", "move"] as const) {
      const button = this.toolbar.querySelector<HTMLButtonElement>(`[data-command="${command}"]`); if (!button) continue;
      const protectedSource = cell && this.source?.isProtected(cell.id); button.disabled = atRoot || Boolean(protectedSource); button.title = protectedSource ? "Protected functional structure is preserved; its visual styles remain editable" : atRoot ? "Select an element to use this action" : command === "delete" ? "Delete selected element (Undo is available)" : "Duplicate";
    }
  }

  private positionTools = (): void => {
    cancelAnimationFrame(this.toolFrame); this.toolFrame = requestAnimationFrame(() => { if (!this.destroyed) this.updateToolPositions(); });
  };

  private updateToolPositions(): void {
    const cell = this.getSelectedCell(); const target = cell ? this.surface?.querySelector<HTMLElement>(`[data-movcues-node-id="${cell.id}"]`) : null;
    const widget = this.surface?.querySelector<HTMLElement>(".movcues-widget");
    if (!target || !widget) { this.toolbar.hidden = true; this.edgeButtons.forEach(button => { button.hidden = true; }); this.closePalette(); return; }
    const rect = target.getBoundingClientRect(); const bounds = this.availableCanvasBounds();
    const visible = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    this.toolbar.hidden = !visible; this.edgeButtons.forEach(button => { button.hidden = !visible; }); if (!visible) { this.closePalette(); return; }
    // Anchor the toolbar to the whole widget, never to an interior text block.
    this.toolbar.style.maxWidth = `${bounds.right - bounds.left}px`;
    const toolbarRect = this.toolbar.getBoundingClientRect(); const widgetRect = widget.getBoundingClientRect();
    const point = placeOutside(widgetRect, toolbarRect, bounds);
    this.toolbar.style.transform = `translate(${point.left}px,${point.top}px)`;
    // A constrained leaf can be shorter than its text. Keep insertion buttons
    // outside both boxes so selecting text never moves a button under the caret.
    const blockRect = cell?.block ? target.querySelector<HTMLElement>("[data-movcues-block-id]")?.getBoundingClientRect() : null;
    const edges = { left: Math.min(rect.left, blockRect?.left ?? rect.left), right: Math.max(rect.right, blockRect?.right ?? rect.right), top: Math.min(rect.top, blockRect?.top ?? rect.top), bottom: Math.max(rect.bottom, blockRect?.bottom ?? rect.bottom) };
    for (const button of this.edgeButtons) {
      const edge = button.dataset.movcuesInsertEdge;
      const x = edge === "left" ? edges.left - 16 : edge === "right" ? edges.right + 16 : (edges.left + edges.right) / 2;
      const y = edge === "top" ? edges.top - 16 : edge === "bottom" ? edges.bottom + 16 : (edges.top + edges.bottom) / 2;
      button.style.transform = `translate(${Math.max(2, Math.min(innerWidth - 26, x - 12))}px,${Math.max(2, Math.min(innerHeight - 26, y - 12))}px)`;
    }
    if (!this.palette.hidden && this.paletteAnchor) {
      const palettePoint = placeOutside(this.paletteAnchor.getBoundingClientRect(), this.palette.getBoundingClientRect(), bounds);
      this.palette.style.transform = `translate(${palettePoint.left}px,${palettePoint.top}px)`;
    }
    this.positionHandles();
  }

  private availableCanvasBounds(): { left: number; right: number; top: number; bottom: number } {
    const inset = 6; const editorRoot = document.querySelector("[data-movcues-editor]")?.shadowRoot; const panel = editorRoot?.querySelector<HTMLElement>("aside")?.getBoundingClientRect();
    const controls = editorRoot?.querySelector<HTMLElement>("[data-editor-toolbar]")?.getBoundingClientRect();
    let left = inset; let right = innerWidth - inset; let top = inset; let bottom = innerHeight - inset;
    if (panel && panel.width > 0 && panel.height > 0) {
      if (panel.left < innerWidth / 2 && innerWidth - panel.right > 240) left = Math.max(left, panel.right + inset);
      else if (panel.left >= innerWidth / 2 && panel.left > 240) right = Math.min(right, panel.left - inset);
      else if (panel.width > innerWidth / 2) bottom = Math.min(bottom, panel.top - inset);
    }
    if (controls && controls.height > 0) top = Math.max(top, controls.bottom + inset);
    return { left, right: Math.max(left, right), top, bottom: Math.max(top + 36, bottom) };
  }

  private renderResizeHandles(): void {
    this.handles.forEach(handle => handle.remove()); this.handles = [];
    const cell = this.getSelectedCell(); const parent = cell ? parentCell(this.document, cell.id) : null; if (!cell || !parent?.children || this.source && !this.source.canResize(parent.id)) return;
    const index = parent.children.indexOf(cell);
    for (const firstIndex of [index - 1, index]) {
      const first = parent.children[firstIndex]; const second = parent.children[firstIndex + 1]; if (!first || !second) continue;
      const handle = document.createElement("button"); handle.type = "button"; handle.dataset.movcuesResizeHandle = parent.direction; handle.dataset.first = first.id; handle.dataset.second = second.id;
      handle.textContent = parent.direction === "row" ? "↔" : "↕";
      handle.setAttribute("aria-label", `Resize ${parent.direction === "row" ? "columns" : "rows"}`); handle.addEventListener("pointerdown", this.startResize); handle.addEventListener("keydown", this.resizeWithKeyboard);
      this.root.append(handle); this.handles.push(handle);
    }
    this.positionHandles();
  }
  private positionHandles(): void { for (const handle of this.handles) { const first = this.surface?.querySelector<HTMLElement>(`[data-movcues-node-id="${handle.dataset.first}"]`); if (!first) continue; const rect = first.getBoundingClientRect(); const row = handle.dataset.movcuesResizeHandle === "row"; handle.style.transform = `translate(${row ? rect.right - 5 : rect.left + rect.width / 2 + 16}px,${row ? rect.top + rect.height / 2 + 16 : rect.bottom - 5}px)`; } }
  private startResize = (event: PointerEvent): void => { if (this.composing) return; const handle = event.currentTarget as HTMLElement; const firstId = handle.dataset.first!; const secondId = handle.dataset.second!; const first = this.surface?.querySelector<HTMLElement>(`[data-movcues-node-id="${firstId}"]`); const second = this.surface?.querySelector<HTMLElement>(`[data-movcues-node-id="${secondId}"]`); if (!first || !second) return; if (!this.beforeTransaction()) return; const row = handle.dataset.movcuesResizeHandle === "row"; const a = first.getBoundingClientRect(); const b = second.getBoundingClientRect(); const start = row ? event.clientX : event.clientY; const total = row ? a.width + b.width : a.height + b.height; const initial = row ? a.width : a.height; let ratio = initial / total * 2;
    const move = (next: PointerEvent) => { ratio = Math.max(.1, Math.min(1.9, ((initial + (row ? next.clientX : next.clientY) - start) / total) * 2)); cancelAnimationFrame(this.resizeFrame); this.resizeFrame = requestAnimationFrame(() => { first.style.flex = `${ratio} 1 0px`; second.style.flex = `${2 - ratio} 1 0px`; this.positionHandles(); }); };
    const finish = (save: boolean) => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", cancel); cancelAnimationFrame(this.resizeFrame); this.resizeFrame = 0; this.resizeCleanup = null; if (save && !this.destroyed && resizeSiblings(this.document, firstId, secondId, ratio)) this.commit(this.selection); else { first.style.flex = ""; second.style.flex = ""; } };
    const stop = () => finish(true); const cancel = () => finish(false);
    this.resizeCleanup?.(); this.resizeCleanup = cancel; window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", cancel);
  };
  private resizeWithKeyboard = (event: KeyboardEvent): void => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; const handle = event.currentTarget as HTMLElement; const first = findCell(this.document, handle.dataset.first!); const weight = first?.sizing.mode === "flexible" ? first.sizing.weight : 1; const increase = event.key === "ArrowRight" || event.key === "ArrowDown"; if (!this.beforeTransaction()) return; if (resizeSiblings(this.document, handle.dataset.first!, handle.dataset.second!, weight + (increase ? .1 : -.1))) this.commit(this.selection); this.root.querySelector<HTMLButtonElement>(`[data-movcues-resize-handle][data-first="${handle.dataset.first}"][data-second="${handle.dataset.second}"]`)?.focus({ preventScroll: true }); event.preventDefault(); };

  destroy(): void {
    this.destroyed = true; this.imageRequest++; clearTimeout(this.compileTimer); clearTimeout(this.typingTimer); cancelAnimationFrame(this.toolFrame); cancelAnimationFrame(this.resizeFrame);
    this.resizeCleanup?.(); this.closePalette(); this.clearImageDrop();
    this.surface?.removeEventListener("click", this.onSurfaceClick); this.surface?.removeEventListener("dblclick", this.onDoubleClick); this.surface?.removeEventListener("input", this.onInput);
    this.surface?.removeEventListener("blur", this.onBlur, true); this.surface?.removeEventListener("compositionstart", this.onCompositionStart); this.surface?.removeEventListener("compositionend", this.onCompositionEnd); this.surface?.removeEventListener("keydown", this.onSurfaceKeyDown);
    this.surface?.removeEventListener("dragover", this.onImageDragOver); this.surface?.removeEventListener("dragleave", this.onImageDragLeave); this.surface?.removeEventListener("drop", this.onImageDrop);
    this.surface?.removeEventListener("keyup", this.rememberSelection); this.surface?.removeEventListener("mouseup", this.rememberSelection); this.surface?.removeEventListener("paste", this.onPaste);
    this.toolbar.removeEventListener("dragstart", this.onMoveDragStart); this.toolbar.removeEventListener("dragend", this.cancelMove); this.cancelMove(); this.savedRange = null;
    this.surface?.querySelectorAll("[data-movcues-empty-cell]").forEach(element => element.remove());
    this.surface?.querySelectorAll("[data-movcues-node-id]").forEach(cell => { cell.removeAttribute("tabindex"); cell.removeAttribute("aria-label"); cell.removeAttribute("data-movcues-editor-selected"); });
    this.imagePlaceholders.forEach((image, placeholder) => placeholder.replaceWith(image)); this.imagePlaceholders.clear(); this.imageInput.remove();
    this.toolbar.remove(); this.palette.remove(); this.edgeButtons.forEach(button => button.remove()); this.handles.forEach(handle => handle.remove());
    this.root.querySelector("style[data-movcues-composition-style]")?.remove(); this.root.removeEventListener("scroll", this.positionTools, true);
    window.removeEventListener("scroll", this.positionTools, true); window.removeEventListener("resize", this.positionTools); window.removeEventListener("pointerdown", this.dismissPalette, true); window.removeEventListener("keydown", this.onPaletteKeyDown);
  }
}

function placeOutside(rect: DOMRect, size: DOMRect, bounds: { left: number; right: number; top: number; bottom: number }): { left: number; top: number } {
  const clampX = (x: number) => Math.max(bounds.left, Math.min(bounds.right - size.width, x));
  const clampY = (y: number) => Math.max(bounds.top, Math.min(bounds.bottom - size.height, y));
  const candidates = [
    { left: clampX(rect.left), top: rect.bottom + 10 },
    { left: clampX(rect.left), top: rect.top - size.height - 10 },
    { left: rect.right + 10, top: clampY(rect.top) },
    { left: rect.left - size.width - 10, top: clampY(rect.top) },
  ];
  return candidates.find(p => p.left >= bounds.left && p.left + size.width <= bounds.right && p.top >= bounds.top && p.top + size.height <= bounds.bottom)
    ?? { left: clampX(rect.left), top: clampY(rect.bottom + 10) };
}

const AUTHORING_STYLE = `
[data-movcues-empty-cell]{width:100%;min-height:54px;border:1px dashed #94a3b8;border-radius:6px;background:#f8fafc;color:#64748b;font:12px ui-sans-serif,system-ui;cursor:pointer}[data-movcues-moving] [data-movcues-node-id]:hover{outline:2px dashed #2563eb;outline-offset:-2px}[data-command=move][aria-pressed=true]{background:#eff6ff;color:#1d4ed8}[data-movcues-node-id]:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
[data-movcues-editor-selected=step]{outline:2px solid #2563eb!important;outline-offset:3px}[data-movcues-editor-selected=cell]{outline:2px solid #0ea5e9!important;outline-offset:-2px}[data-movcues-editor-selected=block]{outline:2px solid #2563eb!important;outline-offset:2px}
[data-movcues-composition-toolbar],[data-movcues-block-palette],[data-movcues-resize-handle],[data-movcues-insert-edge]{box-sizing:border-box;position:fixed;left:0;top:0;z-index:2147483646;pointer-events:auto;font:12px/1.2 ui-sans-serif,system-ui,sans-serif}
[data-movcues-composition-toolbar]{display:flex;gap:1px;max-width:calc(100vw - 12px);overflow:auto;padding:3px;border:1px solid #dbe2ea;border-radius:8px;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.14)}[data-movcues-composition-toolbar] button,[data-movcues-block-palette] button{min-height:28px;padding:5px 7px;border:0;border-radius:5px;background:transparent;color:#334155;font:600 11px inherit;cursor:pointer}[data-movcues-composition-toolbar] button{flex:none;width:26px;padding:0;font-size:16px}[data-movcues-composition-toolbar] button:hover:not(:disabled),[data-movcues-block-palette] button:hover{background:#eff6ff;color:#1d4ed8}[data-movcues-composition-toolbar] button:disabled{cursor:not-allowed;opacity:.42}
[data-movcues-composition-toolbar] svg{display:block;margin:auto}
[data-movcues-builder-surface] [data-movcues-question-input]{pointer-events:none}
[data-movcues-image-placeholder]{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:120px;padding:16px;border:1px dashed #94a3b8!important;background:#f8fafc;color:#64748b;font:12px/1.4 ui-sans-serif,system-ui,sans-serif;cursor:pointer;white-space:normal}[data-movcues-image-placeholder] svg{flex:none}[data-movcues-image-placeholder]:hover,[data-movcues-image-drop]{outline:2px solid #2563eb!important;outline-offset:2px;background:#eff6ff}[data-movcues-image-placeholder][aria-busy=true]{opacity:.6;cursor:wait}[data-movcues-image-file][hidden]{display:none!important}
[data-movcues-insert-edge]{width:24px;height:24px;padding:0;border:1px solid #93c5fd;border-radius:50%;background:#fff;color:#2563eb;box-shadow:0 2px 6px rgba(15,23,42,.12);font-size:18px;cursor:pointer}[data-movcues-insert-edge]:hover,[data-movcues-insert-edge][aria-expanded=true]{background:#2563eb;color:#fff}
[data-movcues-insertion-edge=top]{box-shadow:inset 0 3px #2563eb}[data-movcues-insertion-edge=bottom]{box-shadow:inset 0 -3px #2563eb}[data-movcues-insertion-edge=left]{box-shadow:inset 3px 0 #2563eb}[data-movcues-insertion-edge=right]{box-shadow:inset -3px 0 #2563eb}
[data-movcues-composition-toolbar][hidden],[data-movcues-block-palette][hidden],[data-movcues-insert-edge][hidden]{display:none!important}
[data-movcues-composition-toolbar] button:focus-visible,[data-movcues-block-palette] button:focus-visible,[data-movcues-insert-edge]:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
[data-movcues-block-palette]{display:grid;grid-template-columns:repeat(2,minmax(76px,1fr));gap:3px;width:180px;padding:6px;border:1px solid #dbe2ea;border-radius:9px;background:#fff;box-shadow:0 12px 30px rgba(15,23,42,.2)}[data-movcues-block-palette][hidden]{display:none}
[data-movcues-resize-handle]{width:28px;height:28px;padding:0;border:2px solid #fff;border-radius:50%;background:#2563eb;color:#fff;box-shadow:0 2px 8px rgba(15,23,42,.25);cursor:col-resize}[data-movcues-resize-handle=column]{cursor:row-resize}[contenteditable=true]{cursor:text!important;outline:2px solid #60a5fa!important;outline-offset:2px}
`;
function escapeHtmlAttribute(value: string): string { return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
