import type { ExperienceContent, WidgetBuilderState } from "../types";
import { sanitizeBuilderHtml } from "../runtime/BuilderContent";
import { builderImageUrlIsSafe, builderLinkUrlIsSafe } from "../runtime/BuilderContentContract";

export type OnsiteComponentKind = "text" | "button" | "image";
export interface OnsiteComponentSelection {
  kind: OnsiteComponentKind;
  label: string;
  editing: boolean;
  src?: string;
  alt?: string;
}

interface Callbacks {
  onChange(): void;
  onValidation?(errors: string[]): void;
  onSelectionChange(selection: OnsiteComponentSelection | null): void;
}

const SELECTABLE = "[data-movcues-content],[data-movcues-action-id],img";
interface Snapshot { html: string; content: ExperienceContent; key: string | null; editing: boolean; start: number; end: number; bytes: number }
const MAX_HISTORY_BYTES = 2_000_000;
export function componentPlainText(element: Element): string {
  const readChildren = (parent: Node): string => {
    let result = "";
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) { result += node.textContent ?? ""; continue; }
      if (node instanceof Element && node.tagName === "BR") { result += "\n"; continue; }
      const block = node instanceof Element && /^(LI|P|DIV|UL|OL)$/.test(node.tagName);
      if (block && result && !result.endsWith("\n")) result += "\n";
      result += readChildren(node);
      if (block && !result.endsWith("\n")) result += "\n";
    }
    return result;
  };
  return readChildren(element).trim();
}
const ALIGNMENT_CLASSES = ["movcues-align-left", "movcues-align-center", "movcues-align-right"];

/** Delegated direct-content editing scoped to one rendered experience surface.
 * It never observes or scans the customer document and never serializes its UI. */
export class OnsiteContentEditor {
  private surface: HTMLElement | null;
  private selected: HTMLElement | null = null;
  private hovered: HTMLElement | null = null;
  private outline: HTMLElement;
  private style: HTMLStyleElement;
  private frame = 0;
  private composing = false;
  private savedRange: Range | null = null;
  private history: Snapshot[] = [];
  private transactionTimer = 0;
  private pending = false;
  private errors: string[] = [];
  private fieldErrors = new Map<string, string[]>();
  private deferredFinish = false;
  private tabStops = new Map<HTMLElement, string | null>();
  private historyIndex = -1;

  constructor(private root: ShadowRoot, private builder: WidgetBuilderState, private content: ExperienceContent, private callbacks: Callbacks) {
    this.surface = root.querySelector<HTMLElement>("[data-movcues-builder-surface]");
    this.style = document.createElement("style");
    this.style.dataset.movcuesAuthoringStyle = "";
    this.style.textContent = `[data-movcues-authoring-outline]{position:fixed;z-index:2147483646;pointer-events:none;border:1.5px solid #2563eb;border-radius:5px;box-shadow:0 0 0 2px rgba(37,99,235,.12);transition:none}[data-movcues-authoring-outline][data-hover]{border-style:dashed;opacity:.72}`;
    this.outline = document.createElement("div");
    this.outline.dataset.movcuesAuthoringOutline = "";
    this.outline.hidden = true;
  }

