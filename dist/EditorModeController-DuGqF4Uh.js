import { c as computeElementRole, a as computeElementLabel, b as builderLinkUrlIsSafe, d as builderImageUrlIsSafe, s as sanitizeBuilderHtml, E as ExperienceRenderer, R as RouteObserver, e as clearEditorContinuation, i as isGuideDefinition, g as getGuideStepPattern, f as guideStepRequiresTarget, h as findTarget, j as storeEditorContinuation } from "./module-CO7H_BO_.js";
class EditorBridge {
  constructor(apiBase, sessionId, accessToken) {
    this.apiBase = apiBase;
    this.sessionId = sessionId;
    this.accessToken = accessToken;
  }
  headers() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.accessToken}` };
  }
  async load() {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { headers: this.headers(), credentials: "omit" });
    if ([401, 403, 404, 410].includes(response.status)) throw new EditorSessionExpiredError();
    if (!response.ok) throw new Error("Draft could not be loaded");
    return response.json();
  }
  async save(definition, revision) {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { method: "PATCH", headers: this.headers(), credentials: "omit", body: JSON.stringify({ definition, revision }) });
    if (!response.ok) {
      const body2 = await response.json().catch(() => null);
      if (response.status === 409 && (body2 == null ? void 0 : body2.error) === "draft_conflict") throw new DraftConflictError(body2.currentRevision);
      if (response.status === 401 || response.status === 404 || response.status === 410 || response.status === 403 && (body2 == null ? void 0 : body2.error) === "invalid_editor_access") throw new EditorSessionExpiredError();
      throw new Error((body2 == null ? void 0 : body2.error) ? `Draft could not be saved: ${body2.error}` : "Draft could not be saved");
    }
    const body = await response.json();
    return body.version;
  }
}
class DraftConflictError extends Error {
  constructor(currentRevision) {
    super("Draft changed in another editor");
    this.currentRevision = currentRevision;
  }
}
class EditorSessionExpiredError extends Error {
  constructor() {
    super("Editor session expired");
  }
}
class HighlightOverlay {
  constructor() {
    this.element = document.createElement("div");
    this.element.dataset.movcuesPickerOverlay = "";
    this.element.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #2563eb;background:rgba(37,99,235,.12);display:none;box-sizing:border-box";
    document.documentElement.appendChild(this.element);
  }
  show(target) {
    const rect = target.getBoundingClientRect();
    Object.assign(this.element.style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }
  hide() {
    this.element.style.display = "none";
  }
  destroy() {
    this.element.remove();
  }
}
const STABLE_DATA_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy", "data-analytics-id"];
const SEMANTIC_ATTRS = ["role", "aria-label", "name", "type", "href"];
const DYNAMIC_CLASS_PATTERN = /^(css-|sc-|jsx-|_|[a-z0-9]{6,}$)/i;
const UTILITY_CLASS_PATTERN = /^(sm:|md:|lg:|xl:|2xl:|hover:|focus:|active:|disabled:|dark:|-?(m|p)[trblxy]?-|w-|h-|min-|max-|inset-|top-|right-|bottom-|left-|z-|gap-|space-|grid|flex|items-|justify-|text-|font-|leading-|tracking-|bg-|border|rounded|shadow|opacity-|transition|duration-|absolute$|relative$|fixed$|sticky$|hidden$|block$|inline)/;
class TargetSelectorGenerator {
  generate(element) {
    const verified = [];
    const seen = /* @__PURE__ */ new Set();
    const add = (selector, reliability) => {
      if (!selector || seen.has(selector)) return;
      seen.add(selector);
      if (uniquelyMatches(selector, element)) verified.push({ selector, reliability });
    };
    const tag = element.tagName.toLowerCase();
    const id = shortValue(element.getAttribute("id"));
    if (id) add(`${tag}#${cssIdentifier(id)}`, "reliable");
    for (const selector of attributeSelectors(element, STABLE_DATA_ATTRS)) add(selector, "reliable");
    const semantics = attributeSelectors(element, SEMANTIC_ATTRS);
    for (const selector of semantics) add(selector, "moderate");
    for (const selector of attributeCombinations(element, SEMANTIC_ATTRS)) add(selector, "moderate");
    for (const selector of classSelectors(element)) add(selector, "moderate");
    const childSelectors = [...semantics, ...attributeCombinations(element, SEMANTIC_ATTRS), ...classSelectors(element), tag];
    let ancestor = element.parentElement;
    let depth = 1;
    while (ancestor && ancestor !== document.documentElement && depth <= 4) {
      const relation = depth === 1 ? " > " : " ";
      for (const parentSelector of identitySelectors(ancestor)) {
        for (const childSelector of childSelectors) add(`${parentSelector}${relation}${childSelector}`, "moderate");
      }
      ancestor = ancestor.parentElement;
      depth++;
    }
    for (const selector of structuralSelectors(element)) add(selector, "fragile");
    const primary = verified[0];
    if (!primary) throw new Error("Could not generate a unique selector for the selected element");
    return { primarySelector: primary.selector, fallbackSelectors: verified.slice(1, 6).map((item) => item.selector), reliability: primary.reliability };
  }
  describe(element) {
    return {
      ...this.generate(element),
      label: computeElementLabel(element),
      role: computeElementRole(element),
      tagName: element.tagName.toLowerCase()
    };
  }
}
function attributeSelectors(element, attributes) {
  const tag = element.tagName.toLowerCase();
  return attributes.flatMap((attribute) => {
    const value = shortValue(element.getAttribute(attribute));
    return value ? [`${tag}[${attribute}="${cssString(value)}"]`] : [];
  });
}
function attributeCombinations(element, attributes) {
  const tag = element.tagName.toLowerCase();
  const present = attributes.flatMap((attribute) => {
    const value = shortValue(element.getAttribute(attribute));
    return value ? [{ attribute, value }] : [];
  });
  const selectors = [];
  for (let first = 0; first < present.length; first++) {
    for (let second = first + 1; second < present.length; second++) {
      selectors.push(`${tag}[${present[first].attribute}="${cssString(present[first].value)}"][${present[second].attribute}="${cssString(present[second].value)}"]`);
    }
  }
  return selectors;
}
function classSelectors(element) {
  const tag = element.tagName.toLowerCase();
  const classes = (element.getAttribute("class") ?? "").split(/\s+/).filter(isStableClass).slice(0, 4);
  if (!classes.length) return [];
  const selectors = [`${tag}.${classes.map(cssIdentifier).join(".")}`];
  if (classes.length > 1) {
    for (let first = 0; first < classes.length; first++) for (let second = first + 1; second < classes.length; second++) selectors.push(`${tag}.${cssIdentifier(classes[first])}.${cssIdentifier(classes[second])}`);
  }
  selectors.push(...classes.map((value) => `${tag}.${cssIdentifier(value)}`));
  return [...new Set(selectors)];
}
function identitySelectors(element) {
  const tag = element.tagName.toLowerCase();
  const selectors = [];
  const id = shortValue(element.getAttribute("id"));
  if (id) selectors.push(`${tag}#${cssIdentifier(id)}`);
  selectors.push(...attributeSelectors(element, STABLE_DATA_ATTRS), ...attributeSelectors(element, SEMANTIC_ATTRS), ...attributeCombinations(element, SEMANTIC_ATTRS), ...classSelectors(element));
  return [...new Set(selectors)];
}
function structuralSelectors(element) {
  const selectors = [];
  const parts = [];
  let node = element;
  while (node && node !== document.documentElement) {
    const parent = node.parentElement;
    let part = node.tagName.toLowerCase();
    if (parent) {
      const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === node.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    selectors.push(parts.join(" > "));
    node = parent;
  }
  return selectors;
}
function uniquelyMatches(selector, selected) {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === selected;
  } catch {
    return false;
  }
}
function shortValue(value) {
  return value && value.length <= 160 ? value : null;
}
function isStableClass(value) {
  const unescaped = value.replace(/\\/g, "");
  return !!unescaped && !/^\d/.test(unescaped) && !DYNAMIC_CLASS_PATTERN.test(unescaped) && !UTILITY_CLASS_PATTERN.test(unescaped);
}
function cssIdentifier(value) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
function cssString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n\f]/g, " ");
}
class ElementPicker {
  constructor() {
    this.overlay = null;
    this.generator = new TargetSelectorGenerator();
    this.resolve = null;
    this.shiftPassthrough = false;
    this.move = (event) => {
      var _a, _b, _c;
      if (this.shiftPassthrough || event.shiftKey) {
        (_a = this.overlay) == null ? void 0 : _a.hide();
        return;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (target && !isMovcuesSurface(target)) (_b = this.overlay) == null ? void 0 : _b.show(target);
      else (_c = this.overlay) == null ? void 0 : _c.hide();
    };
    this.click = (event) => {
      var _a;
      if (this.shiftPassthrough || event.shiftKey || event.composedPath().some((item) => item instanceof Element && isMovcuesSurface(item))) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!target || isMovcuesSurface(target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        this.finish(this.generator.describe(target));
      } catch {
        (_a = this.overlay) == null ? void 0 : _a.hide();
      }
    };
    this.keyDown = (event) => {
      var _a;
      if (event.key === "Escape") this.finish(null);
      else if (event.key === "Shift") {
        this.shiftPassthrough = true;
        (_a = this.overlay) == null ? void 0 : _a.hide();
      }
    };
    this.keyUp = (event) => {
      if (event.key === "Shift") this.shiftPassthrough = false;
    };
    this.resetPassthrough = () => {
      this.shiftPassthrough = false;
    };
  }
  pick() {
    this.cancel();
    this.overlay = new HighlightOverlay();
    document.addEventListener("pointermove", this.move, true);
    document.addEventListener("click", this.click, true);
    document.addEventListener("keydown", this.keyDown, true);
    document.addEventListener("keyup", this.keyUp, true);
    window.addEventListener("blur", this.resetPassthrough);
    document.addEventListener("visibilitychange", this.resetPassthrough);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
  cancel() {
    if (this.resolve) this.finish(null);
    else this.cleanup();
  }
  finish(value) {
    const resolve = this.resolve;
    this.resolve = null;
    this.cleanup();
    resolve == null ? void 0 : resolve(value);
  }
  cleanup() {
    var _a;
    document.removeEventListener("pointermove", this.move, true);
    document.removeEventListener("click", this.click, true);
    document.removeEventListener("keydown", this.keyDown, true);
    document.removeEventListener("keyup", this.keyUp, true);
    window.removeEventListener("blur", this.resetPassthrough);
    document.removeEventListener("visibilitychange", this.resetPassthrough);
    this.shiftPassthrough = false;
    (_a = this.overlay) == null ? void 0 : _a.destroy();
    this.overlay = null;
  }
}
function isMovcuesSurface(element) {
  if (element.closest("[data-movcues-editor],[data-movcues-experience],[data-movcues-picker-overlay]")) return true;
  const root = element.getRootNode();
  return root instanceof ShadowRoot && isMovcuesSurface(root.host);
}
const SELECTABLE = "[data-movcues-content],[data-movcues-action-id],img";
const MAX_HISTORY_BYTES = 2e6;
function componentPlainText(element) {
  const readChildren = (parent) => {
    let result = "";
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent ?? "";
        continue;
      }
      if (node instanceof Element && node.tagName === "BR") {
        result += "\n";
        continue;
      }
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
class OnsiteContentEditor {
  constructor(root, builder, content, callbacks) {
    this.root = root;
    this.builder = builder;
    this.content = content;
    this.callbacks = callbacks;
    this.selected = null;
    this.hovered = null;
    this.frame = 0;
    this.composing = false;
    this.savedRange = null;
    this.history = [];
    this.transactionTimer = 0;
    this.pending = false;
    this.errors = [];
    this.fieldErrors = /* @__PURE__ */ new Map();
    this.deferredFinish = false;
    this.tabStops = /* @__PURE__ */ new Map();
    this.historyIndex = -1;
    this.onFocus = (event) => {
      const component = this.componentFrom(event);
      if (!component || component === this.selected || this.composing) return;
      this.finishEditing(true);
      this.selected = component;
      this.savedRange = null;
      this.renderOutline();
      this.emitSelection();
    };
    this.onPointerOver = (event) => {
      const component = this.componentFrom(event);
      if (!component || component === this.hovered) return;
      this.hovered = component;
      this.renderOutline();
    };
    this.onPointerOut = (event) => {
      var _a;
      const related = event.relatedTarget;
      if (related instanceof Node && ((_a = this.hovered) == null ? void 0 : _a.contains(related))) return;
      this.hovered = null;
      this.renderOutline();
    };
    this.onClick = (event) => {
      const component = this.componentFrom(event);
      if (!component) {
        this.finishEditing(true);
        return;
      }
      if (component === this.selected && this.isEditing()) {
        if (event.target.closest("a")) event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.composing) return;
      this.finishEditing(true);
      this.selected = component;
      this.savedRange = null;
      this.renderOutline();
      this.emitSelection();
    };
    this.onDoubleClick = (event) => {
      const component = this.componentFrom(event);
      if (!component || this.composing) return;
      event.stopImmediatePropagation();
      if (component === this.selected && this.isEditing()) return;
      this.finishEditing(true);
      this.selected = component;
      this.editSelected();
    };
    this.onOutsidePointer = (event) => {
      const path = event.composedPath();
      if (path.includes(this.root.host) || path.some((node) => node instanceof HTMLElement && node.hasAttribute("data-movcues-editor"))) return;
      this.finishEditing(true);
    };
    this.onInput = (event) => {
      var _a;
      if (!((_a = this.selected) == null ? void 0 : _a.contains(event.target)) || this.composing) return;
      this.sanitizeActive();
      this.rememberSelection();
      this.commit(true);
    };
    this.onCompositionStart = () => {
      this.beforeOperation();
      this.composing = true;
    };
    this.onCompositionEnd = () => {
      this.composing = false;
      this.sanitizeActive();
      this.rememberSelection();
      this.commit();
      if (this.deferredFinish) {
        this.deferredFinish = false;
        this.finishEditing(true);
      }
    };
    this.onBeforeInput = (event) => {
      const input = event;
      if (/^(insertFromDrop|insertFromPaste|insertHTML)$/.test(input.inputType)) event.preventDefault();
      const formatting = { formatBold: "strong", formatItalic: "em", formatUnderline: "u" };
      if (input.inputType in formatting) {
        event.preventDefault();
        this.rememberSelection();
        this.formatInline(formatting[input.inputType]);
      }
    };
    this.onDrop = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.onKeyDown = (event) => {
      const keyEvent = event;
      if (this.composing || keyEvent.isComposing || keyEvent.keyCode === 229) return;
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "a" && this.isEditing() && this.selected) {
        keyEvent.preventDefault();
        const range = document.createRange();
        range.selectNodeContents(this.selected);
        const selection = this.getSelection();
        selection == null ? void 0 : selection.removeAllRanges();
        selection == null ? void 0 : selection.addRange(range);
        this.savedRange = range.cloneRange();
        return;
      }
      if ((keyEvent.key === "Enter" || keyEvent.key === " ") && this.selected && !this.isEditing() && this.selectionKind(this.selected) !== "image") {
        keyEvent.preventDefault();
        this.editSelected();
        return;
      }
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        const component = this.selected;
        this.deselect();
        component == null ? void 0 : component.focus({ preventScroll: true });
        return;
      }
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "z") {
        keyEvent.preventDefault();
        keyEvent.shiftKey ? this.redo() : this.undo();
        return;
      }
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "y") {
        keyEvent.preventDefault();
        this.redo();
        return;
      }
      if (keyEvent.key === "Enter" && this.selected && (this.selected.matches("[data-movcues-content=heading]") || this.selected.matches("[data-movcues-action-id]"))) {
        keyEvent.preventDefault();
        this.finishEditing(true);
      }
    };
    this.onPaste = (event) => {
      var _a, _b;
      if (!this.isEditing() || this.composing) return;
      const paste = event;
      const text = (_a = paste.clipboardData) == null ? void 0 : _a.getData("text/plain");
      if (text === void 0) return;
      paste.preventDefault();
      const selection = this.getSelection();
      if (!(selection == null ? void 0 : selection.rangeCount)) return;
      const range = selection.getRangeAt(0);
      if (!((_b = this.selected) == null ? void 0 : _b.contains(range.commonAncestorContainer))) return;
      this.beforeOperation();
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      this.savedRange = range.cloneRange();
      this.commit();
    };
    this.rememberSelection = () => {
      var _a;
      const selection = this.getSelection();
      if ((selection == null ? void 0 : selection.rangeCount) && ((_a = this.selected) == null ? void 0 : _a.contains(selection.getRangeAt(0).commonAncestorContainer))) this.savedRange = selection.getRangeAt(0).cloneRange();
    };
    this.scheduleOutline = () => {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.renderOutline());
    };
    this.surface = root.querySelector("[data-movcues-builder-surface]");
    this.style = document.createElement("style");
    this.style.dataset.movcuesAuthoringStyle = "";
    this.style.textContent = `[data-movcues-authoring-outline]{position:fixed;z-index:2147483646;pointer-events:none;border:1.5px solid #2563eb;border-radius:5px;box-shadow:0 0 0 2px rgba(37,99,235,.12);transition:none}[data-movcues-authoring-outline][data-hover]{border-style:dashed;opacity:.72}`;
    this.outline = document.createElement("div");
    this.outline.dataset.movcuesAuthoringOutline = "";
    this.outline.hidden = true;
  }
  start() {
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
  destroy() {
    var _a, _b;
    cancelAnimationFrame(this.frame);
    this.flush();
    clearTimeout(this.transactionTimer);
    this.finishEditing(false);
    (_a = this.selected) == null ? void 0 : _a.removeAttribute("contenteditable");
    (_b = this.selected) == null ? void 0 : _b.removeAttribute("spellcheck");
    this.composing = false;
    this.selected = null;
    this.hovered = null;
    this.savedRange = null;
    this.history = [];
    this.historyIndex = -1;
    this.root.removeEventListener("focusin", this.onFocus, true);
    for (const [element, original] of this.tabStops) {
      if (original === null) element.removeAttribute("tabindex");
      else element.setAttribute("tabindex", original);
    }
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
    this.outline.remove();
    this.style.remove();
    this.callbacks.onSelectionChange(null);
  }
  editSelected() {
    if (!this.selected || this.selectionKind(this.selected) === "image") return;
    if (this.isEditing()) {
      this.selected.focus({ preventScroll: true });
      return;
    }
    this.selected.setAttribute("contenteditable", "true");
    this.selected.setAttribute("spellcheck", "true");
    this.selected.focus({ preventScroll: true });
    const current = this.history[this.historyIndex];
    if (current) Object.assign(current, this.selectionState());
    this.emitSelection();
  }
  deselect() {
    if (this.composing) {
      this.deferredFinish = true;
      return;
    }
    this.finishEditing(true);
    this.selected = null;
    this.savedRange = null;
    this.renderOutline();
    this.callbacks.onSelectionChange(null);
  }
  formatInline(tag) {
    this.wrapSelection(tag);
  }
  applyLink(url) {
    var _a, _b, _c, _d;
    if (this.composing || !this.selected || this.selectionKind(this.selected) !== "text" || !builderLinkUrlIsSafe(url) || !this.restoreSelection()) return false;
    const selection = this.getSelection();
    const range = (selection == null ? void 0 : selection.rangeCount) ? selection.getRangeAt(0) : null;
    if (!range || range.collapsed || !((_a = this.selected) == null ? void 0 : _a.contains(range.commonAncestorContainer))) return false;
    if (((_b = this.selected) == null ? void 0 : _b.closest("a")) || ((_c = range.startContainer.parentElement) == null ? void 0 : _c.closest("a")) || ((_d = range.endContainer.parentElement) == null ? void 0 : _d.closest("a")) || range.cloneContents().querySelector("a")) return false;
    this.beforeOperation();
    const anchor = document.createElement("a");
    anchor.href = url;
    if (/^https?:\/\//i.test(url)) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    anchor.append(range.extractContents());
    range.insertNode(anchor);
    selection == null ? void 0 : selection.removeAllRanges();
    range.selectNodeContents(anchor);
    selection == null ? void 0 : selection.addRange(range);
    this.savedRange = range.cloneRange();
    this.commit();
    return true;
  }
  setAlignment(alignment) {
    if (this.composing || !this.selected || this.selectionKind(this.selected) !== "text") return;
    this.beforeOperation();
    this.selected.classList.remove(...ALIGNMENT_CLASSES);
    this.selected.classList.add(`movcues-align-${alignment}`);
    this.commit();
  }
  toggleList(kind) {
    if (this.composing || !this.selected || this.selected.getAttribute("data-movcues-content") !== "body") return;
    this.beforeOperation();
    let component = this.selected;
    if (component.tagName === "P") {
      const replacement = document.createElement("div");
      for (const attribute of Array.from(component.attributes)) replacement.setAttribute(attribute.name, attribute.value);
      replacement.append(...Array.from(component.childNodes));
      this.tabStops.delete(component);
      replacement.removeAttribute("tabindex");
      component.replaceWith(replacement);
      component = replacement;
      this.selected = replacement;
      this.makeFocusable();
    }
    const existing = component.querySelector("ul,ol");
    if (existing) {
      if (existing.tagName.toLowerCase() !== kind) {
        const list = document.createElement(kind);
        list.append(...Array.from(existing.childNodes));
        existing.replaceWith(list);
      } else {
        const fragment = document.createDocumentFragment();
        Array.from(existing.children).forEach((item, i) => {
          if (i) fragment.append(document.createElement("br"));
          fragment.append(...Array.from(item.childNodes));
        });
        existing.replaceWith(fragment);
      }
    } else {
      const list = document.createElement(kind);
      let item = document.createElement("li");
      list.append(item);
      for (const node of Array.from(component.childNodes)) {
        if (node instanceof Element && node.tagName === "BR") {
          item = document.createElement("li");
          list.append(item);
        } else if (node instanceof Element && /^(P|DIV)$/.test(node.tagName)) {
          if (item.childNodes.length) {
            item = document.createElement("li");
            list.append(item);
          }
          item.append(...Array.from(node.childNodes));
        } else item.append(node);
      }
      component.replaceChildren(list);
    }
    this.savedRange = null;
    this.commit();
    component.focus({ preventScroll: true });
  }
  updateImage(src, alt) {
    if (!this.selected || this.selected.tagName !== "IMG" || !builderImageUrlIsSafe(src) || alt.length > 500) return false;
    this.beforeOperation();
    if (src) this.selected.setAttribute("src", src);
    else this.selected.removeAttribute("src");
    this.selected.setAttribute("alt", alt);
    this.commit();
    this.emitSelection();
    return true;
  }
  undo() {
    return this.moveHistory(-1);
  }
  redo() {
    return this.moveHistory(1);
  }
  canUndo() {
    return this.pending || this.historyIndex > 0;
  }
  canRedo() {
    return !this.pending && this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
  }
  makeFocusable() {
    var _a;
    (_a = this.surface) == null ? void 0 : _a.querySelectorAll(SELECTABLE).forEach((element) => {
      if (!this.tabStops.has(element)) this.tabStops.set(element, element.getAttribute("tabindex"));
      element.setAttribute("tabindex", "0");
    });
  }
  componentFrom(event) {
    if (!this.surface) return null;
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const component = target.closest(SELECTABLE);
    return component && this.surface.contains(component) ? component : null;
  }
  selectionKind(component) {
    return component.tagName === "IMG" ? "image" : component.hasAttribute("data-movcues-action-id") ? "button" : "text";
  }
  emitSelection() {
    if (!this.selected) return this.callbacks.onSelectionChange(null);
    const kind = this.selectionKind(this.selected);
    this.callbacks.onSelectionChange({ kind, label: kind === "image" ? "Image" : this.selected.getAttribute("data-movcues-content") ?? `${this.selected.getAttribute("data-movcues-action-id") ?? "button"} button`, editing: this.isEditing(), ...kind === "image" ? { src: this.selected.getAttribute("src") ?? "", alt: this.selected.getAttribute("alt") ?? "" } : {} });
  }
  isEditing() {
    var _a;
    return ((_a = this.selected) == null ? void 0 : _a.getAttribute("contenteditable")) === "true";
  }
  isComposing() {
    return this.composing;
  }
  finishEditing(commit) {
    var _a, _b;
    if (this.composing) {
      this.deferredFinish = true;
      return;
    }
    if (!this.isEditing()) return;
    if (commit) this.flush();
    (_a = this.selected) == null ? void 0 : _a.removeAttribute("contenteditable");
    (_b = this.selected) == null ? void 0 : _b.removeAttribute("spellcheck");
    this.emitSelection();
  }
  getSelection() {
    var _a, _b;
    return ((_b = (_a = this.root).getSelection) == null ? void 0 : _b.call(_a)) ?? window.getSelection();
  }
  restoreSelection() {
    var _a;
    if (!this.savedRange || !((_a = this.selected) == null ? void 0 : _a.contains(this.savedRange.commonAncestorContainer))) {
      this.savedRange = null;
      return false;
    }
    this.selected.focus({ preventScroll: true });
    const selection = this.getSelection();
    selection == null ? void 0 : selection.removeAllRanges();
    selection == null ? void 0 : selection.addRange(this.savedRange);
    return true;
  }
  wrapSelection(tag) {
    var _a;
    if (this.composing || !this.restoreSelection()) return;
    const selection = this.getSelection();
    const range = (selection == null ? void 0 : selection.rangeCount) ? selection.getRangeAt(0) : null;
    if (!range || range.collapsed || !((_a = this.selected) == null ? void 0 : _a.contains(range.commonAncestorContainer))) return;
    if (range.cloneContents().querySelector("ul,ol,li,div,p,button,img")) return;
    this.beforeOperation();
    const wrapper = document.createElement(tag);
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
    range.selectNodeContents(wrapper);
    selection == null ? void 0 : selection.removeAllRanges();
    selection == null ? void 0 : selection.addRange(range);
    this.savedRange = range.cloneRange();
    this.commit();
  }
  serialize() {
    if (!this.surface) return this.builder.html;
    const clone = this.surface.cloneNode(true);
    clone.querySelectorAll("[contenteditable],[spellcheck],[tabindex]").forEach((element) => {
      element.removeAttribute("contenteditable");
      element.removeAttribute("spellcheck");
      element.removeAttribute("tabindex");
    });
    return clone.innerHTML;
  }
  syncStructuredContent(only) {
    var _a, _b;
    if (!this.surface) return;
    if (!only) this.fieldErrors.clear();
    for (const [marker, limit] of [["heading", 160], ["body", 2e3], ["primary", 80], ["secondary", 80]]) {
      if (only && (only.getAttribute("data-movcues-content") ?? only.getAttribute("data-movcues-action-id")) !== marker) continue;
      const element = only ?? this.surface.querySelector(`[data-movcues-content="${marker}"],[data-movcues-action-id="${marker}"]`);
      if (!element) continue;
      const errors = [];
      const value = componentPlainText(element);
      if (marker === "heading" || marker === "body") this.content[marker] = value;
      else {
        const action = marker === "primary" ? this.content.primaryAction : this.content.secondaryAction;
        if (action) action.label = value;
      }
      if (!value) errors.push(`${marker}: enter text before saving.`);
      if (value.length > limit) errors.push(`${marker}: use at most ${limit} characters (${value.length} entered).`);
      this.fieldErrors.set(marker, errors);
    }
    this.errors = Array.from(this.fieldErrors.values()).flat();
    (_b = (_a = this.callbacks).onValidation) == null ? void 0 : _b.call(_a, this.errors);
  }
  snapshot() {
    var _a;
    const content = JSON.parse(JSON.stringify(this.content));
    for (const marker of ["heading", "body", "primary", "secondary"]) {
      const element = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-content="${marker}"],[data-movcues-action-id="${marker}"]`);
      if (!element) continue;
      const text = componentPlainText(element);
      if (marker === "heading" || marker === "body") content[marker] = text;
      else {
        const action = marker === "primary" ? content.primaryAction : content.secondaryAction;
        if (action) action.label = text;
      }
    }
    return { builder: { ...this.builder, html: this.serialize() }, content };
  }
  getValidation() {
    this.syncStructuredContent();
    return [...this.errors];
  }
  /** Flush DOM into the draft before saving or replacing a rendered step. */
  flush() {
    if (this.composing) return false;
    clearTimeout(this.transactionTimer);
    this.transactionTimer = 0;
    if (this.pending) {
      this.pending = false;
      this.syncStructuredContent();
      this.builder.html = this.serialize();
      this.builder.projectData = { ...this.builder.projectData, movcues: { authoringSurface: "onsite", schemaVersion: 1 } };
      this.pushHistory();
      this.emitSelection();
    }
    return true;
  }
  commit(typing = false) {
    this.pending = true;
    this.syncStructuredContent(typing ? this.selected : void 0);
    if (typing) {
      clearTimeout(this.transactionTimer);
      this.transactionTimer = window.setTimeout(() => this.flush(), 300);
    } else this.flush();
    this.callbacks.onChange();
    this.scheduleOutline();
  }
  sanitizeActive() {
    if (!this.selected || !this.selected.childElementCount) return;
    const wrapper = document.createElement("section");
    wrapper.className = "movcues-widget";
    wrapper.innerHTML = this.selected.innerHTML;
    const nodes = sanitizeBuilderHtml(wrapper.outerHTML);
    const safe = nodes == null ? void 0 : nodes.find((node) => node instanceof HTMLElement);
    if (!safe) return;
    if (this.selectionKind(this.selected) === "button") {
      safe.querySelectorAll("ul,ol,li,div,p,button,a,img").forEach((node) => node.replaceWith(document.createTextNode(node.textContent ?? "")));
    }
    safe.querySelectorAll("[data-movcues-content],[data-movcues-action-id]").forEach((node) => {
      node.removeAttribute("data-movcues-content");
      node.removeAttribute("data-movcues-action-id");
    });
    if (safe.innerHTML !== this.selected.innerHTML) {
      const caret = this.selectionOffsets();
      this.selected.innerHTML = safe.innerHTML;
      this.savedRange = null;
      this.restoreOffsets(caret.start, caret.end);
    }
  }
  beforeOperation() {
    this.flush();
    const current = this.history[this.historyIndex];
    if (current) Object.assign(current, this.selectionState());
  }
  selectionOffsets() {
    const selection = this.getSelection();
    if (!this.selected || !(selection == null ? void 0 : selection.rangeCount) || !this.selected.contains(selection.getRangeAt(0).commonAncestorContainer)) return { start: 0, end: 0 };
    const range = selection.getRangeAt(0);
    const prefix = range.cloneRange();
    prefix.selectNodeContents(this.selected);
    prefix.setEnd(range.startContainer, range.startOffset);
    return { start: prefix.toString().length, end: prefix.toString().length + range.toString().length };
  }
  selectionState() {
    return { key: this.componentKey(this.selected), editing: this.isEditing(), ...this.selectionOffsets() };
  }
  restoreOffsets(start, end) {
    if (!this.selected) return;
    const walker = document.createTreeWalker(this.selected, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while (node = walker.nextNode()) nodes.push(node);
    if (!nodes.length) {
      this.selected.append(document.createTextNode(""));
      nodes.push(this.selected.firstChild);
    }
    const locate = (offset) => {
      for (const text of nodes) {
        if (offset <= text.length) return [text, offset];
        offset -= text.length;
      }
      const last = nodes[nodes.length - 1];
      return [last, last.length];
    };
    const range = document.createRange();
    range.setStart(...locate(start));
    range.setEnd(...locate(end));
    const selection = this.getSelection();
    selection == null ? void 0 : selection.removeAllRanges();
    selection == null ? void 0 : selection.addRange(range);
    this.savedRange = range.cloneRange();
  }
  pushHistory() {
    var _a;
    const html = this.builder.html;
    if (((_a = this.history[this.historyIndex]) == null ? void 0 : _a.html) === html) return;
    const content = JSON.parse(JSON.stringify(this.content));
    this.history.splice(this.historyIndex + 1);
    this.history.push({ html, content, ...this.selectionState(), bytes: (html.length + JSON.stringify(content).length) * 2 });
    while (this.history.length > 1 && (this.history.length > 50 || this.history.reduce((n, entry) => n + entry.bytes, 0) > MAX_HISTORY_BYTES)) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }
  moveHistory(delta) {
    if (this.composing) return false;
    this.flush();
    const next = this.historyIndex + delta;
    if (!this.surface || next < 0 || next >= this.history.length) return false;
    const state = this.history[next];
    this.historyIndex = next;
    this.savedRange = null;
    this.hovered = null;
    this.surface.innerHTML = state.html;
    this.tabStops.clear();
    this.makeFocusable();
    this.builder.html = state.html;
    for (const key of Object.keys(this.content)) delete this.content[key];
    Object.assign(this.content, JSON.parse(JSON.stringify(state.content)));
    this.selected = this.findByKey(state.key);
    if (state.editing && this.selected) {
      this.editSelected();
      this.restoreOffsets(state.start, state.end);
    }
    this.syncStructuredContent();
    this.renderOutline();
    this.emitSelection();
    this.callbacks.onChange();
    return true;
  }
  componentKey(component) {
    if (!component || !this.surface) return null;
    const marker = component.getAttribute("data-movcues-content") ?? component.getAttribute("data-movcues-action-id");
    if (marker) return `${component.tagName}:${marker}`;
    return component.tagName === "IMG" ? `IMG:${Array.from(this.surface.querySelectorAll("img")).indexOf(component)}` : null;
  }
  findByKey(key) {
    if (!key || !this.surface) return null;
    const [tag, marker] = key.split(":");
    if (tag === "IMG") return this.surface.querySelectorAll("img")[Number(marker)] ?? null;
    return Array.from(this.surface.querySelectorAll(SELECTABLE)).find((element) => (element.getAttribute("data-movcues-content") ?? element.getAttribute("data-movcues-action-id")) === marker) ?? null;
  }
  renderOutline() {
    const component = this.selected ?? this.hovered;
    if (!(component == null ? void 0 : component.isConnected)) {
      this.outline.hidden = true;
      return;
    }
    const rect = component.getBoundingClientRect();
    this.outline.hidden = false;
    this.outline.toggleAttribute("data-hover", !this.selected);
    Object.assign(this.outline.style, { left: `${rect.left - 2}px`, top: `${rect.top - 2}px`, width: `${rect.width + 4}px`, height: `${rect.height + 4}px` });
  }
}
class EditorModeController {
  constructor(apiBase) {
    this.apiBase = apiBase;
    this.host = null;
    this.root = null;
    this.picker = new ElementPicker();
    this.preview = new ExperienceRenderer();
    this.contentEditor = null;
    this.componentSelection = null;
    this.routeObserver = new RouteObserver();
    this.routeUnsubscribe = null;
    this.mutationObserver = null;
    this.dragCleanup = null;
    this.expiryTimer = 0;
    this.validationTimer = 0;
    this.saveTimer = 0;
    this.saveInFlight = null;
    this.targetRefreshTimer = 0;
    this.selectionGeneration = 0;
    this.bridge = null;
    this.session = null;
    this.draft = null;
    this.definition = null;
    this.guide = null;
    this.survey = null;
    this.stepIndex = 0;
    this.mode = "design";
    this.dirty = false;
    this.editGeneration = 0;
    this.saveState = "clean";
    this.recoveryDraft = null;
    this.lifecycle = 0;
    this.previewRendered = false;
    this.previewGeneration = 0;
    this.currentPath = "";
    this.persistBeforePageLeave = () => this.updateContinuation();
    this.protectUnsavedChanges = (event) => {
      var _a;
      if (!this.dirty && !this.saveInFlight && !((_a = this.contentEditor) == null ? void 0 : _a.isComposing())) return;
      event.preventDefault();
      event.returnValue = "";
    };
    this.fitPanel = () => {
      var _a, _b;
      const aside = (_a = this.root) == null ? void 0 : _a.querySelector("aside");
      if (!aside) return;
      const viewport = window.visualViewport;
      const width = (viewport == null ? void 0 : viewport.width) ?? innerWidth;
      const height = (viewport == null ? void 0 : viewport.height) ?? innerHeight;
      const x = (viewport == null ? void 0 : viewport.offsetLeft) ?? 0;
      const y = (viewport == null ? void 0 : viewport.offsetTop) ?? 0;
      aside.style.maxWidth = `${Math.max(0, width - 8)}px`;
      aside.style.maxHeight = `${Math.max(48, height - 8)}px`;
      const main = (_b = this.root) == null ? void 0 : _b.querySelector("main");
      if (main) main.style.maxHeight = `${Math.max(0, height - 74)}px`;
      const rect = aside.getBoundingClientRect();
      if (aside.style.left) aside.style.left = `${Math.max(x + 4, Math.min(x + width - rect.width - 4, rect.left))}px`;
      aside.style.top = `${Math.max(y + 4, Math.min(y + height - 48, rect.top || y + 4))}px`;
    };
  }
  async start(rawToken) {
    try {
      const response = await fetch(`${this.apiBase}/public/experience-editor/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ token: rawToken })
      });
      if (!response.ok) return false;
      const session = await response.json();
      if (!validSession(session)) return false;
      const clean = new URL(location.href);
      const requestedStep = Number(clean.searchParams.get("movcues_editor_step") ?? "0");
      clean.searchParams.delete("movcues_editor_token");
      clean.searchParams.delete("movcues_editor_step");
      history.replaceState(history.state, "", clean.toString());
      return await this.activate(session, { requestedStep });
    } catch {
      this.destroy();
      return false;
    }
  }
  async resume(continuation) {
    if (!validSession(continuation.session)) {
      clearEditorContinuation();
      return false;
    }
    try {
      return await this.activate(continuation.session, { restoredState: continuation.editorState });
    } catch {
      this.destroy();
      return false;
    }
  }
  async activate(session, options) {
    var _a, _b, _c;
    this.teardown(false);
    const bridge = new EditorBridge(this.apiBase, session.sessionId, session.accessToken);
    let draft;
    try {
      draft = await bridge.load();
    } catch {
      clearEditorContinuation();
      return false;
    }
    if (draft.experience.kind === "checklist") {
      clearEditorContinuation();
      return false;
    }
    this.bridge = bridge;
    this.session = session;
    this.draft = draft;
    this.definition = draft.version.definition;
    this.guide = isGuideDefinition(this.definition) ? this.definition : null;
    this.survey = !this.guide && draft.experience.widgetType === "survey" ? this.definition.survey ?? null : null;
    const selectableSteps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
    const restored = ((_c = options.restoredState) == null ? void 0 : _c.experienceId) === draft.experience.id ? options.restoredState : void 0;
    const restoredIndex = selectableSteps && (restored == null ? void 0 : restored.selectedStepId) ? selectableSteps.findIndex((step) => step.id === restored.selectedStepId) : -1;
    this.stepIndex = selectableSteps ? restoredIndex >= 0 ? restoredIndex : clampStep(options.requestedStep ?? 0, selectableSteps.length) : 0;
    this.currentPath = currentPagePath();
    const restoredMode = restored == null ? void 0 : restored.mode;
    this.mode = restoredMode === "select" ? "target" : restoredMode === "design" || restoredMode === "target" || restoredMode === "navigate" || restoredMode === "preview" ? restoredMode : draft.experience.builderMode === "onsite" ? "design" : "target";
    this.updateContinuation();
    this.mount();
    this.expiryTimer = window.setTimeout(() => this.expireSession(), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    this.validationTimer = window.setInterval(() => {
      void bridge.load().catch((error) => {
        if (this.bridge === bridge && error instanceof EditorSessionExpiredError) this.expireSession();
      });
    }, 15e3);
    return true;
  }
  mount() {
    var _a, _b;
    if (!this.draft || !this.definition) return;
    this.host = document.createElement("div");
    this.host.dataset.movcuesEditor = "";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLE}</style>${this.panelMarkup(this.draft)}`;
    document.documentElement.appendChild(this.host);
    this.bindPanel();
    this.syncPanel();
    this.applyMode();
    this.routeUnsubscribe = this.routeObserver.onChange(() => this.onRouteChange());
    this.routeObserver.start();
    window.addEventListener("pagehide", this.persistBeforePageLeave);
    window.addEventListener("beforeunload", this.protectUnsavedChanges);
    this.configureDiagnostics();
    (_a = window.visualViewport) == null ? void 0 : _a.addEventListener("resize", this.fitPanel);
    (_b = window.visualViewport) == null ? void 0 : _b.addEventListener("scroll", this.fitPanel);
    window.addEventListener("resize", this.fitPanel);
    this.fitPanel();
  }
  panelMarkup(draft) {
    var _a, _b;
    const selectableSteps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
    const guideMarkup = selectableSteps ? `<section class="section" data-guide><div class="eyebrow">${this.guide ? "Guide" : "Survey"}</div><div class="step-flow">${selectableSteps.map((_, index) => `<button class="step" type="button" data-step="${index}" aria-label="Open step ${index + 1}">${index + 1} <span data-step-icon>○</span></button>`).join('<span class="arrow">→</span>')}</div><div class="muted" data-step-label></div></section>` : "";
    const designDisabled = draft.experience.builderMode !== "onsite" ? ' disabled title="Content is edited in the GrapesJS Dashboard Builder"' : "";
    return `<aside>
      <header data-drag-handle>
        <div class="header-copy"><strong>Movcues Live Editor</strong><span>${escapeText(draft.experience.name)}</span><small><i></i> Connected · <span data-save-state>Draft saved</span></small></div>
        <div class="header-actions"><button type="button" data-return-dashboard aria-label="Return to dashboard">↗</button><button type="button" data-minimize aria-label="Minimize editor">—</button><button type="button" data-close aria-label="Close editor">×</button></div>
      </header>
      <main>
        <div class="modebar"><button type="button" data-mode="design"${designDisabled}>Design</button><button type="button" data-mode="target">Target</button><button type="button" data-mode="navigate">Navigate</button><button type="button" data-mode="preview">Preview</button></div>
        <button type="button" class="secondary-button" data-reset-preview hidden>Reset Preview</button><p class="hint" data-preview-limit hidden>Preview tests this step only. Links and external actions are disabled.</p>
        <div class="notice" data-route-notice hidden><b>Page changed</b><span data-route-change></span></div>
        ${guideMarkup}
        <section class="section content-inspector" data-content-inspector hidden>
          <div class="content-heading"><div><div class="eyebrow">Content</div><strong data-component-label>Nothing selected</strong></div><button type="button" class="secondary-button compact" data-edit-component>Edit</button></div>
          <div class="formatbar" data-text-controls><button type="button" data-format="strong" aria-label="Bold"><b>B</b></button><button type="button" data-format="em" aria-label="Italic"><i>I</i></button><button type="button" data-format="u" aria-label="Underline"><u>U</u></button><button type="button" data-list="ul" aria-label="Bulleted list">• List</button><button type="button" data-list="ol" aria-label="Numbered list">1. List</button></div>
          <div class="format-row" data-text-controls><label>Align<select data-text-align><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
          <div class="link-row" data-text-controls><input data-link-url aria-label="Link URL" type="text" inputmode="url" placeholder="https://… or /path"><button type="button" class="secondary-button compact" data-apply-link>Link</button></div>
          <div class="image-controls" data-image-controls hidden><label>Source URL<input data-image-src type="text" inputmode="url"></label><label>Alt text<input data-image-alt type="text" maxlength="500"></label><button type="button" class="secondary-button" data-apply-image>Apply image</button></div>
          <div class="history-row"><button type="button" class="secondary-button compact" data-undo disabled>Undo</button><button type="button" class="secondary-button compact" data-redo disabled>Redo</button></div>
        </section>
        <section class="section" data-for="target">
          <div class="eyebrow">Target</div><strong class="truncate" data-target-label>Not selected</strong><div class="reliability" data-reliability></div>
          <button class="secondary-button" type="button" data-pick>Reselect target</button>
        </section>
        <section class="section" data-layering-section>
          <div class="eyebrow">Layering</div>
          <label>Policy<select data-layer-mode><option value="auto">Automatic</option><option value="relative">Relative to an element</option><option value="always_on_top">Always on top</option><option value="custom">Advanced / Custom</option></select></label>
          <div class="muted" data-layer-description></div>
          <div data-layer-relative hidden><strong class="truncate" data-layer-target>Not selected</strong><button class="secondary-button" type="button" data-pick-layer>Select element from page</button><label>Relationship<select data-layer-relation><option value="above">Above</option><option value="below">Below</option></select></label></div>
          <label data-layer-custom hidden>Custom z-index<input data-layer-z-index type="number" min="1" max="2147483647"></label>
        </section>
        <section class="section" data-placement-section>
          <div class="eyebrow">Placement</div>
          <div data-for="anchored"><div class="placement-grid">${placementButton("top", "Top")}${placementButton("left", "Left")}${placementButton("auto", "Auto")}${placementButton("right", "Right")}${placementButton("bottom", "Bottom")}</div><label>Alignment<select data-alignment><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></select></label><label>Offset<div class="number"><input data-offset type="number" min="0" max="100"><span>px</span></div></label></div>
          <div data-for="toast"><label>Position<select data-toast-position><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label><label>Auto-dismiss<div class="number"><input data-auto-dismiss type="number" min="500" placeholder="Disabled"><span>ms</span></div></label></div>
          <div data-for="modal"><label>Layout<select data-modal-layout><option value="center">Centered</option><option value="fullscreen">Fullscreen</option></select></label><label class="check"><input data-backdrop type="checkbox"> Backdrop</label><label>Backdrop opacity<input data-backdrop-opacity type="number" min="0" max="0.9" step="0.05"></label><label class="check"><input data-close-backdrop type="checkbox"> Dismiss on backdrop click</label></div>
          <div data-for="slideout"><label>Position<select data-slideout-position><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="center-left">Center left</option><option value="center-right">Center right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label></div>
          <div data-for="banner"><label>Position<select data-banner-position><option value="top">Top</option><option value="bottom">Bottom</option></select></label></div>
          <div data-for="cursor"><label>X offset<div class="number"><input data-cursor-x type="number"><span>px</span></div></label><label>Y offset<div class="number"><input data-cursor-y type="number"><span>px</span></div></label></div>
          <div data-for="hotspot"><label>Beacon style<select data-hotspot-style><option value="pulse">Pulse</option><option value="dot">Dot</option><option value="question">Question mark</option></select></label><label>Beacon color<input data-hotspot-color type="color"></label></div>
        </section>
        <section class="section" data-step-summary hidden><div class="eyebrow">Step</div><dl><dt>Advances on</dt><dd data-advance></dd><dt>Dismissible</dt><dd data-dismissible></dd></dl></section>
        <section class="section"><div class="eyebrow">Configured</div><dl data-configured></dl></section>
        <section class="section live"><div class="eyebrow">Live status</div><div class="status-ok">✓ SDK/editor connected</div><div data-preview-status></div><div data-live-target></div><div class="status-ok">✓ Current page available</div><code data-current-path></code><div data-missing-selector hidden><span>Target selector</span><code></code><button class="secondary-button" type="button" data-pick>Reselect target</button></div></section>
        <p class="hint status-error" role="alert" data-content-error hidden></p>
        <div class="save-recovery" data-save-recovery hidden><button type="button" class="secondary-button" data-retry-save>Retry save</button><button type="button" class="secondary-button" data-reload-draft hidden>Reload latest</button><button type="button" class="secondary-button" data-export-draft>Copy / Export unsaved draft</button><button type="button" class="secondary-button" data-discard-draft>Discard and close</button><span data-recovery-message>Local edits are preserved.</span></div><p class="hint" data-mode-hint></p>
      </main>
    </aside>`;
  }
  bindPanel() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    const root = this.root;
    root.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => this.setMode(button.dataset.mode)));
    root.querySelectorAll("[data-pick]").forEach((button) => button.addEventListener("click", () => {
      if (this.mode !== "target") this.setMode("target");
      else this.startPicker();
    }));
    (_a = root.querySelector("[data-pick-layer]")) == null ? void 0 : _a.addEventListener("click", () => this.startLayerPicker());
    root.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => this.switchStep(Number(button.dataset.step))));
    (_b = root.querySelector("[data-minimize]")) == null ? void 0 : _b.addEventListener("click", () => {
      const aside = root.querySelector("aside");
      aside.classList.toggle("minimized");
      const button = root.querySelector("[data-minimize]");
      button.textContent = aside.classList.contains("minimized") ? "+" : "—";
    });
    (_c = root.querySelector("[data-close]")) == null ? void 0 : _c.addEventListener("click", () => void this.close());
    (_d = root.querySelector("[data-return-dashboard]")) == null ? void 0 : _d.addEventListener("click", () => {
      var _a2;
      (_a2 = window.opener) == null ? void 0 : _a2.focus();
      void this.close();
    });
    (_e = root.querySelector("[data-retry-save]")) == null ? void 0 : _e.addEventListener("click", () => void this.persist());
    (_f = root.querySelector("[data-reload-draft]")) == null ? void 0 : _f.addEventListener("click", () => {
      if (window.confirm("Reloading discards local edits. Copy / Export them first if you need them. Reload latest?")) {
        this.recoveryDraft = null;
        window.location.reload();
      }
    });
    (_g = root.querySelector("[data-export-draft]")) == null ? void 0 : _g.addEventListener("click", () => this.exportRecovery());
    (_h = root.querySelector("[data-discard-draft]")) == null ? void 0 : _h.addEventListener("click", () => {
      if (window.confirm("Discard unsaved edits and close?")) {
        this.recoveryDraft = null;
        this.destroy();
      }
    });
    (_i = root.querySelector("[data-reset-preview]")) == null ? void 0 : _i.addEventListener("click", () => this.renderPreview());
    (_j = root.querySelector("[data-edit-component]")) == null ? void 0 : _j.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.contentEditor) == null ? void 0 : _a2.editSelected();
    });
    root.querySelectorAll("[data-format]").forEach((button) => button.addEventListener("click", () => {
      var _a2;
      (_a2 = this.contentEditor) == null ? void 0 : _a2.formatInline(button.dataset.format);
      this.syncContentInspector();
    }));
    root.querySelectorAll("[data-list]").forEach((button) => button.addEventListener("click", () => {
      var _a2;
      (_a2 = this.contentEditor) == null ? void 0 : _a2.toggleList(button.dataset.list);
      this.syncContentInspector();
    }));
    (_k = root.querySelector("[data-text-align]")) == null ? void 0 : _k.addEventListener("change", (event) => {
      var _a2;
      (_a2 = this.contentEditor) == null ? void 0 : _a2.setAlignment(event.currentTarget.value);
      this.syncContentInspector();
    });
    (_l = root.querySelector("[data-apply-link]")) == null ? void 0 : _l.addEventListener("click", () => {
      var _a2;
      const input = root.querySelector("[data-link-url]");
      if (input && !((_a2 = this.contentEditor) == null ? void 0 : _a2.applyLink(input.value))) {
        input.setCustomValidity("Select text in a heading or body and use an HTTP(S), email, phone, relative, or hash URL.");
        input.reportValidity();
      } else input == null ? void 0 : input.setCustomValidity("");
      this.syncContentInspector();
    });
    (_m = root.querySelector("[data-apply-image]")) == null ? void 0 : _m.addEventListener("click", () => {
      var _a2;
      const source = root.querySelector("[data-image-src]");
      const alt = root.querySelector("[data-image-alt]");
      if (source && alt && !((_a2 = this.contentEditor) == null ? void 0 : _a2.updateImage(source.value, alt.value))) source.setCustomValidity("Use an HTTP(S), relative, or supported data image URL.");
      else source == null ? void 0 : source.setCustomValidity("");
      this.syncContentInspector();
    });
    (_n = root.querySelector("[data-undo]")) == null ? void 0 : _n.addEventListener("click", () => {
      var _a2;
      (_a2 = this.contentEditor) == null ? void 0 : _a2.undo();
      this.syncContentInspector();
    });
    (_o = root.querySelector("[data-redo]")) == null ? void 0 : _o.addEventListener("click", () => {
      var _a2;
      (_a2 = this.contentEditor) == null ? void 0 : _a2.redo();
      this.syncContentInspector();
    });
    root.addEventListener("pointerdown", () => {
      var _a2;
      return (_a2 = this.contentEditor) == null ? void 0 : _a2.rememberSelection();
    }, true);
    root.addEventListener("focusin", () => {
      var _a2;
      return (_a2 = this.contentEditor) == null ? void 0 : _a2.rememberSelection();
    }, true);
    root.addEventListener("keydown", (rawEvent) => {
      var _a2, _b2, _c2;
      const event = rawEvent;
      if (event.key === "Escape") {
        (_a2 = this.contentEditor) == null ? void 0 : _a2.editSelected();
        event.preventDefault();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        event.shiftKey ? (_b2 = this.contentEditor) == null ? void 0 : _b2.redo() : (_c2 = this.contentEditor) == null ? void 0 : _c2.undo();
      }
    });
    this.bindDrag();
    this.onSelect("[data-alignment]", (value) => {
      this.currentBehavior().alignment = value;
    });
    this.onSelect("[data-layer-mode]", (value) => {
      if (value === "relative") {
        this.startLayerPicker();
        return;
      }
      if (value === "auto") this.setLayer({ mode: "auto" });
      else if (value === "always_on_top") this.setLayer({ mode: "always_on_top" });
      else {
        const current = this.currentLayer();
        this.setLayer({ mode: "custom", zIndex: (current == null ? void 0 : current.mode) === "custom" ? current.zIndex : 1e3 });
      }
    });
    this.onSelect("[data-layer-relation]", (value) => {
      const layer = this.currentLayer();
      if ((layer == null ? void 0 : layer.mode) === "relative") this.setLayer({ ...layer, relation: value });
    });
    this.onInput("[data-layer-z-index]", (value) => {
      this.setLayer({ mode: "custom", zIndex: Math.max(1, Math.min(2147483647, Math.trunc(numberValue(value, 1e3)))) });
    });
    this.onInput("[data-offset]", (value) => {
      this.currentBehavior().offset = numberValue(value, 8);
    });
    root.querySelectorAll("[data-placement]").forEach((button) => button.addEventListener("click", () => {
      this.currentBehavior().placement = button.dataset.placement;
      this.changed();
    }));
    this.onSelect("[data-toast-position]", (value) => {
      this.currentBehavior().toastPosition = value;
    });
    this.onInput("[data-auto-dismiss]", (value) => {
      this.currentBehavior().autoDismissMs = value ? numberValue(value, 0) : null;
    });
    this.onSelect("[data-modal-layout]", (value) => {
      this.currentBehavior().modalLayout = value;
    });
    this.onCheck("[data-backdrop]", (value) => {
      this.currentBehavior().backdrop = value;
    });
    this.onInput("[data-backdrop-opacity]", (value) => {
      this.currentBehavior().backdropOpacity = numberValue(value, 0.45);
    });
    this.onCheck("[data-close-backdrop]", (value) => {
      this.currentBehavior().closeOnBackdrop = value;
    });
    this.onSelect("[data-slideout-position]", (value) => {
      this.currentBehavior().slideoutPosition = value;
    });
    this.onSelect("[data-banner-position]", (value) => {
      this.currentBehavior().bannerPosition = value;
    });
    this.onInput("[data-cursor-x]", (value) => {
      var _a2;
      this.currentBehavior().cursorOffset = { x: numberValue(value, 16), y: ((_a2 = this.currentBehavior().cursorOffset) == null ? void 0 : _a2.y) ?? 16 };
    });
    this.onInput("[data-cursor-y]", (value) => {
      var _a2;
      this.currentBehavior().cursorOffset = { x: ((_a2 = this.currentBehavior().cursorOffset) == null ? void 0 : _a2.x) ?? 16, y: numberValue(value, 16) };
    });
    this.onSelect("[data-hotspot-style]", (value) => {
      this.currentBehavior().hotspotStyle = value;
    });
    this.onInput("[data-hotspot-color]", (value) => {
      this.currentBehavior().hotspotColor = value;
    });
  }
  bindDrag() {
    var _a, _b;
    const handle = (_a = this.root) == null ? void 0 : _a.querySelector("[data-drag-handle]");
    const aside = (_b = this.root) == null ? void 0 : _b.querySelector("aside");
    if (!handle || !aside) return;
    handle.addEventListener("pointerdown", (event) => {
      var _a2;
      if (event.target.closest("button")) return;
      const rect = aside.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const move = (next) => {
        aside.style.right = "auto";
        aside.style.left = `${Math.max(4, Math.min(innerWidth - rect.width - 4, rect.left + next.clientX - startX))}px`;
        aside.style.top = `${Math.max(4, Math.min(innerHeight - 48, rect.top + next.clientY - startY))}px`;
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        this.dragCleanup = null;
      };
      (_a2 = this.dragCleanup) == null ? void 0 : _a2.call(this);
      this.dragCleanup = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    });
  }
  onSelect(selector, update) {
    var _a, _b;
    (_b = (_a = this.root) == null ? void 0 : _a.querySelector(selector)) == null ? void 0 : _b.addEventListener("change", (event) => {
      update(event.currentTarget.value);
      this.changed();
    });
  }
  onInput(selector, update) {
    var _a, _b;
    (_b = (_a = this.root) == null ? void 0 : _a.querySelector(selector)) == null ? void 0 : _b.addEventListener("input", (event) => {
      update(event.currentTarget.value);
      this.changed();
    });
  }
  onCheck(selector, update) {
    var _a, _b;
    (_b = (_a = this.root) == null ? void 0 : _a.querySelector(selector)) == null ? void 0 : _b.addEventListener("change", (event) => {
      update(event.currentTarget.checked);
      this.changed();
    });
  }
  switchStep(index) {
    var _a, _b, _c;
    const steps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
    if (!steps || index < 0 || index >= steps.length || index === this.stepIndex) return;
    if (!this.flushContent()) return;
    this.selectionGeneration++;
    this.picker.cancel();
    (_c = this.contentEditor) == null ? void 0 : _c.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    if (this.dirty) void this.persist();
    this.stepIndex = index;
    this.updateContinuation();
    this.syncPanel();
    this.applyMode();
  }
  setMode(mode) {
    var _a, _b;
    if (mode === "design" && ((_a = this.draft) == null ? void 0 : _a.experience.builderMode) !== "onsite") return;
    if (this.mode === mode && (mode !== "target" || this.pickerIsSelecting())) return;
    if (!this.flushContent()) return;
    this.selectionGeneration++;
    this.picker.cancel();
    (_b = this.contentEditor) == null ? void 0 : _b.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    if (this.dirty) void this.persist();
    this.mode = mode;
    this.configureDiagnostics();
    this.updateContinuation();
    this.applyMode();
  }
  applyMode() {
    if (this.mode === "navigate") {
      this.previewGeneration++;
      this.preview.destroy();
      this.previewRendered = false;
      this.syncPanel();
      return;
    }
    this.renderPreview();
    this.syncPanel();
    if (this.mode === "target") this.startPicker();
  }
  startPicker() {
    if (!this.isTargetedType() || this.mode !== "target") return;
    const generation = ++this.selectionGeneration;
    this.setText("[data-mode-hint]", "Select an element · Hold Shift to interact temporarily");
    void this.picker.pick().then((target) => {
      if (generation !== this.selectionGeneration || !this.definition || !target) return;
      this.setTarget(target);
      this.updateContinuation();
      this.changed();
    });
  }
  startLayerPicker() {
    if (this.mode === "navigate" || this.mode === "preview") this.mode = "target";
    const generation = ++this.selectionGeneration;
    this.picker.cancel();
    this.setText("[data-mode-hint]", "Select the page element this experience should appear above or below");
    void this.picker.pick().then((target) => {
      if (generation !== this.selectionGeneration || !this.definition || !target) return;
      const current = this.currentLayer();
      this.setLayer({ mode: "relative", relation: (current == null ? void 0 : current.mode) === "relative" ? current.relation : "above", target: { ...target, targetContext: { pagePath: currentPagePath() } } });
      this.changed();
    });
  }
  pickerIsSelecting() {
    return !!document.querySelector("[data-movcues-picker-overlay]");
  }
  changed(render = true) {
    if (this.saveState === "expired") return;
    this.dirty = true;
    this.editGeneration++;
    this.updateContinuation();
    if (render) this.syncPanel();
    else this.syncContentInspector();
    if (render && this.mode !== "navigate") this.renderPreview();
    if (this.saveState !== "conflict" && this.saveState !== "failed") this.saveState = this.saveInFlight ? "saving" : "dirty";
    this.showSaveState();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.persist(), 350);
  }
  flushContent() {
    var _a;
    if (this.contentEditor && !this.contentEditor.flush()) {
      this.setText("[data-save-state]", "Finish composing text before continuing");
      return false;
    }
    const errors = ((_a = this.contentEditor) == null ? void 0 : _a.getValidation()) ?? [];
    this.showValidation(errors);
    return !errors.length;
  }
  showValidation(errors) {
    var _a;
    const element = (_a = this.root) == null ? void 0 : _a.querySelector("[data-content-error]");
    if (element) {
      element.hidden = !errors.length;
      element.textContent = errors.join(" ");
    }
  }
  showSaveState() {
    var _a, _b, _c;
    const labels = { clean: "Draft saved", dirty: "Unsaved", saving: "Saving…", failed: "Save failed", conflict: "Conflict · reload required", expired: "Session expired · export unsaved edits" };
    this.setText("[data-save-state]", labels[this.saveState]);
    const recovering = ["failed", "conflict", "expired"].includes(this.saveState);
    const recovery = (_a = this.root) == null ? void 0 : _a.querySelector("[data-save-recovery]");
    if (recovery) recovery.hidden = !recovering;
    const retry = (_b = this.root) == null ? void 0 : _b.querySelector("[data-retry-save]");
    if (retry) retry.hidden = this.saveState !== "failed";
    const reload = (_c = this.root) == null ? void 0 : _c.querySelector("[data-reload-draft]");
    if (reload) reload.hidden = !["conflict", "expired"].includes(this.saveState);
    this.setText("[data-recovery-message]", "Local edits remain in memory in this tab. Export before reloading or leaving.");
  }
  captureRecovery() {
    var _a, _b, _c, _d;
    if (!this.definition || !this.dirty && !((_a = this.contentEditor) == null ? void 0 : _a.isComposing())) return;
    const definition = JSON.parse(JSON.stringify(this.definition));
    const snapshot = (_b = this.contentEditor) == null ? void 0 : _b.snapshot();
    if (snapshot) {
      const part = isGuideDefinition(definition) ? definition.steps[this.stepIndex] : definition;
      part.builder = snapshot.builder;
      part.content = snapshot.content;
    }
    this.recoveryDraft = JSON.stringify({ experienceId: (_c = this.draft) == null ? void 0 : _c.experience.id, revision: (_d = this.draft) == null ? void 0 : _d.version.revision, definition }, null, 2);
  }
  exportRecovery() {
    var _a, _b, _c;
    (_a = this.contentEditor) == null ? void 0 : _a.flush();
    if (this.saveState !== "expired" || !this.recoveryDraft) this.captureRecovery();
    if (!this.recoveryDraft) return;
    let output = (_b = this.root) == null ? void 0 : _b.querySelector("[data-recovery-export]");
    if (!output && this.root) {
      output = document.createElement("textarea");
      output.dataset.recoveryExport = "";
      output.setAttribute("aria-label", "Unsaved draft JSON; copy and save before leaving");
      output.readOnly = true;
      (_c = this.root.querySelector("main")) == null ? void 0 : _c.append(output);
    }
    if (output) {
      output.value = this.recoveryDraft;
      output.focus();
      output.select();
    }
  }
  expireSession() {
    var _a, _b, _c, _d, _e, _f;
    if (this.saveState === "expired") return;
    (_a = this.contentEditor) == null ? void 0 : _a.flush();
    this.captureRecovery();
    this.dirty = this.dirty || !!((_b = this.contentEditor) == null ? void 0 : _b.isComposing());
    this.saveState = "expired";
    this.lifecycle++;
    clearTimeout(this.saveTimer);
    clearTimeout(this.expiryTimer);
    clearInterval(this.validationTimer);
    (_c = this.contentEditor) == null ? void 0 : _c.destroy();
    this.contentEditor = null;
    this.previewGeneration++;
    this.preview.destroy();
    this.previewRendered = false;
    this.picker.cancel();
    (_d = this.mutationObserver) == null ? void 0 : _d.disconnect();
    (_e = this.routeUnsubscribe) == null ? void 0 : _e.call(this);
    this.routeObserver.stop();
    this.bridge = null;
    this.session = null;
    clearEditorContinuation();
    (_f = this.root) == null ? void 0 : _f.querySelectorAll("button,input,select").forEach((control) => {
      if (!control.matches("[data-export-draft],[data-discard-draft],[data-reload-draft],[data-minimize],[data-close]")) control.disabled = true;
    });
    this.showSaveState();
  }
  async persist() {
    var _a;
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (!this.flushContent()) return false;
    if (this.saveState === "conflict" || this.saveState === "expired") return false;
    if (this.saveInFlight) {
      const saved2 = await this.saveInFlight;
      return saved2 && this.dirty ? this.persist() : saved2;
    }
    if (!this.dirty || !this.bridge || !this.definition) return true;
    const bridge = this.bridge;
    const generation = this.editGeneration;
    const lifecycle = this.lifecycle;
    const definition = JSON.parse(JSON.stringify(this.definition));
    const revision = ((_a = this.draft) == null ? void 0 : _a.version.revision) ?? 1;
    this.saveState = "saving";
    this.showSaveState();
    const request = bridge.save(definition, revision).then((version) => {
      var _a2, _b;
      if (lifecycle !== this.lifecycle) return false;
      if (this.draft) this.draft.version.revision = version.revision;
      this.dirty = this.editGeneration !== generation;
      this.saveState = this.dirty ? "dirty" : "clean";
      if (!this.dirty) {
        this.recoveryDraft = null;
        (_b = (_a2 = this.root) == null ? void 0 : _a2.querySelector("[data-recovery-export]")) == null ? void 0 : _b.remove();
      }
      this.showSaveState();
      return true;
    }).catch((error) => {
      if (lifecycle !== this.lifecycle) return false;
      this.dirty = true;
      this.captureRecovery();
      if (error instanceof EditorSessionExpiredError) {
        this.expireSession();
        return false;
      }
      this.saveState = error instanceof DraftConflictError ? "conflict" : "failed";
      this.showSaveState();
      this.setText("[data-recovery-message]", `${error instanceof Error ? error.message : "Request failed"}. Local edits remain in this tab; retry or export.`);
      return false;
    });
    this.saveInFlight = request;
    const saved = await request;
    if (this.saveInFlight === request) this.saveInFlight = null;
    if (saved && this.dirty) return this.persist();
    return saved;
  }
  async close() {
    if (!this.flushContent()) return;
    if ((this.dirty || this.saveInFlight) && !await this.persist()) return;
    this.destroy();
  }
  renderPreview() {
    var _a, _b, _c;
    if (!this.definition || !this.draft || this.mode === "navigate" || this.saveState === "expired") return;
    if (!this.flushContent()) return;
    const generation = ++this.previewGeneration;
    this.previewRendered = false;
    (_a = this.contentEditor) == null ? void 0 : _a.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    const definition = this.guide ? { ...this.definition, steps: [this.guide.steps[this.stepIndex]] } : this.definition;
    const rendered = JSON.parse(JSON.stringify(definition));
    if (this.mode !== "preview") {
      if (isGuideDefinition(rendered)) rendered.steps.forEach((step) => {
        step.behavior.dismissible = false;
      });
      else {
        rendered.behavior = { ...rendered.behavior, autoDismissMs: null, dismissible: false, closeOnBackdrop: false };
      }
    }
    const selectedStepId = (_c = (_b = this.survey) == null ? void 0 : _b.steps[this.stepIndex]) == null ? void 0 : _c.id;
    this.preview.render({
      id: this.draft.experience.id,
      versionId: this.draft.version.id,
      kind: this.draft.experience.kind,
      // Freeze cursor-follow cards using the stationary toast shell only while authoring.
      widgetType: this.mode !== "preview" && this.draft.experience.widgetType === "cursor_follow" ? "toast" : this.draft.experience.widgetType,
      priority: 0,
      definition: rendered
    }, {
      onVisible: () => {
        var _a2;
        if (generation !== this.previewGeneration || this.saveState === "expired" || !this.root) return;
        const host = Array.from(document.querySelectorAll("[data-movcues-experience]")).find((element) => {
          var _a3;
          return element.dataset.movcuesExperience === ((_a3 = this.draft) == null ? void 0 : _a3.experience.id);
        });
        (_a2 = host == null ? void 0 : host.shadowRoot) == null ? void 0 : _a2.addEventListener("click", (event) => {
          var _a3, _b2;
          if ((_b2 = (_a3 = event.target) == null ? void 0 : _a3.closest) == null ? void 0 : _b2.call(_a3, "a")) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }, true);
        this.previewRendered = true;
        if (this.mode === "design") this.attachContentEditor();
        this.updateDiagnostics();
      },
      onDismiss: () => {
        this.previewRendered = false;
        this.updateDiagnostics();
      },
      onAction: () => void 0,
      onComplete: () => {
        this.previewRendered = false;
        this.updateDiagnostics();
      },
      onUnavailable: () => {
        this.previewRendered = false;
        this.updateDiagnostics();
      }
    }, selectedStepId);
    this.updateDiagnostics();
  }
  attachContentEditor() {
    var _a, _b;
    if (((_a = this.draft) == null ? void 0 : _a.experience.builderMode) !== "onsite" || this.mode !== "design") return;
    const host = Array.from(document.querySelectorAll("[data-movcues-experience]")).find(
      (element) => element.dataset.movcuesExperience === this.draft.experience.id
    );
    const builder = this.currentBuilder();
    const content = this.currentContent();
    if (!(host == null ? void 0 : host.shadowRoot) || !builder || !content) return;
    (_b = this.contentEditor) == null ? void 0 : _b.destroy();
    this.contentEditor = new OnsiteContentEditor(host.shadowRoot, builder, content, {
      onChange: () => this.changed(false),
      onValidation: (errors) => this.showValidation(errors),
      onSelectionChange: (selection) => {
        this.componentSelection = selection;
        this.syncContentInspector();
      }
    });
    this.contentEditor.start();
  }
  currentBuilder() {
    var _a, _b;
    if (!this.definition) return void 0;
    if (this.guide) return (_a = this.guide.steps[this.stepIndex]) == null ? void 0 : _a.builder;
    if (this.survey) return (_b = this.survey.steps[this.stepIndex]) == null ? void 0 : _b.builder;
    return this.definition.builder;
  }
  currentContent() {
    var _a, _b;
    if (!this.definition) return void 0;
    if (this.guide) return (_a = this.guide.steps[this.stepIndex]) == null ? void 0 : _a.content;
    if (this.survey) return (_b = this.survey.steps[this.stepIndex]) == null ? void 0 : _b.content;
    return this.definition.content;
  }
  syncContentInspector() {
    var _a, _b;
    if (!this.root) return;
    const selection = this.componentSelection;
    const inspector = this.root.querySelector("[data-content-inspector]");
    if (!inspector) return;
    inspector.hidden = this.mode !== "design" || !selection;
    if (!selection) return;
    this.setText("[data-component-label]", `${capitalize(selection.label)}${selection.editing ? " · Editing" : ""}`);
    this.root.querySelectorAll("[data-text-controls]").forEach((element) => {
      element.hidden = selection.kind === "image";
    });
    const imageControls = this.root.querySelector("[data-image-controls]");
    if (imageControls) imageControls.hidden = selection.kind !== "image";
    const edit = this.root.querySelector("[data-edit-component]");
    if (edit) edit.hidden = selection.kind === "image";
    this.root.querySelectorAll("[data-list]").forEach((button) => {
      button.disabled = selection.kind !== "text" || selection.label !== "body";
    });
    const link = this.root.querySelector("[data-apply-link]");
    if (link) link.disabled = selection.kind !== "text";
    if (selection.kind === "image") {
      this.setValue("[data-image-src]", selection.src ?? "");
      this.setValue("[data-image-alt]", selection.alt ?? "");
    }
    const undo = this.root.querySelector("[data-undo]");
    if (undo) undo.disabled = !((_a = this.contentEditor) == null ? void 0 : _a.canUndo());
    const redo = this.root.querySelector("[data-redo]");
    if (redo) redo.disabled = !((_b = this.contentEditor) == null ? void 0 : _b.canRedo());
  }
  syncPanel() {
    var _a, _b;
    if (!this.root || !this.definition || !this.draft) return;
    const reset = this.root.querySelector("[data-reset-preview]");
    if (reset) reset.hidden = this.mode !== "preview";
    const limit = this.root.querySelector("[data-preview-limit]");
    if (limit) limit.hidden = this.mode !== "preview";
    const behavior = this.currentBehavior();
    const widgetType = this.draft.experience.widgetType;
    const guidePattern = this.guide ? getGuideStepPattern(this.guide.steps[this.stepIndex]) : null;
    const activeGroups = new Set(guidePattern === "anchored_card" || !this.guide && widgetType === "anchored_card" ? ["target", "anchored"] : guidePattern === "modal" ? [] : widgetType === "hotspot" ? ["target", "anchored", "hotspot"] : widgetType === "toast" ? ["toast"] : widgetType === "modal" || widgetType === "survey" ? ["modal"] : widgetType === "slideout" ? ["slideout"] : widgetType === "banner" ? ["banner"] : ["cursor"]);
    this.root.querySelectorAll("[data-for]").forEach((group) => {
      group.hidden = !activeGroups.has(group.dataset.for);
    });
    const placementSection = this.root.querySelector("[data-placement-section]");
    if (placementSection) placementSection.hidden = Boolean(this.guide && guidePattern === "modal");
    this.root.querySelector("[data-step-summary]").hidden = !this.guide;
    this.root.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === this.mode));
    this.root.querySelectorAll("[data-placement]").forEach((button) => button.classList.toggle("active", button.dataset.placement === (behavior.placement ?? "auto")));
    const layer = this.currentLayer();
    const layerMode = (layer == null ? void 0 : layer.mode) ?? "always_on_top";
    this.setValue("[data-layer-mode]", layerMode);
    const relative = this.root.querySelector("[data-layer-relative]");
    if (relative) relative.hidden = (layer == null ? void 0 : layer.mode) !== "relative";
    const custom = this.root.querySelector("[data-layer-custom]");
    if (custom) custom.hidden = (layer == null ? void 0 : layer.mode) !== "custom";
    this.setText("[data-layer-description]", layerMode === "auto" ? "Respect the application's UI layers." : layerMode === "relative" ? "Place this experience around a selected page element." : layerMode === "custom" ? "Use an advanced numeric layer." : layer ? "Keep this experience above normal application UI." : "Legacy compatibility: keep this experience above normal application UI.");
    if ((layer == null ? void 0 : layer.mode) === "relative") {
      this.setText("[data-layer-target]", layer.target.label ?? layer.target.primarySelector);
      this.setValue("[data-layer-relation]", layer.relation);
    }
    if ((layer == null ? void 0 : layer.mode) === "custom") this.setValue("[data-layer-z-index]", String(layer.zIndex));
    this.setValue("[data-alignment]", behavior.alignment ?? "center");
    this.setValue("[data-offset]", String(behavior.offset ?? 8));
    this.setValue("[data-toast-position]", behavior.toastPosition ?? "bottom-right");
    this.setValue("[data-auto-dismiss]", behavior.autoDismissMs ? String(behavior.autoDismissMs) : "");
    this.setValue("[data-modal-layout]", behavior.modalLayout ?? "center");
    this.setChecked("[data-backdrop]", behavior.backdrop ?? widgetType === "modal");
    this.setValue("[data-backdrop-opacity]", String(behavior.backdropOpacity ?? 0.45));
    this.setChecked("[data-close-backdrop]", behavior.closeOnBackdrop ?? false);
    this.setValue("[data-slideout-position]", behavior.slideoutPosition ?? "bottom-right");
    this.setValue("[data-banner-position]", behavior.bannerPosition ?? "top");
    this.setValue("[data-cursor-x]", String(((_a = behavior.cursorOffset) == null ? void 0 : _a.x) ?? 16));
    this.setValue("[data-cursor-y]", String(((_b = behavior.cursorOffset) == null ? void 0 : _b.y) ?? 16));
    this.setValue("[data-hotspot-style]", behavior.hotspotStyle ?? "pulse");
    this.setValue("[data-hotspot-color]", behavior.hotspotColor ?? this.definition.design.theme.primary);
    if (this.guide) {
      const step = this.guide.steps[this.stepIndex];
      this.setText("[data-step-label]", `Step ${this.stepIndex + 1} of ${this.guide.steps.length}`);
      this.setText("[data-advance]", formatAdvance(step.advance));
      this.setText("[data-dismissible]", step.behavior.dismissible ?? true ? "Yes" : "No");
    }
    if (this.survey) this.setText("[data-step-label]", `Step ${this.stepIndex + 1} of ${this.survey.steps.length}`);
    this.renderConfigured(this.definition.targeting);
    this.updateDiagnostics();
    this.syncContentInspector();
    this.setText("[data-mode-hint]", this.mode === "design" && this.draft.experience.widgetType === "cursor_follow" ? "Stationary authoring view · Preview tests cursor-follow movement" : this.mode === "design" && this.isTargetedType() && !this.currentTarget() ? "Select a page target in Target mode before editing this anchored card" : this.mode === "design" ? "Click a component to select · Double-click text to edit" : this.mode === "target" ? this.isTargetedType() ? "Select an element · Hold Shift to interact temporarily" : "This experience does not need a page target" : this.mode === "navigate" ? "Customer app interaction is enabled" : "End-user preview · analytics and actions are disabled");
  }
  renderConfigured(targeting) {
    var _a;
    const items = [];
    items.push(["Trigger", targeting.trigger.type === "custom_event" ? `Custom event · ${targeting.trigger.eventName}` : "Page load"]);
    items.push(["Page", formatPageRules(targeting.pageRules)]);
    items.push(["Frequency", formatFrequency(targeting.frequency)]);
    items.push(["Priority", String(targeting.priority)]);
    items.push(["Interrupt", targeting.interruptPolicy === "interrupt" ? "Interrupt" : "Wait"]);
    if (this.guide) items.push(["Advance", formatAdvance(this.guide.steps[this.stepIndex].advance)]);
    const configured = (_a = this.root) == null ? void 0 : _a.querySelector("[data-configured]");
    if (configured) configured.innerHTML = items.map(([label, value]) => `<dt>${escapeText(label)}</dt><dd>${escapeText(value)}</dd>`).join("");
  }
  updateDiagnostics() {
    if (!this.root) return;
    const target = this.currentTarget();
    const targeted = this.isTargetedType();
    const targetStatus = targeted ? this.targetStatus(target) : "unconfigured";
    const found = targetStatus === "found";
    this.setText("[data-current-path]", this.currentPath || currentPagePath());
    this.setText("[data-preview-status]", `${this.previewRendered ? "✓" : "○"} Preview ${this.previewRendered ? "rendered" : this.mode === "navigate" ? "paused for navigation" : "waiting"}`);
    const previewStatus = this.root.querySelector("[data-preview-status]");
    previewStatus == null ? void 0 : previewStatus.classList.toggle("status-ok", this.previewRendered);
    const liveTarget = this.root.querySelector("[data-live-target]");
    if (liveTarget) {
      liveTarget.hidden = !targeted;
      liveTarget.textContent = targetStatus === "found" ? "✓ Found on current page" : targetStatus === "off-page" ? "○ Configured on another page" : targetStatus === "missing" ? "⚠ Expected on current page but not found" : "○ Not configured";
      liveTarget.className = found ? "status-ok" : targetStatus === "missing" ? "status-error" : "muted";
    }
    this.setText("[data-target-label]", (target == null ? void 0 : target.label) || (target == null ? void 0 : target.primarySelector) || "Not selected");
    this.setText("[data-reliability]", target ? `${reliabilityIcon(target.reliability)} ${capitalize(target.reliability)} selector` : "○ No selector configured");
    const reliability = this.root.querySelector("[data-reliability]");
    if (reliability) reliability.dataset.level = (target == null ? void 0 : target.reliability) ?? "none";
    const missing = this.root.querySelector("[data-missing-selector]");
    if (missing) {
      missing.hidden = targetStatus !== "missing";
      const code = missing.querySelector("code");
      if (code) code.textContent = (target == null ? void 0 : target.primarySelector) ?? "";
    }
    if (this.guide) this.root.querySelectorAll("[data-step]").forEach((button, index) => {
      const guideStep = this.guide.steps[index];
      const stepTarget = guideStep.target;
      const state = index === this.stepIndex ? "current" : guideStepRequiresTarget(guideStep) ? this.targetStatus(stepTarget) : "found";
      button.dataset.stepStatus = state;
      const icon = button.querySelector("[data-step-icon]");
      if (icon) icon.textContent = state === "current" ? "●" : state === "found" ? "✓" : state === "missing" ? "⚠" : "○";
      button.classList.toggle("active", index === this.stepIndex);
    });
    else if (this.survey) this.root.querySelectorAll("[data-step]").forEach((button, index) => {
      button.dataset.stepStatus = index === this.stepIndex ? "current" : "found";
      button.classList.toggle("active", index === this.stepIndex);
      const icon = button.querySelector("[data-step-icon]");
      if (icon) icon.textContent = index === this.stepIndex ? "●" : "✓";
    });
  }
  configureDiagnostics() {
    var _a;
    (_a = this.mutationObserver) == null ? void 0 : _a.disconnect();
    this.mutationObserver = null;
    if (this.mode !== "target" || typeof MutationObserver === "undefined") return;
    this.mutationObserver = new MutationObserver(() => this.scheduleTargetRefresh());
    this.mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["id", "class", "data-testid", "hidden"] });
  }
  scheduleTargetRefresh() {
    clearTimeout(this.targetRefreshTimer);
    this.targetRefreshTimer = window.setTimeout(() => this.updateDiagnostics(), 80);
  }
  onRouteChange() {
    var _a;
    const previous = this.currentPath;
    const next = currentPagePath();
    if (next === previous) return;
    this.currentPath = next;
    this.updateContinuation();
    const notice = (_a = this.root) == null ? void 0 : _a.querySelector("[data-route-notice]");
    if (notice) notice.hidden = false;
    this.setText("[data-route-change]", `${previous} → ${next}`);
    this.updateDiagnostics();
    if (this.mode !== "navigate") {
      this.renderPreview();
      if (this.mode === "target") this.startPicker();
    }
  }
  currentTarget() {
    if (!this.definition) return void 0;
    if (this.guide) {
      const step = this.guide.steps[this.stepIndex];
      return step && guideStepRequiresTarget(step) ? step.target : void 0;
    }
    return this.definition.target;
  }
  targetStatus(target) {
    var _a;
    if (!target) return "unconfigured";
    if (((_a = target.targetContext) == null ? void 0 : _a.pagePath) && target.targetContext.pagePath !== (this.currentPath || currentPagePath())) return "off-page";
    return findTarget(target) ? "found" : "missing";
  }
  currentBehavior() {
    if (!this.definition) return { dismissible: true };
    return this.guide ? this.guide.steps[this.stepIndex].behavior : this.definition.behavior;
  }
  currentLayer() {
    var _a, _b;
    if (!this.definition) return void 0;
    if (this.guide) return this.guide.steps[this.stepIndex].behavior.layer ?? ((_a = this.guide.behavior) == null ? void 0 : _a.layer);
    const widget = this.definition;
    return this.survey ? ((_b = this.survey.steps[this.stepIndex].behavior) == null ? void 0 : _b.layer) ?? widget.behavior.layer : widget.behavior.layer;
  }
  setLayer(layer) {
    if (!this.definition) return;
    if (this.guide) this.guide.steps[this.stepIndex].behavior.layer = layer;
    else if (this.survey) {
      const step = this.survey.steps[this.stepIndex];
      step.behavior = { ...step.behavior, layer };
    } else this.definition.behavior.layer = layer;
  }
  setTarget(target) {
    if (!this.definition) return;
    const contextualTarget = { ...target, targetContext: { pagePath: currentPagePath() } };
    if (this.guide) {
      const step = this.guide.steps[this.stepIndex];
      if (!guideStepRequiresTarget(step)) return;
      step.target = contextualTarget;
    } else this.definition.target = contextualTarget;
  }
  updateContinuation() {
    var _a, _b, _c, _d;
    if (!this.session || !this.draft || this.saveState === "expired") return;
    storeEditorContinuation({
      session: this.session,
      editorState: {
        experienceId: this.draft.experience.id,
        selectedStepId: ((_b = (_a = this.guide) == null ? void 0 : _a.steps[this.stepIndex]) == null ? void 0 : _b.id) ?? ((_d = (_c = this.survey) == null ? void 0 : _c.steps[this.stepIndex]) == null ? void 0 : _d.id),
        mode: this.mode
      }
    });
  }
  isTargetedType() {
    var _a;
    const type = (_a = this.draft) == null ? void 0 : _a.experience.widgetType;
    return this.guide ? guideStepRequiresTarget(this.guide.steps[this.stepIndex]) : type === "anchored_card" || type === "hotspot";
  }
  setText(selector, value) {
    var _a;
    const element = (_a = this.root) == null ? void 0 : _a.querySelector(selector);
    if (element) element.textContent = value;
  }
  setValue(selector, value) {
    var _a;
    const element = (_a = this.root) == null ? void 0 : _a.querySelector(selector);
    if (element) element.value = value;
  }
  setChecked(selector, value) {
    var _a;
    const element = (_a = this.root) == null ? void 0 : _a.querySelector(selector);
    if (element) element.checked = value;
  }
  destroy() {
    this.teardown(true);
  }
  teardown(clearContinuation) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    this.lifecycle++;
    clearTimeout(this.expiryTimer);
    clearInterval(this.validationTimer);
    clearTimeout(this.saveTimer);
    clearTimeout(this.targetRefreshTimer);
    this.selectionGeneration++;
    (_a = this.routeUnsubscribe) == null ? void 0 : _a.call(this);
    this.routeUnsubscribe = null;
    this.routeObserver.stop();
    window.removeEventListener("pagehide", this.persistBeforePageLeave);
    window.removeEventListener("beforeunload", this.protectUnsavedChanges);
    window.removeEventListener("resize", this.fitPanel);
    (_b = window.visualViewport) == null ? void 0 : _b.removeEventListener("resize", this.fitPanel);
    (_c = window.visualViewport) == null ? void 0 : _c.removeEventListener("scroll", this.fitPanel);
    (_d = this.mutationObserver) == null ? void 0 : _d.disconnect();
    this.mutationObserver = null;
    (_e = this.dragCleanup) == null ? void 0 : _e.call(this);
    this.dragCleanup = null;
    (_f = this.contentEditor) == null ? void 0 : _f.flush();
    this.previewGeneration++;
    this.preview.destroy();
    (_g = this.contentEditor) == null ? void 0 : _g.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    this.picker.cancel();
    (_h = this.host) == null ? void 0 : _h.remove();
    this.host = null;
    this.root = null;
    this.bridge = null;
    this.session = null;
    this.draft = null;
    this.definition = null;
    this.guide = null;
    this.survey = null;
    this.saveState = "clean";
    this.editGeneration = 0;
    this.recoveryDraft = null;
    this.dirty = false;
    this.previewRendered = false;
    this.saveInFlight = null;
    if (clearContinuation) clearEditorContinuation();
  }
}
function placementButton(value, label) {
  return `<button type="button" data-placement="${value}">${label}</button>`;
}
function clampStep(value, length) {
  return Number.isFinite(value) && length ? Math.max(0, Math.min(Math.trunc(value), length - 1)) : 0;
}
function validSession(value) {
  return !!value && typeof value.sessionId === "string" && !!value.sessionId && typeof value.accessToken === "string" && !!value.accessToken && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) > Date.now();
}
function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function currentPagePath() {
  return `${location.pathname}${location.search}${location.hash}`;
}
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function reliabilityIcon(value) {
  return value === "reliable" ? "✓" : value === "moderate" ? "●" : "⚠";
}
function formatFrequency(value) {
  const mode = value.mode === "once" ? "Once ever" : value.mode === "once_per_session" ? "Once per session" : "Every qualifying time";
  const limits = [value.maxImpressions ? `max ${value.maxImpressions}` : "", value.cooldownHours ? `${value.cooldownHours}h cooldown` : ""].filter(Boolean);
  return limits.length ? `${mode} · ${limits.join(" · ")}` : mode;
}
function formatPageRules(rules) {
  if (!rules.length) return "All pages";
  return rules.map((rule) => `${rule.kind === "exclude" ? "Exclude" : "Include"} ${rule.value}`).join(" · ");
}
function formatAdvance(advance) {
  if (!advance || advance.type === "button") return "Button click";
  if (advance.type === "element_click") return "Target element click";
  if (advance.type === "element_hover") return `Target element hover${advance.durationMs ? ` · ${advance.durationMs}ms` : ""}`;
  if (advance.type === "custom_event") return `Custom event · ${advance.eventName}`;
  return `Route · ${formatPageRules(advance.pageRules)}`;
}
function escapeText(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}
const STYLE = `
:host{all:initial}*{box-sizing:border-box}aside{position:fixed;right:12px;top:12px;width:min(312px,calc(100vw - 8px));max-height:calc(100dvh - 24px);z-index:2147483647;overflow:hidden;background:#fff;color:#111827;border:1px solid #d7dce3;border-radius:12px;box-shadow:0 18px 50px rgba(15,23,42,.24);font:13px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif}header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 12px 10px;border-bottom:1px solid #e5e7eb;cursor:move;user-select:none}.header-copy{display:grid;min-width:0}.header-copy strong{font-size:13px}.header-copy>span{overflow:hidden;color:#4b5563;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.header-copy small{margin-top:3px;color:#6b7280;font-size:11px}.header-copy i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a}.header-actions{display:flex;gap:2px}.header-actions button{width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:#64748b;font:16px/1 inherit;cursor:pointer}.header-actions button:hover{background:#f1f5f9;color:#0f172a}main{max-height:calc(100dvh - 82px);overflow:auto}.minimized{width:min(260px,calc(100vw - 8px))}.minimized main{display:none}.modebar{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px;border-bottom:1px solid #e5e7eb}.modebar button,.secondary-button,.placement-grid button,.formatbar button{border:1px solid #d7dce3;border-radius:7px;background:#fff;color:#334155;font:600 12px inherit;cursor:pointer}.modebar button{min-width:0;padding:7px 3px}.modebar button:disabled{cursor:not-allowed;opacity:.42}.modebar button.active,.placement-grid button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.notice{display:grid;gap:2px;margin:8px 10px 0;padding:8px;border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;color:#1e40af;font-size:11px}.section{display:grid;gap:8px;padding:10px 12px;border-bottom:1px solid #eef0f3}.eyebrow{color:#64748b;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.muted,.hint{color:#64748b;font-size:11px}.hint{margin:0;padding:9px 12px}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.step-flow{display:flex;align-items:center;overflow:auto}.step{flex:none;padding:4px 6px;border:0;border-radius:6px;background:transparent;color:#64748b;font:600 11px inherit;cursor:pointer}.step.active{background:#eff6ff;color:#1d4ed8}.step[data-step-status=found]{color:#15803d}.step[data-step-status=missing]{color:#b45309}.step.active{color:#1d4ed8}.arrow{color:#cbd5e1;font-size:10px}.reliability{color:#64748b;font-size:11px}.reliability[data-level=reliable]{color:#15803d}.reliability[data-level=fragile]{color:#b45309}.secondary-button{padding:7px 9px}.secondary-button.compact{padding:5px 7px}.content-heading,.history-row,.link-row,.save-recovery{display:flex;align-items:center;justify-content:space-between;gap:6px}.content-heading>div{min-width:0}.formatbar{display:flex;flex-wrap:wrap;gap:4px}.formatbar button{padding:5px 7px}.link-row input{min-width:0}.history-row{justify-content:flex-start}.save-recovery{flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid #fee2e2;background:#fff7ed;color:#9a3412;font-size:11px}.placement-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.placement-grid button{padding:6px}.placement-grid button[data-placement=top]{grid-column:2}.placement-grid button[data-placement=left]{grid-column:1}.placement-grid button[data-placement=auto]{grid-column:2}.placement-grid button[data-placement=right]{grid-column:3}.placement-grid button[data-placement=bottom]{grid-column:2}label{display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:8px;color:#475569;font-size:11px}label.check{display:flex}label.check input{width:auto}input,select{min-width:0;width:100%;padding:6px 7px;border:1px solid #d7dce3;border-radius:6px;background:#fff;color:#111827;font:12px inherit}.number{display:grid;grid-template-columns:1fr auto;align-items:center;gap:5px}.number span{color:#64748b;font-size:11px}dl{display:grid;grid-template-columns:82px minmax(0,1fr);gap:5px 8px;margin:0;font-size:11px}dt{color:#64748b}dd{min-width:0;margin:0;overflow-wrap:anywhere;color:#1f2937}.live{font-size:11px}.status-ok{color:#15803d}.status-error{color:#b91c1c}.live code{display:block;overflow:hidden;padding:4px 6px;border-radius:5px;background:#f8fafc;color:#475569;font:11px/1.35 ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap}[data-missing-selector]{display:grid;gap:5px;padding-top:4px;color:#b91c1c}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #2563eb;outline-offset:2px}textarea[data-recovery-export]{box-sizing:border-box;width:100%;height:180px;font:11px monospace}[hidden]{display:none!important}@media(max-width:420px){aside{right:4px;top:4px;max-height:calc(100dvh - 8px)}main{max-height:calc(100dvh - 66px)}header{padding:9px}.section{padding:8px 10px}.modebar{padding:6px}.modebar button{font-size:10px}}
`;
export {
  EditorModeController
};
//# sourceMappingURL=EditorModeController-DuGqF4Uh.js.map
