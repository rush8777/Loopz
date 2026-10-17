import type { ExperienceContent, WidgetBuilderState, WidgetType } from "../types";
import {
  applyOnsiteDocument,
  cellForBlock,
  cloneOnsite,
  createBlock,
  duplicateCell,
  findBlock,
  findCell,
  insertEdgeCell,
  migrateV1Builder,
  moveCell,
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

export type CompositionSelection =
  | { kind: "step"; label: string }
  | { kind: "cell"; label: string; cellId: string }
  | { kind: "block"; label: string; cellId: string; blockId: string; blockType: OnsiteBlock["type"] };
interface Callbacks { onChange(): void; onSelectionChange(selection: CompositionSelection): void; onValidation(errors: string[]): void }
interface HistoryEntry { document: OnsiteDocument; selection: CompositionSelection; bytes: number }

const BLOCK_LABEL: Record<OnsiteBlock["type"], string> = { heading: "Heading", text: "Text", button: "Button", image: "Image", divider: "Divider", spacer: "Spacer", icon: "Icon" };
const HISTORY_LIMIT = 50;
const HISTORY_BYTES = 2_000_000;

/** Structured on-site authoring. It is imported only by the lazy editor bundle. */
export class OnsiteCompositionEditor {
  private document: OnsiteDocument;
  private surface: HTMLElement | null;
  private toolbar: HTMLElement;
  private palette: HTMLElement;
  private breadcrumb: HTMLElement;
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
  private readonly migrated: boolean;

  constructor(
    private root: ShadowRoot,
    private builder: WidgetBuilderState,
    private content: ExperienceContent,
    private widgetType: WidgetType | "anchored_card" | "modal",
    private guide: boolean,
    private callbacks: Callbacks,
  ) {
    const existing = onsiteDocumentFromBuilder(builder);
    this.document = existing ?? migrateV1Builder(builder, content, widgetType, guide) ?? (() => { throw new Error("This v1 layout cannot be converted safely. Continue editing it with the compatibility editor."); })();
    this.migrated = !existing;
    this.surface = root.querySelector<HTMLElement>("[data-movcues-builder-surface]");
    this.toolbar = document.createElement("div"); this.toolbar.dataset.movcuesCompositionToolbar = "";
    this.palette = document.createElement("div"); this.palette.dataset.movcuesBlockPalette = ""; this.palette.hidden = true;
    this.breadcrumb = document.createElement("nav"); this.breadcrumb.dataset.movcuesBreadcrumb = ""; this.breadcrumb.setAttribute("aria-label", "Selected layout path");
  }

  start(): void {
    if (!this.surface) return;
    this.compileAndPatch();
    const style = document.createElement("style"); style.dataset.movcuesCompositionStyle = ""; style.textContent = AUTHORING_STYLE; this.root.append(style);
    this.toolbar.innerHTML = `<button data-command="add" title="Add block">＋ Add</button><button data-command="columns" title="Split into columns">⇆</button><button data-command="rows" title="Split into rows">⇅</button><button data-command="parent" title="Select parent">↑</button><button data-command="duplicate" title="Duplicate">⧉</button><button data-command="move-up" title="Move before">←</button><button data-command="move-down" title="Move after">→</button><button data-command="delete" title="Delete">⌫</button>`;
    this.palette.innerHTML = (Object.keys(BLOCK_LABEL) as OnsiteBlock["type"][]).map(type => `<button type="button" data-insert-block="${type}">${BLOCK_LABEL[type]}</button>`).join("");
    this.root.append(this.toolbar, this.palette, this.breadcrumb);
    this.surface.addEventListener("click", this.onSurfaceClick);
    this.surface.addEventListener("dblclick", this.onDoubleClick);
    this.surface.addEventListener("input", this.onInput);
    this.surface.addEventListener("blur", this.onBlur, true);
    this.surface.addEventListener("compositionstart", this.onCompositionStart);
    this.surface.addEventListener("compositionend", this.onCompositionEnd);
    this.surface.addEventListener("keydown", this.onSurfaceKeyDown);
    this.toolbar.addEventListener("click", this.onToolbarClick);
    this.palette.addEventListener("click", this.onPaletteClick);
    this.root.addEventListener("scroll", this.positionTools, true);
    window.addEventListener("scroll", this.positionTools, true); window.addEventListener("resize", this.positionTools);
    this.select({ kind: "step", label: "Step" }); this.pushHistory(); if (this.migrated) this.callbacks.onChange();
  }

  getDocument(): OnsiteDocument { return this.document; }
  getSelection(): CompositionSelection { return this.selection; }
  getSelectedCell(): OnsiteCell | null { const id = this.selection.kind === "step" ? this.document.root.id : this.selection.cellId; return findCell(this.document, id); }
  getSelectedBlock(): OnsiteBlock | null { return this.selection.kind === "block" ? findBlock(this.document, this.selection.blockId) : null; }
  canUndo(): boolean { return this.historyIndex > 0; }
  canRedo(): boolean { return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1; }
  isComposing(): boolean { return this.composing; }
  getValidation(): string[] { return validateOnsiteDocument(this.document).errors; }

  flush(): boolean {
    if (this.composing) return false;
    clearTimeout(this.compileTimer); this.compileTimer = 0;
    const validation = validateOnsiteDocument(this.document); this.callbacks.onValidation(validation.errors); if (!validation.valid) return false;
    const compiled = applyOnsiteDocument(this.builder, this.document, this.widgetType); Object.assign(this.content, compiled.content); return true;
  }

  snapshot(): { builder: WidgetBuilderState; content: ExperienceContent } { this.flush(); return { builder: cloneOnsite(this.builder), content: cloneOnsite(this.content) }; }

  undo(): void { if (!this.canUndo() || this.composing) return; this.historyIndex--; this.restore(this.history[this.historyIndex]); }
  redo(): void { if (!this.canRedo() || this.composing) return; this.historyIndex++; this.restore(this.history[this.historyIndex]); }

  selectStep(): void { this.select({ kind: "step", label: "Step" }); }
  selectParent(): void {
    if (this.selection.kind === "block") { this.select({ kind: "cell", label: "Cell", cellId: this.selection.cellId }); return; }
    if (this.selection.kind === "cell") { const parent = parentCell(this.document, this.selection.cellId); parent ? this.select({ kind: "cell", label: "Parent cell", cellId: parent.id }) : this.selectStep(); }
  }
  selectChild(): void {
    if (this.selection.kind === "step") { this.select({ kind: "cell", label: "Root cell", cellId: this.document.root.id }); return; }
    if (this.selection.kind !== "cell") return; const cell = findCell(this.document, this.selection.cellId); if (!cell) return;
    if (cell.block) this.select({ kind: "block", label: BLOCK_LABEL[cell.block.type], cellId: cell.id, blockId: cell.block.id, blockType: cell.block.type }); else if (cell.children?.[0]) this.select({ kind: "cell", label: "Child cell", cellId: cell.children[0].id });
  }

  insertBlock(type: OnsiteBlock["type"]): boolean {
    const cell = this.getSelectedCell(); if (!cell || cell.children) return false;
    if (cell.block && !window.confirm("Replace the block in this cell? You can undo this change.")) return false;
    this.beforeTransaction(); const block = createBlock(type, this.guide); cell.block = block; this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: cell.id, blockId: block.id, blockType: type }); return true;
  }
  split(direction: "row" | "column"): boolean { const cell = this.getSelectedCell(); if (!cell) return false; this.beforeTransaction(); const id = splitCell(this.document, cell.id, direction); if (!id) return false; this.commit({ kind: "cell", label: direction === "row" ? "Right cell" : "Lower cell", cellId: id }); return true; }
  addEdge(edge: "top" | "right" | "bottom" | "left"): void { this.beforeTransaction(); const id = insertEdgeCell(this.document, edge); this.commit({ kind: "cell", label: `${edge} cell`, cellId: id }); }
  duplicate(): boolean { const cell = this.getSelectedCell(); if (!cell || cell === this.document.root) return false; this.beforeTransaction(); const id = duplicateCell(this.document, cell.id); if (!id) return false; this.commit({ kind: "cell", label: "Duplicated cell", cellId: id }); return true; }
  remove(): boolean { const cell = this.getSelectedCell(); if (!cell || cell === this.document.root) return false; if (!window.confirm("Delete this cell and its content?")) return false; this.beforeTransaction(); const parent = parentCell(this.document, cell.id); if (!removeCell(this.document, cell.id)) return false; this.commit(parent ? { kind: "cell", label: "Parent cell", cellId: parent.id } : { kind: "step", label: "Step" }); return true; }
  move(delta: -1 | 1): boolean { const cell = this.getSelectedCell(); if (!cell) return false; this.beforeTransaction(); if (!moveCell(this.document, cell.id, delta)) return false; this.commit(this.selection); return true; }

  updateCell(update: Partial<Pick<OnsiteCell, "direction" | "align" | "justify" | "gap" | "padding" | "style" | "responsiveStack">> & { sizing?: OnsiteSizing }): void {
    const cell = this.getSelectedCell(); if (!cell) return; this.beforeTransaction(); Object.assign(cell, cloneOnsite(update)); this.commit(this.selection);
  }
  updateBlock(update: Partial<OnsiteBlock>): void {
    const block = this.getSelectedBlock(); if (!block) return; this.beforeTransaction(); Object.assign(block, cloneOnsite(update)); this.commit(this.selection);
  }
  updateButtonAction(action: { type: "next_step" | "previous_step" | "dismiss" } | { type: "open_url"; url: string } | { type: "track_event"; eventName: string }): void { const block = this.getSelectedBlock(); if (block?.type !== "button") return; this.beforeTransaction(); block.action = { id: block.action.id, ...action } as OnsiteButtonAction; this.commit(this.selection); }
  editSelected(): void { if (this.selection.kind !== "block") return; const block = this.getSelectedBlock(); if (!block || !["heading", "text", "button"].includes(block.type)) return; const element = this.surface?.querySelector<HTMLElement>(`[data-movcues-block-id="${block.id}"]`); if (element) { element.contentEditable = "true"; element.focus(); } }
  setAlignment(align: "left" | "center" | "right"): void { this.updateBlock({ align } as Partial<OnsiteBlock>); }
  formatInline(tag: "strong" | "em" | "u"): boolean { return this.wrapSelection(tag); }
  toggleList(tag: "ul" | "ol"): boolean { const block = this.getSelectedBlock(); if (block?.type !== "text") return false; this.beforeTransaction(); const current = block.html.trim(); block.html = current.startsWith(`<${tag}>`) ? current.replace(new RegExp(`^<${tag}><li>|</li></${tag}>$`, "g"), "") : `<${tag}><li>${current}</li></${tag}>`; this.commit(this.selection); return true; }
  applyLink(url: string): boolean { if (!builderLinkUrlIsSafe(url)) return false; return this.wrapSelection("a", url); }

  private wrapSelection(tag: "strong" | "em" | "u" | "a", href?: string): boolean {
    const block = this.getSelectedBlock(); if (!block || (block.type !== "heading" && block.type !== "text")) return false; const element = this.surface?.querySelector<HTMLElement>(`[data-movcues-block-id="${block.id}"]`); if (!element) return false;
    this.beforeTransaction(); const selection = window.getSelection(); const range = selection?.rangeCount ? selection.getRangeAt(0) : null; const selectedInside = range && element.contains(range.commonAncestorContainer) && !range.collapsed;
    if (selectedInside && range) { const wrapper = document.createElement(tag); if (tag === "a" && href) { wrapper.setAttribute("href", href); if (/^https?:\/\//i.test(href)) { wrapper.setAttribute("target", "_blank"); wrapper.setAttribute("rel", "noopener noreferrer"); } } try { range.surroundContents(wrapper); } catch { wrapper.append(range.extractContents()); range.insertNode(wrapper); } block.html = sanitizeRichText(element.innerHTML); }
    else { const open = tag === "a" ? `<a href="${escapeHtmlAttribute(href ?? "")}"${/^https?:\/\//i.test(href ?? "") ? ' target="_blank" rel="noopener noreferrer"' : ""}>` : `<${tag}>`; block.html = `${open}${block.html}</${tag}>`; }
    this.commit(this.selection); return true;
  }

  private select(selection: CompositionSelection): void {
    this.selection = selection; this.surface?.querySelectorAll("[data-movcues-editor-selected]").forEach(element => element.removeAttribute("data-movcues-editor-selected"));
    const target = selection.kind === "block" ? this.surface?.querySelector(`[data-movcues-block-id="${selection.blockId}"]`) : selection.kind === "cell" ? this.surface?.querySelector(`[data-movcues-node-id="${selection.cellId}"]`) : this.surface?.querySelector(".movcues-widget");
    target?.setAttribute("data-movcues-editor-selected", selection.kind); this.callbacks.onSelectionChange(selection); this.renderBreadcrumb(); this.renderResizeHandles(); requestAnimationFrame(this.positionTools);
  }

  private beforeTransaction(): void { clearTimeout(this.typingTimer); this.flush(); }
  private commit(selection: CompositionSelection): void { this.selection = selection; this.compileAndPatch(); this.pushHistory(); this.callbacks.onChange(); this.select(selection); }
  private compileAndPatch(): void {
    const compiled = applyOnsiteDocument(this.builder, this.document, this.widgetType); Object.assign(this.content, compiled.content);
    const template = document.createElement("template"); template.innerHTML = compiled.html; this.surface?.replaceChildren(...Array.from(template.content.childNodes));
    const style = this.root.querySelector<HTMLStyleElement>("style[data-movcues-builder-style]"); if (style) style.textContent = `${compiled.css}\n[data-movcues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movcues-builder-surface]>.movcues-widget{position:relative!important;inset:auto!important}`;
  }
  private scheduleCompile(): void { clearTimeout(this.compileTimer); this.compileTimer = window.setTimeout(() => { if (!this.destroyed && !this.composing) { const compiled = applyOnsiteDocument(this.builder, this.document, this.widgetType); Object.assign(this.content, compiled.content); this.callbacks.onValidation(validateOnsiteDocument(this.document).errors); } }, 160); }

  private pushHistory(): void {
    const document = cloneOnsite(this.document); const bytes = JSON.stringify(document).length; const entry = { document, selection: cloneOnsite(this.selection), bytes };
    if (this.historyIndex < this.history.length - 1) { this.historyBytes -= this.history.slice(this.historyIndex + 1).reduce((sum, item) => sum + item.bytes, 0); this.history.splice(this.historyIndex + 1); }
    this.history.push(entry); this.historyBytes += bytes;
    while (this.history.length > HISTORY_LIMIT || this.historyBytes > HISTORY_BYTES) { const removed = this.history.shift(); this.historyBytes -= removed?.bytes ?? 0; }
    this.historyIndex = this.history.length - 1;
  }
  private restore(entry: HistoryEntry): void { this.document = cloneOnsite(entry.document); this.compileAndPatch(); this.selection = cloneOnsite(entry.selection); this.callbacks.onChange(); this.select(this.selection); }

  private onSurfaceClick = (event: Event): void => {
    const element = event.target instanceof Element ? event.target : null; if (!element) return;
    const blockElement = element.closest<HTMLElement>("[data-movcues-block-id]"); const cellElement = element.closest<HTMLElement>("[data-movcues-node-id]");
    if (blockElement && cellElement) { const block = findBlock(this.document, blockElement.dataset.movcuesBlockId!); if (block) this.select({ kind: "block", label: BLOCK_LABEL[block.type], cellId: cellElement.dataset.movcuesNodeId!, blockId: block.id, blockType: block.type }); }
    else if (cellElement) this.select({ kind: "cell", label: "Cell", cellId: cellElement.dataset.movcuesNodeId! }); else this.selectStep();
    if (blockElement?.matches("button,a")) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  private onDoubleClick = (event: Event): void => { const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-movcues-block-id]") : null; const block = element ? findBlock(this.document, element.dataset.movcuesBlockId!) : null; if (element && (block?.type === "heading" || block?.type === "text" || block?.type === "button")) { element.contentEditable = "true"; element.focus(); } };
  private onInput = (event: Event): void => { const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-movcues-block-id]") : null; const block = element ? findBlock(this.document, element.dataset.movcuesBlockId!) : null; if (!block || !element) return; if (block.type === "heading" || block.type === "text") block.html = sanitizeRichText(element.innerHTML); else if (block.type === "button") block.label = (element.textContent ?? "").slice(0, 80); else return; this.scheduleCompile(); this.callbacks.onChange(); clearTimeout(this.typingTimer); this.typingTimer = window.setTimeout(() => this.pushHistory(), 300); };
  private onBlur = (event: Event): void => { const element = event.target instanceof HTMLElement ? event.target : null; if (element?.isContentEditable) { element.contentEditable = "false"; this.flush(); this.pushHistory(); } };
  private onCompositionStart = (): void => { this.composing = true; };
  private onCompositionEnd = (): void => { this.composing = false; this.scheduleCompile(); };
  private onSurfaceKeyDown = (event: KeyboardEvent): void => { if (event.key === "Escape" && event.target instanceof HTMLElement && event.target.isContentEditable) { event.target.blur(); event.preventDefault(); } if ((event.ctrlKey || event.metaKey) && !(event.target instanceof HTMLElement && event.target.isContentEditable)) { if (event.key === "ArrowUp") { this.selectParent(); event.preventDefault(); } if (event.key === "ArrowDown") { this.selectChild(); event.preventDefault(); } } };

  private onToolbarClick = (event: Event): void => { const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-command]") : null; if (!button) return; const command = button.dataset.command; if (command === "add") { this.palette.hidden = !this.palette.hidden; this.positionTools(); } else if (command === "columns") this.split("row"); else if (command === "rows") this.split("column"); else if (command === "parent") this.selectParent(); else if (command === "duplicate") this.duplicate(); else if (command === "delete") this.remove(); else if (command === "move-up") this.move(-1); else if (command === "move-down") this.move(1); };
  private onPaletteClick = (event: Event): void => { const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-insert-block]") : null; if (!button) return; if (this.insertBlock(button.dataset.insertBlock as OnsiteBlock["type"])) this.palette.hidden = true; };

  private renderBreadcrumb(): void {
    const path: OnsiteCell[] = []; const targetId = this.selection.kind === "step" ? null : this.selection.cellId;
    const find = (cell: OnsiteCell): boolean => { path.push(cell); if (cell.id === targetId) return true; for (const child of cell.children ?? []) if (find(child)) return true; path.pop(); return false; };
    if (targetId) find(this.document.root);
    this.breadcrumb.innerHTML = `<button type="button" data-breadcrumb-step>Step</button>${path.map((cell, index) => `<span>›</span><button type="button" data-breadcrumb-cell="${cell.id}">${index ? "Cell" : "Root"}</button>`).join("")}${this.selection.kind === "block" ? `<span>›</span><button type="button" data-breadcrumb-block="${this.selection.blockId}">${BLOCK_LABEL[this.selection.blockType]}</button>` : ""}`;
    this.breadcrumb.onclick = event => { const element = event.target as HTMLElement; if (element.closest("[data-breadcrumb-step]")) this.selectStep(); const id = element.closest<HTMLElement>("[data-breadcrumb-cell]")?.dataset.breadcrumbCell; if (id) this.select({ kind: "cell", label: "Cell", cellId: id }); };
  }

  private positionTools = (): void => {
    const selector = this.selection.kind === "block" ? `[data-movcues-block-id="${this.selection.blockId}"]` : this.selection.kind === "cell" ? `[data-movcues-node-id="${this.selection.cellId}"]` : ".movcues-widget";
    const target = this.surface?.querySelector<HTMLElement>(selector); if (!target) { this.toolbar.hidden = true; this.breadcrumb.hidden = true; return; }
    const rect = target.getBoundingClientRect(); this.toolbar.hidden = false; this.breadcrumb.hidden = false;
    const toolbarRect = this.toolbar.getBoundingClientRect(); const left = Math.max(6, Math.min(innerWidth - toolbarRect.width - 6, rect.left)); const top = Math.max(6, rect.top - toolbarRect.height - 6);
    this.toolbar.style.transform = `translate(${left}px,${top}px)`; this.breadcrumb.style.transform = `translate(${Math.max(6, Math.min(innerWidth - 300, rect.left))}px,${Math.min(innerHeight - 34, rect.bottom + 5)}px)`;
    if (!this.palette.hidden) this.palette.style.transform = `translate(${left}px,${Math.min(innerHeight - 220, top + toolbarRect.height + 4)}px)`;
    this.positionHandles();
  };

  private renderResizeHandles(): void { this.handles.forEach(handle => handle.remove()); this.handles = []; const cell = this.getSelectedCell(); const parent = cell ? parentCell(this.document, cell.id) : null; if (!cell || !parent?.children) return; const index = parent.children.findIndex(child => child.id === cell.id); const next = parent.children[index + 1]; if (!next) return; const handle = document.createElement("button"); handle.type = "button"; handle.dataset.movcuesResizeHandle = parent.direction; handle.dataset.first = cell.id; handle.dataset.second = next.id; handle.setAttribute("aria-label", `Resize ${parent.direction === "row" ? "columns" : "rows"}`); handle.addEventListener("pointerdown", this.startResize); handle.addEventListener("keydown", this.resizeWithKeyboard); this.root.append(handle); this.handles.push(handle); this.positionHandles(); }
  private positionHandles(): void { for (const handle of this.handles) { const first = this.surface?.querySelector<HTMLElement>(`[data-movcues-node-id="${handle.dataset.first}"]`); if (!first) continue; const rect = first.getBoundingClientRect(); const row = handle.dataset.movcuesResizeHandle === "row"; handle.style.transform = `translate(${row ? rect.right - 5 : rect.left + rect.width / 2 - 14}px,${row ? rect.top + rect.height / 2 - 14 : rect.bottom - 5}px)`; } }
  private startResize = (event: PointerEvent): void => { const handle = event.currentTarget as HTMLElement; const firstId = handle.dataset.first!; const secondId = handle.dataset.second!; const first = this.surface?.querySelector<HTMLElement>(`[data-movcues-node-id="${firstId}"]`); const second = this.surface?.querySelector<HTMLElement>(`[data-movcues-node-id="${secondId}"]`); if (!first || !second) return; this.beforeTransaction(); const row = handle.dataset.movcuesResizeHandle === "row"; const a = first.getBoundingClientRect(); const b = second.getBoundingClientRect(); const start = row ? event.clientX : event.clientY; const total = row ? a.width + b.width : a.height + b.height; const initial = row ? a.width : a.height; let ratio = initial / total * 2;
    const move = (next: PointerEvent) => { ratio = Math.max(.1, Math.min(1.9, ((initial + (row ? next.clientX : next.clientY) - start) / total) * 2)); cancelAnimationFrame(this.resizeFrame); this.resizeFrame = requestAnimationFrame(() => { first.style.flex = `${ratio} 1 0px`; second.style.flex = `${2 - ratio} 1 0px`; this.positionHandles(); }); };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); cancelAnimationFrame(this.resizeFrame); this.resizeFrame = 0; this.resizeCleanup = null; if (resizeSiblings(this.document, firstId, secondId, ratio)) this.commit(this.selection); };
    this.resizeCleanup?.(); this.resizeCleanup = stop; window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop);
  };
  private resizeWithKeyboard = (event: KeyboardEvent): void => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; const handle = event.currentTarget as HTMLElement; const first = findCell(this.document, handle.dataset.first!); const weight = first?.sizing.mode === "flexible" ? first.sizing.weight : 1; const increase = event.key === "ArrowRight" || event.key === "ArrowDown"; this.beforeTransaction(); if (resizeSiblings(this.document, handle.dataset.first!, handle.dataset.second!, weight + (increase ? .1 : -.1))) this.commit(this.selection); event.preventDefault(); };

  destroy(): void { this.destroyed = true; clearTimeout(this.compileTimer); clearTimeout(this.typingTimer); cancelAnimationFrame(this.resizeFrame); this.resizeCleanup?.(); this.surface?.removeEventListener("click", this.onSurfaceClick); this.surface?.removeEventListener("dblclick", this.onDoubleClick); this.surface?.removeEventListener("input", this.onInput); this.surface?.removeEventListener("blur", this.onBlur, true); this.surface?.removeEventListener("compositionstart", this.onCompositionStart); this.surface?.removeEventListener("compositionend", this.onCompositionEnd); this.surface?.removeEventListener("keydown", this.onSurfaceKeyDown); this.toolbar.remove(); this.palette.remove(); this.breadcrumb.remove(); this.handles.forEach(handle => handle.remove()); this.root.querySelector("style[data-movcues-composition-style]")?.remove(); window.removeEventListener("scroll", this.positionTools, true); window.removeEventListener("resize", this.positionTools); }
}