  start(): boolean {
    if (!this.surface) return false;
    this.root.append(this.style, this.outline);
    this.makeFocusable();
    this.root.addEventListener("focusin", this.onFocus, true);
    this.root.addEventListener("pointerover", this.onPointerOver, true);
    this.root.addEventListener("pointerout", this.onPointerOut, true);
    this.root.addEventListener("click", this.onClick, true);
    this.root.addEventListener("dblclick", this.onDoubleClick, true);
    this.root.addEventListener("input", this.onInput, true);
    this.root.addEventListener("compositionstart", this.onCompositionStart, true);
    this.root.addEventListener("compositionend", this.onCompositionEnd, true);
    this.root.addEventListener("keydown", this.onKeyDown, true);
    this.root.addEventListener("keyup", this.rememberSelection, true);
    this.root.addEventListener("mouseup", this.rememberSelection, true);
    this.root.addEventListener("paste", this.onPaste, true);
    this.root.addEventListener("drop", this.onDrop, true);
    this.root.addEventListener("beforeinput", this.onBeforeInput, true);
    this.root.addEventListener("touchend", this.rememberSelection, true);
    document.addEventListener("pointerdown", this.onOutsidePointer, true);
    window.addEventListener("scroll", this.scheduleOutline, true);
    window.addEventListener("resize", this.scheduleOutline);
    this.pushHistory();
    return true;
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.flush();
    clearTimeout(this.transactionTimer);
    this.finishEditing(false);
    this.selected?.removeAttribute("contenteditable"); this.selected?.removeAttribute("spellcheck");
    this.composing = false; this.selected = null; this.hovered = null; this.savedRange = null; this.history = []; this.historyIndex = -1;
    this.root.removeEventListener("focusin", this.onFocus, true);
    for (const [element, original] of this.tabStops) { if (original === null) element.removeAttribute("tabindex"); else element.setAttribute("tabindex", original); }
    this.tabStops.clear();
    this.root.removeEventListener("pointerover", this.onPointerOver, true);
    this.root.removeEventListener("pointerout", this.onPointerOut, true);
    this.root.removeEventListener("click", this.onClick, true);
    this.root.removeEventListener("dblclick", this.onDoubleClick, true);
    this.root.removeEventListener("input", this.onInput, true);
    this.root.removeEventListener("compositionstart", this.onCompositionStart, true);
    this.root.removeEventListener("compositionend", this.onCompositionEnd, true);
    this.root.removeEventListener("keydown", this.onKeyDown, true);
    this.root.removeEventListener("keyup", this.rememberSelection, true);
    this.root.removeEventListener("mouseup", this.rememberSelection, true);
    this.root.removeEventListener("paste", this.onPaste, true);
    this.root.removeEventListener("drop", this.onDrop, true);
    this.root.removeEventListener("beforeinput", this.onBeforeInput, true);
    this.root.removeEventListener("touchend", this.rememberSelection, true);
    document.removeEventListener("pointerdown", this.onOutsidePointer, true);
    window.removeEventListener("scroll", this.scheduleOutline, true);
    window.removeEventListener("resize", this.scheduleOutline);
    this.outline.remove(); this.style.remove();
    this.callbacks.onSelectionChange(null);
  }

  editSelected(): void {
    if (!this.selected || this.selectionKind(this.selected) === "image") return;
    if (this.isEditing()) { this.selected.focus({ preventScroll: true }); return; }
    this.selected.setAttribute("contenteditable", "true");
    this.selected.setAttribute("spellcheck", "true");
    this.selected.focus({ preventScroll: true });
    const current = this.history[this.historyIndex]; if (current) Object.assign(current, this.selectionState());
    this.emitSelection();
  }

  deselect(): void { if (this.composing) { this.deferredFinish = true; return; } this.finishEditing(true); this.selected = null; this.savedRange = null; this.renderOutline(); this.callbacks.onSelectionChange(null); }

  formatInline(tag: "strong" | "em" | "u"): void { this.wrapSelection(tag); }

  applyLink(url: string): boolean {
    if (this.composing || !this.selected || this.selectionKind(this.selected) !== "text" || !builderLinkUrlIsSafe(url) || !this.restoreSelection()) return false;
    const selection = this.getSelection(); const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || range.collapsed || !this.selected?.contains(range.commonAncestorContainer)) return false;
    if (this.selected?.closest("a") || range.startContainer.parentElement?.closest("a") || range.endContainer.parentElement?.closest("a") || range.cloneContents().querySelector("a")) return false;
    this.beforeOperation();
    const anchor = document.createElement("a"); anchor.href = url; if (/^https?:\/\//i.test(url)) { anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; }
    anchor.append(range.extractContents()); range.insertNode(anchor); selection?.removeAllRanges(); range.selectNodeContents(anchor); selection?.addRange(range); this.savedRange = range.cloneRange(); this.commit(); return true;
  }

  setAlignment(alignment: "left" | "center" | "right"): void {
    if (this.composing || !this.selected || this.selectionKind(this.selected) !== "text") return;
    this.beforeOperation();
    this.selected.classList.remove(...ALIGNMENT_CLASSES); this.selected.classList.add(`movcues-align-${alignment}`); this.commit();
  }

