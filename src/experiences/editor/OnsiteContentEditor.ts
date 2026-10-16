import type { ExperienceContent, WidgetBuilderState } from "../types";
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
  onSelectionChange(selection: OnsiteComponentSelection | null): void;
}

const SELECTABLE = "[data-movcues-content],[data-movcues-action-id],img";
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
  private history: string[] = [];
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
    window.addEventListener("scroll", this.scheduleOutline, true);
    window.addEventListener("resize", this.scheduleOutline);
    this.pushHistory();
    return true;
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.finishEditing(false);
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
    window.removeEventListener("scroll", this.scheduleOutline, true);
    window.removeEventListener("resize", this.scheduleOutline);
    this.outline.remove(); this.style.remove();
    this.callbacks.onSelectionChange(null);
  }

  editSelected(): void {
    if (!this.selected || this.selectionKind(this.selected) === "image") return;
    this.selected.contentEditable = "true";
    this.selected.setAttribute("spellcheck", "true");
    this.selected.focus({ preventScroll: true });
    this.emitSelection();
  }

  deselect(): void { this.finishEditing(true); this.selected = null; this.savedRange = null; this.renderOutline(); this.callbacks.onSelectionChange(null); }

  formatInline(tag: "strong" | "em" | "u"): void { this.wrapSelection(tag); }

  applyLink(url: string): boolean {
    if (!builderLinkUrlIsSafe(url) || !this.restoreSelection()) return false;
    const selection = this.getSelection(); const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || range.collapsed || !this.selected?.contains(range.commonAncestorContainer)) return false;
    const anchor = document.createElement("a"); anchor.href = url; if (/^https?:\/\//i.test(url)) { anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; }
    anchor.append(range.extractContents()); range.insertNode(anchor); selection?.removeAllRanges(); range.selectNodeContents(anchor); selection?.addRange(range); this.savedRange = range.cloneRange(); this.commit(); return true;
  }

  setAlignment(alignment: "left" | "center" | "right"): void {
    if (!this.selected || this.selectionKind(this.selected) === "image") return;
    this.selected.classList.remove(...ALIGNMENT_CLASSES); this.selected.classList.add(`movcues-align-${alignment}`); this.commit();
  }

  toggleList(kind: "ul" | "ol"): void {
    if (!this.selected || this.selectionKind(this.selected) === "image") return;
    let component = this.selected;
    if (component.tagName === "P") {
      const replacement = document.createElement("div");
      for (const attribute of Array.from(component.attributes)) replacement.setAttribute(attribute.name, attribute.value);
      replacement.innerHTML = component.innerHTML; component.replaceWith(replacement); component = replacement; this.selected = replacement;
    }
    const list = document.createElement(kind); const lines = (component.innerText || component.textContent || "").split(/\n+/).map(value => value.trim()).filter(Boolean);
    for (const line of lines.length ? lines : [""]) { const item = document.createElement("li"); item.textContent = line; list.appendChild(item); }
    component.replaceChildren(list); this.commit(); component.focus({ preventScroll: true });
  }

  updateImage(src: string, alt: string): boolean {
    if (!this.selected || this.selected.tagName !== "IMG" || !builderImageUrlIsSafe(src)) return false;
    if (src) this.selected.setAttribute("src", src); else this.selected.removeAttribute("src");
    this.selected.setAttribute("alt", alt.slice(0, 500)); this.commit(); this.emitSelection(); return true;
  }

  undo(): boolean { return this.moveHistory(-1); }
  redo(): boolean { return this.moveHistory(1); }
  canUndo(): boolean { return this.historyIndex > 0; }
  canRedo(): boolean { return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1; }

  private onPointerOver = (event: Event) => { const component = this.componentFrom(event); if (!component || component === this.hovered) return; this.hovered = component; this.renderOutline(); };
  private onPointerOut = (event: Event) => { const related = (event as PointerEvent).relatedTarget; if (related instanceof Node && this.hovered?.contains(related)) return; this.hovered = null; this.renderOutline(); };
  private onClick = (event: Event) => {
    const component = this.componentFrom(event); if (!component) return;
    event.preventDefault(); event.stopImmediatePropagation(); this.finishEditing(true); this.selected = component; this.renderOutline(); this.emitSelection();
  };
  private onDoubleClick = (event: Event) => { const component = this.componentFrom(event); if (!component) return; event.preventDefault(); event.stopImmediatePropagation(); this.selected = component; this.editSelected(); };
  private onInput = (event: Event) => { if (!this.selected?.contains(event.target as Node) || this.composing) return; this.rememberSelection(); this.commit(); };
  private onCompositionStart = () => { this.composing = true; };
  private onCompositionEnd = () => { this.composing = false; this.rememberSelection(); this.commit(); };
  private onKeyDown = (event: Event) => {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.key === "Escape") { keyEvent.preventDefault(); this.deselect(); return; }
    if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "z") { keyEvent.preventDefault(); keyEvent.shiftKey ? this.redo() : this.undo(); return; }
    if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "y") { keyEvent.preventDefault(); this.redo(); return; }
    if (keyEvent.key === "Enter" && this.selected && (this.selected.matches("[data-movcues-content=heading]") || this.selected.matches("[data-movcues-action-id]"))) { keyEvent.preventDefault(); this.finishEditing(true); }
  };
  private onPaste = (event: Event) => {
    if (!this.selected?.isContentEditable) return;
    const paste = event as ClipboardEvent; const text = paste.clipboardData?.getData("text/plain"); if (text === undefined) return;
    paste.preventDefault(); const selection = this.getSelection(); if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0); range.deleteContents(); const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); this.savedRange = range.cloneRange(); this.commit();
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
    this.callbacks.onSelectionChange({ kind, label: kind === "image" ? "Image" : this.selected.getAttribute("data-movcues-content") ?? `${this.selected.getAttribute("data-movcues-action-id") ?? "button"} button`, editing: this.selected.isContentEditable, ...(kind === "image" ? { src: this.selected.getAttribute("src") ?? "", alt: this.selected.getAttribute("alt") ?? "" } : {}) });
  }

  private finishEditing(commit: boolean): void { if (!this.selected?.isContentEditable) return; this.selected.removeAttribute("contenteditable"); this.selected.removeAttribute("spellcheck"); if (commit) this.commit(); this.emitSelection(); }
  private getSelection(): Selection | null { return (this.root as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.() ?? window.getSelection(); }
  private rememberSelection = () => { const selection = this.getSelection(); if (selection?.rangeCount && this.selected?.contains(selection.getRangeAt(0).commonAncestorContainer)) this.savedRange = selection.getRangeAt(0).cloneRange(); };
  private restoreSelection(): boolean { if (!this.savedRange) return false; const selection = this.getSelection(); selection?.removeAllRanges(); selection?.addRange(this.savedRange); return true; }
  private wrapSelection(tag: "strong" | "em" | "u"): void {
    if (!this.restoreSelection()) return; const selection = this.getSelection(); const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || range.collapsed || !this.selected?.contains(range.commonAncestorContainer)) return;
    const wrapper = document.createElement(tag); wrapper.append(range.extractContents()); range.insertNode(wrapper); range.selectNodeContents(wrapper); selection?.removeAllRanges(); selection?.addRange(range); this.savedRange = range.cloneRange(); this.commit();
  }

  private serialize(): string {
    if (!this.surface) return this.builder.html; const clone = this.surface.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[contenteditable],[spellcheck]").forEach(element => { element.removeAttribute("contenteditable"); element.removeAttribute("spellcheck"); });
    return clone.innerHTML;
  }

  private syncStructuredContent(): void {
    if (!this.surface) return;
    const heading = this.surface.querySelector<HTMLElement>('[data-movcues-content="heading"]')?.textContent?.trim();
    const body = this.surface.querySelector<HTMLElement>('[data-movcues-content="body"]')?.textContent?.trim();
    const primary = this.surface.querySelector<HTMLElement>('[data-movcues-action-id="primary"]')?.textContent?.trim();
    const secondary = this.surface.querySelector<HTMLElement>('[data-movcues-action-id="secondary"]')?.textContent?.trim();
    if (heading) this.content.heading = heading.slice(0, 160); if (body) this.content.body = body.slice(0, 2000);
    if (primary && this.content.primaryAction) this.content.primaryAction.label = primary.slice(0, 80);
    if (secondary && this.content.secondaryAction) this.content.secondaryAction.label = secondary.slice(0, 80);
  }

  private commit(): void {
    this.syncStructuredContent(); this.builder.html = this.serialize();
    this.builder.projectData = { ...this.builder.projectData, movcues: { authoringSurface: "onsite", schemaVersion: 1 } };
    this.pushHistory(); this.callbacks.onChange(); this.renderOutline(); this.emitSelection();
  }

  private pushHistory(): void { const html = this.serialize(); if (this.history[this.historyIndex] === html) return; this.history.splice(this.historyIndex + 1); this.history.push(html); if (this.history.length > 50) this.history.shift(); this.historyIndex = this.history.length - 1; }
  private moveHistory(delta: -1 | 1): boolean {
    const next = this.historyIndex + delta; if (!this.surface || next < 0 || next >= this.history.length) return false;
    const key = this.componentKey(this.selected); this.historyIndex = next; this.surface.innerHTML = this.history[next]; this.builder.html = this.history[next]; this.syncStructuredContent(); this.selected = this.findByKey(key); this.renderOutline(); this.emitSelection(); this.callbacks.onChange(); return true;
  }
  private componentKey(component: HTMLElement | null): string | null { if (!component || !this.surface) return null; const marker = component.getAttribute("data-movcues-content") ?? component.getAttribute("data-movcues-action-id"); if (marker) return `${component.tagName}:${marker}`; return component.tagName === "IMG" ? `IMG:${Array.from(this.surface.querySelectorAll("img")).indexOf(component as HTMLImageElement)}` : null; }
  private findByKey(key: string | null): HTMLElement | null { if (!key || !this.surface) return null; const [tag, marker] = key.split(":"); if (tag === "IMG") return this.surface.querySelectorAll<HTMLElement>("img")[Number(marker)] ?? null; return this.surface.querySelector<HTMLElement>(`[data-movcues-content="${CSS.escape(marker)}"],[data-movcues-action-id="${CSS.escape(marker)}"]`); }

  private scheduleOutline = () => { cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(() => this.renderOutline()); };
  private renderOutline(): void {
    const component = this.selected ?? this.hovered; if (!component?.isConnected) { this.outline.hidden = true; return; }
    const rect = component.getBoundingClientRect(); this.outline.hidden = false; this.outline.toggleAttribute("data-hover", !this.selected);
    Object.assign(this.outline.style, { left: `${rect.left - 2}px`, top: `${rect.top - 2}px`, width: `${rect.width + 4}px`, height: `${rect.height + 4}px` });
  }
}