const AUTHORING_STYLE = `
[data-movcues-editor-selected=step]{outline:2px solid #2563eb!important;outline-offset:3px}[data-movcues-editor-selected=cell]{outline:2px solid #0ea5e9!important;outline-offset:-2px}[data-movcues-editor-selected=block]{outline:2px solid #2563eb!important;outline-offset:2px}
[data-movcues-composition-toolbar],[data-movcues-block-palette],[data-movcues-breadcrumb],[data-movcues-resize-handle]{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:auto;font:12px/1.2 ui-sans-serif,system-ui,sans-serif}
[data-movcues-composition-toolbar]{display:flex;gap:2px;padding:4px;border:1px solid #dbe2ea;border-radius:8px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.18)}[data-movcues-composition-toolbar] button,[data-movcues-block-palette] button,[data-movcues-breadcrumb] button{min-height:28px;padding:5px 7px;border:0;border-radius:5px;background:transparent;color:#334155;font:600 11px inherit;cursor:pointer}[data-movcues-composition-toolbar] button:hover,[data-movcues-block-palette] button:hover{background:#eff6ff;color:#1d4ed8}
[data-movcues-block-palette]{display:grid;grid-template-columns:repeat(2,minmax(76px,1fr));gap:3px;width:180px;padding:6px;border:1px solid #dbe2ea;border-radius:9px;background:#fff;box-shadow:0 12px 30px rgba(15,23,42,.2)}[data-movcues-block-palette][hidden]{display:none}
[data-movcues-breadcrumb]{display:flex;align-items:center;max-width:min(360px,calc(100vw - 12px));overflow:auto;padding:2px 4px;border:1px solid #dbe2ea;border-radius:7px;background:#fff;box-shadow:0 5px 16px rgba(15,23,42,.14);white-space:nowrap}[data-movcues-breadcrumb] span{color:#94a3b8}
[data-movcues-resize-handle]{width:28px;height:28px;padding:0;border:2px solid #fff;border-radius:50%;background:#2563eb;box-shadow:0 2px 8px rgba(15,23,42,.25);cursor:col-resize}[data-movcues-resize-handle=column]{cursor:row-resize}[contenteditable=true]{cursor:text!important;outline:2px solid #60a5fa!important;outline-offset:2px}
`;
function escapeHtmlAttribute(value: string): string { return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