  toggleList(kind: "ul" | "ol"): void {
    if (this.composing || !this.selected || this.selected.getAttribute("data-movcues-content") !== "body") return;
    this.beforeOperation();
    let component = this.selected;
    if (component.tagName === "P") {
      const replacement = document.createElement("div");
      for (const attribute of Array.from(component.attributes)) replacement.setAttribute(attribute.name, attribute.value);
      replacement.append(...Array.from(component.childNodes)); this.tabStops.delete(component); replacement.removeAttribute("tabindex"); component.replaceWith(replacement); component = replacement; this.selected = replacement; this.makeFocusable();
    }
    const existing = component.querySelector("ul,ol");
    if (existing) {
      if (existing.tagName.toLowerCase() !== kind) {
        const list = document.createElement(kind); list.append(...Array.from(existing.childNodes)); existing.replaceWith(list);
      } else {
        const fragment = document.createDocumentFragment();
        Array.from(existing.children).forEach((item, i) => { if (i) fragment.append(document.createElement("br")); fragment.append(...Array.from(item.childNodes)); });
        existing.replaceWith(fragment);
      }
    } else {
      // Preserve inline markup; paragraph/line boundaries become list items.
      const list = document.createElement(kind); let item = document.createElement("li"); list.append(item);
      for (const node of Array.from(component.childNodes)) {
        if (node instanceof Element && node.tagName === "BR") { item = document.createElement("li"); list.append(item); }
        else if (node instanceof Element && /^(P|DIV)$/.test(node.tagName)) { if (item.childNodes.length) { item = document.createElement("li"); list.append(item); } item.append(...Array.from(node.childNodes)); }
        else item.append(node);
      }
      component.replaceChildren(list);
    }
    this.savedRange = null; this.commit(); component.focus({ preventScroll: true });
  }

  updateImage(src: string, alt: string): boolean {
    if (!this.selected || this.selected.tagName !== "IMG" || !builderImageUrlIsSafe(src) || alt.length > 500) return false;
    this.beforeOperation();
    if (src) this.selected.setAttribute("src", src); else this.selected.removeAttribute("src");
    this.selected.setAttribute("alt", alt); this.commit(); this.emitSelection(); return true;
  }

  undo(): boolean { return this.moveHistory(-1); }
  redo(): boolean { return this.moveHistory(1); }
  canUndo(): boolean { return this.pending || this.historyIndex > 0; }
  canRedo(): boolean { return !this.pending && this.historyIndex >= 0 && this.historyIndex < this.history.length - 1; }

