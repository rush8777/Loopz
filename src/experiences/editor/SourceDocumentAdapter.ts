import { checklistCopy, type OnsiteChecklistContext } from "../checklist/ChecklistMarkup";
import postcss from "postcss";
import type { ExperienceContent, SurveyQuestion, WidgetBuilderState } from "../types";
import { cloneOnsite, compileOnsiteDocument, createBlock, emptyCell, findCell, parentCell, onsiteId, type OnsiteBlock, type OnsiteCell, type OnsiteDocument } from "../onsite/OnsiteDocument";
import { applySourceMarkup, sourceContext, sourceElement, validateSourceMarkup, type ReplaceMarkupOperation } from "./SourceAuthoring";
import { sourceComponentKind } from "./SourceEditability";
import { SourceStyles, remapSourceSelector } from "./SourceStyles";

type Options = Parameters<typeof validateSourceMarkup>[1];
export interface SourceSnapshot { builder: WidgetBuilderState; content: ExperienceContent }
const cells = (cell: OnsiteCell): OnsiteCell[] => [cell, ...(cell.children ?? []).flatMap(cells)];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const parse = (html: string): HTMLElement => { const template = document.createElement("template"); template.innerHTML = html; const root = template.content.firstElementChild; if (!(root instanceof HTMLElement)) throw new Error("Source has no widget root."); return root; };

/** Storage adapter only. The document is an ephemeral inspector/interaction view;
 * it is never compiled into, or saved as, a structured onsiteDocument.
 */
export class SourceDocumentAdapter {
  readonly upgraded: boolean;
  private view: OnsiteDocument;
  private root: HTMLElement;
  private duplicates = new Map<string, string>();
  private pendingHtml = new Map<string, string>();

  constructor(private builder: WidgetBuilderState, private content: ExperienceContent, private options: Options) {
    this.root = parse(builder.html);
    const metadata = builder.projectData.movcues as Record<string, unknown>;
    this.upgraded = metadata.sourceEditabilityVersion !== 1;
    if (this.upgraded) {
      const previous = this.root.cloneNode(true) as HTMLElement; this.addLegacyIdentities(this.root);
      const before = [previous, ...Array.from(previous.querySelectorAll("*"))], after = [this.root, ...Array.from(this.root.querySelectorAll("*"))];
      postcss.parse(builder.css).walkRules(rule => {
        for (const selector of rule.selectors) if (before.some((element, index) => element.matches(selector) !== after[index].matches(selector))) throw new Error("Editing identities would change this legacy design's CSS selectors. Its original source is preserved.");
      });
    }
    const errors = validateSourceMarkup(this.operation(this.root.outerHTML), { ...options, editable: true });
    if (errors.length) throw new Error(`This source design cannot be edited safely: ${errors.join(" ")} Its original source is preserved.`);
    if (this.upgraded) applySourceMarkup(builder, content, this.operation(this.root.outerHTML), options);
    this.view = this.project();
  }