  private makeFocusable(): void {
    this.surface?.querySelectorAll<HTMLElement>(SELECTABLE).forEach(element => { if (!this.tabStops.has(element)) this.tabStops.set(element, element.getAttribute("tabindex")); element.setAttribute("tabindex", "0"); });
  }
  private onFocus = (event: Event) => {
    const component = this.componentFrom(event); if (!component || component === this.selected || this.composing) return;
    this.finishEditing(true); this.selected = component; this.savedRange = null; this.renderOutline(); this.emitSelection();
  };
  private onPointerOver = (event: Event) => { const component = this.componentFrom(event); if (!component || component === this.hovered) return; this.hovered = component; this.renderOutline(); };
  private onPointerOut = (event: Event) => { const related = (event as PointerEvent).relatedTarget; if (related instanceof Node && this.hovered?.contains(related)) return; this.hovered = null; this.renderOutline(); };
  private onClick = (event: Event) => {
    const component = this.componentFrom(event);
    if (!component) { this.finishEditing(true); return; }
    if (component === this.selected && this.isEditing()) {
      // Keep the browser's native caret, drag-selection and touch behavior.
      if ((event.target as Element).closest("a")) event.preventDefault();
      event.stopImmediatePropagation(); return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    if (this.composing) return;
    this.finishEditing(true); this.selected = component; this.savedRange = null; this.renderOutline(); this.emitSelection();
  };
  private onDoubleClick = (event: Event) => {
    const component = this.componentFrom(event); if (!component || this.composing) return;
    event.stopImmediatePropagation();
    if (component === this.selected && this.isEditing()) return;
    this.finishEditing(true); this.selected = component; this.editSelected();
  };
  private onOutsidePointer = (event: Event) => {
    const path = event.composedPath();
    if (path.includes(this.root.host) || path.some(node => node instanceof HTMLElement && node.hasAttribute("data-movcues-editor"))) return;
    this.finishEditing(true);
  };
  private onInput = (event: Event) => {
    if (!this.selected?.contains(event.target as Node) || this.composing) return;
    this.sanitizeActive(); this.rememberSelection(); this.commit(true);
  };
  private onCompositionStart = () => { this.beforeOperation(); this.composing = true; };
  private onCompositionEnd = () => {
    this.composing = false; this.sanitizeActive(); this.rememberSelection(); this.commit();
    if (this.deferredFinish) { this.deferredFinish = false; this.finishEditing(true); }
  };
  private onBeforeInput = (event: Event) => {
    const input = event as InputEvent;
    if (/^(insertFromDrop|insertFromPaste|insertHTML)$/.test(input.inputType)) event.preventDefault();
    const formatting = { formatBold: "strong", formatItalic: "em", formatUnderline: "u" } as const;
    if (input.inputType in formatting) { event.preventDefault(); this.rememberSelection(); this.formatInline(formatting[input.inputType as keyof typeof formatting]); }
  };
  private onDrop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  private onKeyDown = (event: Event) => {
    const keyEvent = event as KeyboardEvent;
    if (this.composing || keyEvent.isComposing || keyEvent.keyCode === 229) return;
    if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "a" && this.isEditing() && this.selected) {
      keyEvent.preventDefault(); const range = document.createRange(); range.selectNodeContents(this.selected); const selection = this.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); this.savedRange = range.cloneRange(); return;
    }
    if ((keyEvent.key === "Enter" || keyEvent.key === " ") && this.selected && !this.isEditing() && this.selectionKind(this.selected) !== "image") { keyEvent.preventDefault(); this.editSelected(); return; }
    if (keyEvent.key === "Escape") { keyEvent.preventDefault(); const component = this.selected; this.deselect(); component?.focus({ preventScroll: true }); return; }
    if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "z") { keyEvent.preventDefault(); keyEvent.shiftKey ? this.redo() : this.undo(); return; }
    if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "y") { keyEvent.preventDefault(); this.redo(); return; }
    if (keyEvent.key === "Enter" && this.selected && (this.selected.matches("[data-movcues-content=heading]") || this.selected.matches("[data-movcues-action-id]"))) { keyEvent.preventDefault(); this.finishEditing(true); }
  };
  private onPaste = (event: Event) => {
    if (!this.isEditing() || this.composing) return;
    const paste = event as ClipboardEvent; const text = paste.clipboardData?.getData("text/plain"); if (text === undefined) return;
    paste.preventDefault(); const selection = this.getSelection(); if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0); if (!this.selected?.contains(range.commonAncestorContainer)) return; this.beforeOperation(); range.deleteContents(); const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); this.savedRange = range.cloneRange(); this.commit();
  };

  private componentFrom(event: Event): HTMLElement | null {
    if (!this.surface) return null; const target = event.target;
    if (!(target instanceof Element)) return null; const component = target.closest<HTMLElement>(SELECTABLE);
    return component && this.surface.contains(component) ? component : null;
  }

  private selectionKind(component: HTMLElement): OnsiteComponentKind { return component.tagName === "IMG" ? "image" : component.hasAttribute("data-movcues-action-id") ? "button" : "text"; }
  private emitSelection(): void {
    if (!this.selected) return this.callbacks.onSelectionChange(null);
    const kind = this.selectionKind(this.selected);
    this.callbacks.onSelectionChange({ kind, label: kind === "image" ? "Image" : this.selected.getAttribute("data-movcues-content") ?? `${this.selected.getAttribute("data-movcues-action-id") ?? "button"} button`, editing: this.isEditing(), ...(kind === "image" ? { src: this.selected.getAttribute("src") ?? "", alt: this.selected.getAttribute("alt") ?? "" } : {}) });
  }

  private isEditing(): boolean { return this.selected?.getAttribute("contenteditable") === "true"; }
  isComposing(): boolean { return this.composing; }
  private finishEditing(commit: boolean): void {
    if (this.composing) { this.deferredFinish = true; return; }
    if (!this.isEditing()) return;
    if (commit) this.flush();
    this.selected?.removeAttribute("contenteditable"); this.selected?.removeAttribute("spellcheck"); this.emitSelection();
  }
  private getSelection(): Selection | null { return (this.root as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.() ?? window.getSelection(); }
  rememberSelection = () => { const selection = this.getSelection(); if (selection?.rangeCount && this.selected?.contains(selection.getRangeAt(0).commonAncestorContainer)) this.savedRange = selection.getRangeAt(0).cloneRange(); };
  private restoreSelection(): boolean { if (!this.savedRange || !this.selected?.contains(this.savedRange.commonAncestorContainer)) { this.savedRange = null; return false; }
    this.selected.focus({ preventScroll: true }); const selection = this.getSelection(); selection?.removeAllRanges(); selection?.addRange(this.savedRange); return true; }
  private wrapSelection(tag: "strong" | "em" | "u"): void {
    if (this.composing || !this.restoreSelection()) return; const selection = this.getSelection(); const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || range.collapsed || !this.selected?.contains(range.commonAncestorContainer)) return;
    if (range.cloneContents().querySelector("ul,ol,li,div,p,button,img")) return;
    this.beforeOperation();
    const wrapper = document.createElement(tag); wrapper.append(range.extractContents()); range.insertNode(wrapper); range.selectNodeContents(wrapper); selection?.removeAllRanges(); selection?.addRange(range); this.savedRange = range.cloneRange(); this.commit();
  }

  private serialize(): string {
    if (!this.surface) return this.builder.html; const clone = this.surface.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[contenteditable],[spellcheck],[tabindex]").forEach(element => { element.removeAttribute("contenteditable"); element.removeAttribute("spellcheck"); element.removeAttribute("tabindex"); });
    return clone.innerHTML;
  }

  private syncStructuredContent(only?: HTMLElement | null): void {
    if (!this.surface) return;
    if (!only) this.fieldErrors.clear();
    for (const [marker, limit] of [["heading", 160], ["body", 2000], ["primary", 80], ["secondary", 80]] as const) {
      if (only && (only.getAttribute("data-movcues-content") ?? only.getAttribute("data-movcues-action-id")) !== marker) continue;
      const element = only ?? this.surface.querySelector(`[data-movcues-content="${marker}"],[data-movcues-action-id="${marker}"]`);
      if (!element) continue;
      const errors: string[] = [];
      const value = componentPlainText(element);
      if (marker === "heading" || marker === "body") this.content[marker] = value;
      else { const action = marker === "primary" ? this.content.primaryAction : this.content.secondaryAction; if (action) action.label = value; }
      if (!value) errors.push(`${marker}: enter text before saving.`);
      if (value.length > limit) errors.push(`${marker}: use at most ${limit} characters (${value.length} entered).`);
      this.fieldErrors.set(marker, errors);
    }
    this.errors = Array.from(this.fieldErrors.values()).flat(); this.callbacks.onValidation?.(this.errors);
  }

  snapshot(): { builder: WidgetBuilderState; content: ExperienceContent } {
    const content = JSON.parse(JSON.stringify(this.content)) as ExperienceContent;
    for (const marker of ["heading", "body", "primary", "secondary"] as const) {
      const element = this.surface?.querySelector(`[data-movcues-content="${marker}"],[data-movcues-action-id="${marker}"]`);
      if (!element) continue;
      const text = componentPlainText(element);
      if (marker === "heading" || marker === "body") content[marker] = text;
      else { const action = marker === "primary" ? content.primaryAction : content.secondaryAction; if (action) action.label = text; }
    }
    return { builder: { ...this.builder, html: this.serialize() }, content };
  }

  getValidation(): string[] { this.syncStructuredContent(); return [...this.errors]; }

  /** Flush DOM into the draft before saving or replacing a rendered step. */
  flush(): boolean {
    if (this.composing) return false;
    clearTimeout(this.transactionTimer); this.transactionTimer = 0;
    if (this.pending) {
      this.pending = false;
      this.syncStructuredContent(); this.builder.html = this.serialize();
      this.builder.projectData = { ...this.builder.projectData, movcues: { authoringSurface: "onsite", schemaVersion: 1 } };
      this.pushHistory(); this.emitSelection();
    }
    return true;
  }

  private commit(typing = false): void {
    this.pending = true;
    this.syncStructuredContent(typing ? this.selected : undefined);
    if (typing) { clearTimeout(this.transactionTimer); this.transactionTimer = window.setTimeout(() => this.flush(), 300); }
    else this.flush();
    this.callbacks.onChange(); this.scheduleOutline();
  }

  private sanitizeActive(): void {
    if (!this.selected || !this.selected.childElementCount) return;
    const wrapper = document.createElement("section"); wrapper.className = "movcues-widget"; wrapper.innerHTML = this.selected.innerHTML;
    const nodes = sanitizeBuilderHtml(wrapper.outerHTML);
    const safe = nodes?.find(node => node instanceof HTMLElement) as HTMLElement | undefined;
    if (!safe) return;
    if (this.selectionKind(this.selected) === "button") {
      safe.querySelectorAll("ul,ol,li,div,p,button,a,img").forEach(node => node.replaceWith(document.createTextNode(node.textContent ?? "")));
    }
    safe.querySelectorAll("[data-movcues-content],[data-movcues-action-id]").forEach(node => { node.removeAttribute("data-movcues-content"); node.removeAttribute("data-movcues-action-id"); });
    if (safe.innerHTML !== this.selected.innerHTML) {
      const caret = this.selectionOffsets(); this.selected.innerHTML = safe.innerHTML; this.savedRange = null; this.restoreOffsets(caret.start, caret.end);
    }
  }

  private beforeOperation(): void {
    this.flush();
    const current = this.history[this.historyIndex];
    if (current) Object.assign(current, this.selectionState());
  }
  private selectionOffsets(): { start: number; end: number } {
    const selection = this.getSelection();
    if (!this.selected || !selection?.rangeCount || !this.selected.contains(selection.getRangeAt(0).commonAncestorContainer)) return { start: 0, end: 0 };
    const range = selection.getRangeAt(0); const prefix = range.cloneRange(); prefix.selectNodeContents(this.selected); prefix.setEnd(range.startContainer, range.startOffset);
    return { start: prefix.toString().length, end: prefix.toString().length + range.toString().length };
  }
  private selectionState() { return { key: this.componentKey(this.selected), editing: this.isEditing(), ...this.selectionOffsets() }; }
  private restoreOffsets(start: number, end: number): void {
    if (!this.selected) return;
    const walker = document.createTreeWalker(this.selected, NodeFilter.SHOW_TEXT); const nodes: Text[] = []; let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Text);
    if (!nodes.length) { this.selected.append(document.createTextNode("")); nodes.push(this.selected.firstChild as Text); }
    const locate = (offset: number): [Text, number] => { for (const text of nodes) { if (offset <= text.length) return [text, offset]; offset -= text.length; } const last = nodes[nodes.length - 1]; return [last, last.length]; };
    const range = document.createRange(); range.setStart(...locate(start)); range.setEnd(...locate(end));
    const selection = this.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); this.savedRange = range.cloneRange();
  }
  private pushHistory(): void {
    const html = this.builder.html;
    if (this.history[this.historyIndex]?.html === html) return;
    const content = JSON.parse(JSON.stringify(this.content)) as ExperienceContent;
    this.history.splice(this.historyIndex + 1);
    this.history.push({ html, content, ...this.selectionState(), bytes: (html.length + JSON.stringify(content).length) * 2 });
    while (this.history.length > 1 && (this.history.length > 50 || this.history.reduce((n, entry) => n + entry.bytes, 0) > MAX_HISTORY_BYTES)) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }
  private moveHistory(delta: -1 | 1): boolean {
    if (this.composing) return false;
    this.flush(); const next = this.historyIndex + delta;
    if (!this.surface || next < 0 || next >= this.history.length) return false;
    const state = this.history[next]; this.historyIndex = next;
    this.savedRange = null; this.hovered = null; this.surface.innerHTML = state.html; this.tabStops.clear(); this.makeFocusable(); this.builder.html = state.html;
    for (const key of Object.keys(this.content)) delete (this.content as unknown as Record<string, unknown>)[key];
    Object.assign(this.content, JSON.parse(JSON.stringify(state.content)));
    this.selected = this.findByKey(state.key);
    if (state.editing && this.selected) { this.editSelected(); this.restoreOffsets(state.start, state.end); }
    this.syncStructuredContent(); this.renderOutline(); this.emitSelection(); this.callbacks.onChange(); return true;
  }
  private componentKey(component: HTMLElement | null): string | null { if (!component || !this.surface) return null; const marker = component.getAttribute("data-movcues-content") ?? component.getAttribute("data-movcues-action-id"); if (marker) return `${component.tagName}:${marker}`; return component.tagName === "IMG" ? `IMG:${Array.from(this.surface.querySelectorAll("img")).indexOf(component as HTMLImageElement)}` : null; }
  private findByKey(key: string | null): HTMLElement | null {
    if (!key || !this.surface) return null; const [tag, marker] = key.split(":");
    if (tag === "IMG") return this.surface.querySelectorAll<HTMLElement>("img")[Number(marker)] ?? null;
    return Array.from(this.surface.querySelectorAll<HTMLElement>(SELECTABLE)).find(element => (element.getAttribute("data-movcues-content") ?? element.getAttribute("data-movcues-action-id")) === marker) ?? null;
  }

  private scheduleOutline = () => { cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(() => this.renderOutline()); };
  private renderOutline(): void {
    const component = this.selected ?? this.hovered; if (!component?.isConnected) { this.outline.hidden = true; return; }
    const rect = component.getBoundingClientRect(); this.outline.hidden = false; this.outline.toggleAttribute("data-hover", !this.selected);
    Object.assign(this.outline.style, { left: `${rect.left - 2}px`, top: `${rect.top - 2}px`, width: `${rect.width + 4}px`, height: `${rect.height + 4}px` });
  }
}