  setContracts(questions?: NonNullable<Options["survey"]>["questions"], items?: NonNullable<Options["checklist"]>["items"]): void {
    if (questions) this.options.survey = { questions };
    if (items) this.options.checklist = { items };
  }
  getDocument(): OnsiteDocument { return cloneOnsite(this.view); }
  snapshot(): SourceSnapshot { return { builder: cloneOnsite(this.builder), content: cloneOnsite(this.content) }; }
  restore(snapshot: SourceSnapshot, view: OnsiteDocument): void {
    Object.assign(this.builder, cloneOnsite(snapshot.builder)); Object.assign(this.content, cloneOnsite(snapshot.content));
    this.root = parse(this.builder.html); this.view = cloneOnsite(view); this.duplicates.clear(); this.pendingHtml.clear();
  }
  captureButtonHtml(blockId: string, html: string): void { this.pendingHtml.set(blockId, html); }
  refresh(): void { this.root = parse(this.builder.html); this.view = this.project(); }
  synchronizeQuestion(next: SurveyQuestion, current: SurveyQuestion, questions: SurveyQuestion[]): void {
    const options = (question: SurveyQuestion) => "options" in question ? question.options.map(option => option.id) : question.type === "rating" ? [question.min, question.max] : [];
    if (next.id !== current.id || next.type !== current.type || !same(options(next), options(current))) throw new Error("Source question type and answer identities are protected. Its label, input settings and visual styles remain editable.");
    const root = this.root.cloneNode(true) as HTMLElement, group = root.querySelector<HTMLElement>(`[data-movcues-question-id="${next.id}"]`);
    if (!group) throw new Error("The canonical question is missing from this source design.");
    const label = Array.from(group.children).find(element => element.tagName === "P");
    if (!label) throw new Error("The canonical question label is missing.");
    label.textContent = `${next.label}${next.required ? " *" : ""}`;
    if (next.type === "short_text" || next.type === "long_text") {
      const input = group.querySelector<HTMLElement>("[data-movcues-question-input]")!;
      input.setAttribute("aria-label", next.label); input.setAttribute("placeholder", next.placeholder ?? ""); input.setAttribute("maxlength", String(next.maxLength ?? 10000));
      if (next.required) input.setAttribute("aria-required", "true"); else input.removeAttribute("aria-required");
    } else if ("options" in next) for (const option of next.options) { const node = group.querySelector(`[data-movcues-option-id="${option.id}"]`); if (node) node.textContent = option.label; }
    // This path is an explicit canonical edit, validated against the updated question union.
    const contract = { ...this.options, survey: { questions }, previousHtml: "" };
    applySourceMarkup(this.builder, this.content, this.operation(root.outerHTML), contract);
    this.options.survey = { questions }; this.refresh();
  }
  synchronizeChecklist(next: OnsiteChecklistContext): void {
    if (!same(next.items.map(item => item.id), this.options.checklist?.items.map(item => item.id))) throw new Error("Protected source task identities must remain unchanged.");
    const root = this.root.cloneNode(true) as HTMLElement, copy = checklistCopy(next);
    const text = (selector: string, value: string) => {
      const element = root.querySelector<HTMLElement>(selector); if (!element || element.textContent === value) return;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); const nodes: Node[] = []; let node: Node | null;
      while ((node = walker.nextNode())) if (node.textContent?.trim()) nodes.push(node);
      if (nodes.length > 1) throw new Error("This protected label contains composed text. Use AI to change it while retaining its design.");
      if (nodes[0]) nodes[0].textContent = value; else element.append(document.createTextNode(value));
    };
    for (const [role, value] of Object.entries(copy)) if (role !== "remaining-count") text(`[data-movcues-checklist-role="${role}"]`, value);
    text('[data-movcues-checklist-role="completion-acknowledge"]', next.completionMessage.acknowledgeLabel);
    for (const item of next.items) for (const role of ["title", "description"] as const) text(`[data-movcues-checklist-item-id="${item.id}"] [data-movcues-checklist-item-role="${role}"]`, item[role] ?? "");
    applySourceMarkup(this.builder, this.content, this.operation(root.outerHTML), this.options);
    this.refresh();
  }
  duplicate(from: string, to: string): void { this.duplicates.set(to, from); }
  removeCell(view: OnsiteDocument, id: string): boolean {
    const parent = parentCell(view, id); if (!parent?.children) return false;
    parent.children = parent.children.filter(cell => cell.id !== id); return true;
  }
  isProtected(cellId: string): boolean {
    const element = this.element(cellId);
    return !!element && (sourceComponentKind(sourceElement(element)) === "protected" || !!element.querySelector("[data-movcues-question-id],[data-movcues-survey-controls],[data-movcues-checklist-role],[data-movcues-checklist-view],[data-movcues-checklist-item-id]"));
  }
  componentIsCell(id: string): boolean { return Boolean(this.element(id)?.dataset.movcuesBlockId); }
  canResize(parentId: string): boolean { const el = this.element(parentId); return !!el && this.styles().value(el, "display") === "flex"; }

  validate(view: OnsiteDocument): string[] {
    try { this.candidate(view); return []; } catch (error) { return [error instanceof Error ? error.message : "Invalid source edit."]; }
  }
  apply(view: OnsiteDocument): { html: string; css: string; content: ExperienceContent } {
    if (!same(view, this.view)) {
      const operation = this.candidate(view);
      applySourceMarkup(this.builder, this.content, operation, { ...this.options, previousHtml: this.builder.html });
      this.root = parse(this.builder.html); this.view = cloneOnsite(view); this.duplicates.clear(); this.pendingHtml.clear();
    }
    return { html: this.builder.html, css: this.builder.css, content: this.content };
  }

  private operation(html = this.builder.html, css = this.builder.css): ReplaceMarkupOperation {
    return { type: "replace_markup", html, css, actionBindings: sourceContext(this.builder, this.options.guide).actionBindings as ReplaceMarkupOperation["actionBindings"] };
  }
  prepareSurface(surface: HTMLElement): void {
    for (const cell of cells(this.view.root)) {
      const el = this.element(cell.id, surface.querySelector<HTMLElement>(".movcues-widget")!);
      if (el && !el.dataset.movcuesNodeId) el.dataset.movcuesNodeId = cell.id;
    }
  }
  private element(id: string, root = this.root): HTMLElement | undefined {
    const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
    const node = elements.find(el => el.dataset.movcuesNodeId === id); if (node) return node;
    const block = this.view && findCell(this.view, id)?.block;
    return block ? elements.find(el => el.dataset.movcuesBlockId === block.id) : undefined;
  }
  private styles(): SourceStyles { return new SourceStyles(this.builder.css, this.root); }

  private addLegacyIdentities(element: HTMLElement): void {
    // Only add identity attributes; never wrap, simplify, or change source styles.
    const facts = sourceElement(element);
    const kind = sourceComponentKind(facts);
    element.dataset.movcuesNodeId ||= onsiteId("cell");
    if (kind !== "layout" || facts.text.trim() && !element.classList.contains("movcues-widget")) {
      element.dataset.movcuesBlockId ||= onsiteId("block"); return;
    }
    Array.from(element.children).forEach(child => this.addLegacyIdentities(child as HTMLElement));
  }

  private project(): OnsiteDocument {
    const styles = this.styles();
    const projectCell = (element: HTMLElement): OnsiteCell => {
      const value = (property: string) => styles.value(element, property);
      const number = (property: string, fallback: number) => Number.parseFloat(value(property) ?? "") || fallback;
      const cell = { ...emptyCell(), id: element.dataset.movcuesNodeId ?? `view_${element.dataset.movcuesBlockId}`, direction: value("flex-direction") === "row" || (value("grid-template-columns")?.split(/\s+/).length ?? 0) > 1 ? "row" as const : "column" as const };
      const basis = value("flex-basis"), width = value("width"), fixed = basis?.endsWith("px") ? basis : width?.endsWith("px") ? width : undefined;
      const grow = Number.parseFloat(value("flex-grow") ?? "0");
      cell.sizing = fixed ? { mode: "fixed", value: Math.max(24, Math.min(1200, Number.parseFloat(fixed))) } : grow > 0 ? { mode: "flexible", weight: grow } : { mode: "hug" };
      cell.responsiveStack = element.dataset.movcuesResponsiveStack === "true";
      cell.gap = Math.min(96, Math.max(0, number("gap", 0)));
      cell.padding = { top: number("padding-top", number("padding", 0)), right: number("padding-right", number("padding", 0)), bottom: number("padding-bottom", number("padding", 0)), left: number("padding-left", number("padding", 0)) };
      cell.style = { background: value("background") ?? value("background-color"), borderWidth: number("border-width", 0), borderRadius: number("border-radius", 0) };
      const facts = sourceElement(element), kind = sourceComponentKind(facts);
      if (kind === "layout") {
        const children = Array.from(element.children) as HTMLElement[];
        if (children.length === 1 && children[0].dataset.movcuesBlockId && !children[0].dataset.movcuesNodeId) cell.block = projectCell(children[0]).block;
        else cell.children = children.map(projectCell);
        return cell;
      }
      const id = element.dataset.movcuesBlockId!, fontSize = number("font-size", 15), color = value("color");
      if (kind === "protected") {
        const role = element.dataset.movcuesChecklistRole;
        cell.block = element.dataset.movcuesQuestionId ? { id, type: "question", questionId: element.dataset.movcuesQuestionId, fontSize, color }
          : element.hasAttribute("data-movcues-survey-controls") ? { id, type: "survey_controls" }
          : element.dataset.movcuesChecklistItemId ? { id, type: "checklist_task", itemId: element.dataset.movcuesChecklistItemId, fontSize, color, indicator: "check" }
          : role && ["title", "description", "launcher-label", "remaining-count", "completion-title", "completion-description"].includes(role) ? { id, type: "checklist_text", role: role as "title", fontSize, color }
          : role && ["collapse", "dismiss", "completion-acknowledge"].includes(role) ? { id, type: "checklist_control", role: role as "collapse", fontSize, color }
          : { id, type: "checklist_progress", fontSize, color };
      } else if (element.tagName === "IMG") cell.block = { ...createBlock("image"), id, type: "image", src: element.getAttribute("src") ?? "", alt: element.getAttribute("alt") ?? "", fit: value("object-fit") === "contain" ? "contain" : "cover", width: 100, radius: number("border-radius", 0) };
      else if (element.tagName === "BUTTON") {
        const actionId = element.dataset.movcuesActionId!, action = this.operation().actionBindings[actionId];
        cell.block = { ...createBlock("button", this.options.guide), id, type: "button", label: element.textContent ?? "", action: { id: actionId, ...action }, variant: "primary", width: "hug", radius: number("border-radius", 8), paddingX: number("padding-left", 16), paddingY: number("padding-top", 9) };
      } else if (element.tagName === "HR") cell.block = { id, type: "divider", orientation: "horizontal", thickness: number("height", 1), color: value("background") ?? "#dbe2ea" };
      else if (element.classList.contains("movcues-spacer")) cell.block = { id, type: "spacer", size: number("height", 24) };
      else if (element.classList.contains("movcues-icon") || element.getAttribute("role") === "img") cell.block = { id, type: "icon", icon: (element.getAttribute("aria-label") ?? "info") as "info", size: fontSize, color };
      else {
        const base = { id, html: element.innerHTML, fontSize, weight: number("font-weight", 400) as 400, color, lineHeight: number("line-height", 1.5) };
        cell.block = /^H[1-4]$/.test(element.tagName) ? { ...base, type: "heading", level: Number(element.tagName[1]) as 2 } : { ...base, type: "text" };
      }
      return cell;
    };
    return { schemaVersion: 2, id: "source_inspector_view", root: projectCell(this.root) };
  }

  private candidate(view: OnsiteDocument): ReplaceMarkupOperation {
    const root = this.root.cloneNode(true) as HTMLElement, styles = new SourceStyles(this.builder.css, root);
    const old = new Map(cells(this.view.root).map(cell => [cell.id, cell]));
    const original = new Map(cells(this.view.root).map(cell => [cell.id, this.element(cell.id, root)!]));
    const nextIds = new Set(cells(view.root).map(cell => cell.id));
    // Protected functional units and their ancestors cannot be removed/duplicated/reparented.
    const parent = (doc: OnsiteDocument, id: string) => cells(doc.root).find(cell => cell.children?.some(child => child.id === id));
    for (const cell of old.values()) if (this.isProtected(cell.id)) {
      const next = findCell(view, cell.id);
      if (!next || !same(next.block, cell.block) && cell.block && !same({ ...next.block, fontSize: undefined, color: undefined, align: undefined }, { ...cell.block, fontSize: undefined, color: undefined, align: undefined }) || parent(view, cell.id)?.id !== parent(this.view, cell.id)?.id) throw new Error("Protected Survey/Checklist components must keep their structure and parent. Style their container instead.");
      const before = parent(this.view, cell.id)?.children?.filter(value => this.isProtected(value.id)).map(value => value.id);
      const after = parent(view, cell.id)?.children?.filter(value => this.isProtected(value.id)).map(value => value.id);
      if (!same(before, after)) throw new Error("Protected component order cannot be changed visually.");
    }
    const operation = this.operation(); operation.actionBindings = {};
    const build = (cell: OnsiteCell): HTMLElement => {
      let element = original.get(cell.id);
      const previous = old.get(cell.id);
      if (!element) {
        const duplicatedFrom = this.duplicates.get(cell.id);
        if (duplicatedFrom) {
          const from = findCell(this.view, duplicatedFrom)!;
          if (this.isProtected(from.id)) throw new Error("Protected components cannot be duplicated.");
          this.cloneDuplicate(from, cell, original, old, styles, root);
          element = original.get(cell.id);
        }
      }
      if (!element) { element = document.createElement("div"); element.dataset.movcuesNodeId = cell.id; }
      if (cell.block) {
        const previousBlock = previous?.block ?? old.get(cell.id)?.block;
        let component = element.dataset.movcuesBlockId === cell.block.id ? element : element.querySelector<HTMLElement>(`[data-movcues-block-id="${cell.block.id}"]`);
        if (!component) { component = this.newBlock(cell.block, styles); if (element === root) throw new Error("The widget root must remain a layout."); element.replaceChildren(component); }
        this.updateBlock(component, cell.block, previousBlock, styles);
        if (cell.block.type === "button") { const { id, ...action } = cell.block.action; operation.actionBindings[id] = action; }
      } else {
        const children = (cell.children ?? []).map(build);
        if (element.children.length !== children.length || children.some((child, index) => child !== element!.children[index])) element.replaceChildren(...children);
      }
      this.updateCell(element, cell, previous ?? old.get(cell.id), styles);
      return element;
    };
    const built = build(view.root);
    if (built !== root) throw new Error("The source root identity must remain stable.");
    for (const [id, element] of original) if (!nextIds.has(id) && element !== root) element.remove();
    styles.removeIdentities(Array.from(old.values()).filter(cell => !nextIds.has(cell.id)).flatMap(cell => [cell.id, ...(cell.block ? [cell.block.id] : [])]));
    operation.html = root.outerHTML; operation.css = styles.toString();
    const errors = validateSourceMarkup(operation, { ...this.options, editable: true, previousHtml: this.builder.html });
    if (errors.length) throw new Error(errors.join(" "));
    return operation;
  }

  private cloneDuplicate(from: OnsiteCell, to: OnsiteCell, elements: Map<string, HTMLElement>, old: Map<string, OnsiteCell>, styles: SourceStyles, root: HTMLElement): void {
    const element = elements.get(from.id)!.cloneNode(true) as HTMLElement;
    const mapping = new Map<string, string>();
    const map = (a: OnsiteCell, b: OnsiteCell) => { mapping.set(a.id, b.id); if (a.block && b.block) { mapping.set(a.block.id, b.block.id); if (a.block.type === "button" && b.block.type === "button") mapping.set(a.block.action.id, b.block.action.id); } a.children?.forEach((child, index) => map(child, b.children![index])); };
    map(from, to);
    for (const el of [element, ...Array.from(element.querySelectorAll<HTMLElement>("*"))]) {
      el.removeAttribute("id");
      for (const key of ["data-movcues-node-id", "data-movcues-block-id", "data-movcues-action-id"]) { const value = el.getAttribute(key); if (value && mapping.has(value)) el.setAttribute(key, mapping.get(value)!); }
    }
    const register = (cell: OnsiteCell): void => { const el = this.element(cell.id, element) ?? [element, ...Array.from(element.querySelectorAll<HTMLElement>("*"))].find(el => el.dataset.movcuesBlockId === cell.block?.id)!; elements.set(cell.id, el); old.set(cell.id, cloneOnsite(cell)); cell.children?.forEach(register); };
    register(to);
    // Clone only selectors tied to the duplicated identities, retaining media wrappers.
    const sheet = postcss.parse(styles.toString()), additions = postcss.root();
    sheet.each(node => {
      const copy = node.clone(); let found = false;
      const remap = (rule: postcss.Rule): void => { let changed = false; for (const key of ["node", "block"]) { const selector = remapSourceSelector(rule.selector, `data-movcues-${key}-id`, mapping); if (selector !== rule.selector) { rule.selector = selector; changed = true; } } if (!changed) rule.remove(); else found = true; };
      if (copy.type === "rule") remap(copy); else if (copy.type === "atrule") copy.walkRules(remap); else return;
      if (found) additions.append(copy);
    });
    // Kept in the same parsed stylesheet, not an accumulating per-edit override stream.
    for (const node of additions.nodes) styles.append(node);
    void root;
  }

  private newBlock(block: OnsiteBlock, styles: SourceStyles): HTMLElement {
    if (["question", "survey_controls", "checklist_task", "checklist_text", "checklist_control", "checklist_progress"].includes(block.type)) throw new Error("Insert protected components through their canonical editor.");
    const compiled = compileOnsiteDocument({ schemaVersion: 2, id: "source_insert", root: emptyCell(block) }, this.options.widgetType);
    const element = parse(compiled.html).querySelector<HTMLElement>(`[data-movcues-block-id="${block.id}"]`)!;
    const css = postcss.parse(compiled.css);
    css.walkRules(rule => { if (rule.parent?.type === "root" && rule.selector.includes(`[data-movcues-block-id="${block.id}"]`)) styles.append(rule.clone()); });
    return element;
  }

  private updateCell(el: HTMLElement, cell: OnsiteCell, before: OnsiteCell | undefined, styles: SourceStyles): void {
    const changed = <K extends keyof OnsiteCell>(key: K) => !before || !same(cell[key], before[key]);
    if (!before || changed("direction")) { styles.set(el, "display", "flex"); styles.set(el, "flex-direction", cell.direction); }
    if (changed("align")) styles.set(el, "align-items", cell.align);
    if (changed("justify")) styles.set(el, "justify-content", cell.justify);
    if (changed("gap")) styles.set(el, "gap", `${cell.gap}px`);
    if (changed("padding")) for (const side of ["top", "right", "bottom", "left"] as const) if (!before || cell.padding[side] !== before.padding[side]) styles.set(el, `padding-${side}`, `${cell.padding[side]}px`);
    if (changed("sizing")) {
      const size = cell.sizing; el.dataset.movcuesSizing = size.mode;
      if (size.mode === "fixed") {
        styles.set(el, "flex-basis", `${size.value}px`);
        const parent = el.parentElement;
        if (!parent || styles.value(parent, "display") !== "flex") styles.set(el, "width", `${size.value}px`);
      }
      else styles.set(el, "flex", size.mode === "hug" ? "0 0 auto" : `${size.weight} 1 0px`);
    }
    if (changed("style")) for (const [key, property, unit] of [["background", "background", ""], ["borderWidth", "border-width", "px"], ["borderColor", "border-color", ""], ["borderRadius", "border-radius", "px"]] as const) {
      const value = cell.style?.[key]; if (value !== undefined && value !== before?.style?.[key]) { styles.set(el, property, `${value}${unit}`); if (key === "borderWidth") styles.set(el, "border-style", "solid"); }
    }
    if (changed("responsiveStack")) styles.responsiveStack(el, Boolean(cell.responsiveStack));
  }

  private updateBlock(el: HTMLElement, block: OnsiteBlock, before: OnsiteBlock | undefined, styles: SourceStyles): void {
    const current = block as unknown as Record<string, unknown>, previous = before as unknown as Record<string, unknown> | undefined;
    const changed = (key: string) => previous && !same(current[key], previous[key]);
    if ((block.type === "text" || block.type === "heading") && changed("html")) {
      // Preserve markup attributes/classes on surviving inline elements. The editor supplies DOM HTML.
      el.innerHTML = block.html;
    }
    if (block.type === "button" && changed("label")) {
      const edited = this.pendingHtml.get(block.id);
      if (edited !== undefined) el.innerHTML = edited;
      else {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const nodes: Node[] = []; let node: Node | null;
        while ((node = walker.nextNode())) if (node.textContent?.trim() && !node.parentElement?.closest('[aria-hidden="true"],[role="img"]')) nodes.push(node);
        if (nodes.length > 1) throw new Error("This button has composed text. Double-click its label to edit it while preserving its markup.");
        if (nodes[0]) nodes[0].textContent = block.label; else el.append(document.createTextNode(block.label));
      }
    }
    if (block.type === "image") { if (changed("src")) el.setAttribute("src", block.src); if (changed("alt")) el.setAttribute("alt", block.alt); }
    const properties: Array<[string, string, string]> = [["align", "text-align", ""], ["fontSize", "font-size", "px"], ["lineHeight", "line-height", ""], ["weight", "font-weight", ""], ["color", block.type === "divider" ? "background" : "color", ""], ["background", "background", ""], ["radius", "border-radius", "px"], ["fit", "object-fit", ""]];
    for (const [key, property, unit] of properties) if (changed(key) && current[key] !== undefined) styles.set(el, property, `${current[key]}${unit}`);
    if (block.type === "button") {
      if (changed("paddingX")) { styles.set(el, "padding-left", `${block.paddingX}px`); styles.set(el, "padding-right", `${block.paddingX}px`); }
      if (changed("paddingY")) { styles.set(el, "padding-top", `${block.paddingY}px`); styles.set(el, "padding-bottom", `${block.paddingY}px`); }
      if (changed("width")) styles.set(el, "width", block.width === "full" ? "100%" : "auto");
      if (changed("variant")) { styles.set(el, "background", block.variant === "primary" ? "#2563eb" : "transparent"); styles.set(el, "border", block.variant === "outline" ? "1px solid currentColor" : "0"); }
    }
    if (block.type === "image" && changed("width")) styles.set(el, "width", `${block.width}%`);
    if (block.type === "divider" && changed("thickness")) styles.set(el, "height", `${block.thickness}px`);
    if (block.type === "spacer" && changed("size")) styles.set(el, "height", `${block.size}px`);
    if (block.type === "icon" && changed("size")) styles.set(el, "font-size", `${block.size}px`);
    if (block.type === "icon" && changed("icon")) { const compiled = this.newBlock(block, new SourceStyles("", this.root)); el.innerHTML = compiled.innerHTML; el.setAttribute("aria-label", block.icon); }
  }
}
