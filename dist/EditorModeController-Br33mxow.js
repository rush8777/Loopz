import { c as computeElementRole, a as computeElementLabel, b as builderLinkUrlIsSafe, d as builderImageUrlIsSafe, s as sanitizeBuilderHtml, E as ExperienceRenderer, R as RouteObserver, e as clearEditorContinuation, i as isGuideDefinition, g as getGuideStepPattern, f as guideStepRequiresTarget, h as findTarget, j as storeEditorContinuation } from "./module-DcLifY27.js";
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
const ONSITE_LIMITS = {
  maxDepth: 8,
  maxNodes: 120,
  maxRichText: 1e4,
  maxImageUrl: 2e3,
  maxSerializedBytes: 25e4,
  minFixedSize: 24,
  maxFixedSize: 1200
};
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const COLOR_PATTERN = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9.,%\s-]+\)|[a-z]{1,20})$/i;
const SAFE_INLINE_TAGS = /* @__PURE__ */ new Set(["BR", "STRONG", "EM", "U", "A", "UL", "OL", "LI"]);
const ICONS = { check: "✓", star: "★", info: "ℹ", warning: "⚠", sparkles: "✦", arrow: "→", heart: "♥", rocket: "🚀" };
let idSequence = 0;
function onsiteId(prefix = "cell") {
  idSequence = (idSequence + 1) % 65535;
  const random = typeof crypto !== "undefined" && "getRandomValues" in crypto ? Array.from(crypto.getRandomValues(new Uint32Array(2))).map((value) => value.toString(36)).join("") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}${idSequence.toString(36)}`.slice(0, 64);
}
function emptyCell(block) {
  return { type: "cell", id: onsiteId("cell"), direction: "column", sizing: { mode: "flexible", weight: 1 }, align: "stretch", justify: "start", gap: 12, padding: { top: 0, right: 0, bottom: 0, left: 0 }, ...block ? { block } : {} };
}
function createBlock(type, guide = false) {
  const id = onsiteId("block");
  if (type === "heading") return { id, type, html: "A clear heading", level: 2, fontSize: 24, weight: 600, lineHeight: 1.25 };
  if (type === "text") return { id, type, html: "Add supporting text for your visitors.", fontSize: 15, weight: 400, lineHeight: 1.5 };
  if (type === "button") return { id, type, label: guide ? "Next" : "Got it", action: { id: onsiteId("action"), type: guide ? "next_step" : "dismiss" }, variant: "primary", radius: 8, paddingX: 16, paddingY: 9, width: "hug", align: "right" };
  if (type === "image") return { id, type, src: "", alt: "", fit: "cover", width: 100, radius: 8, align: "center" };
  if (type === "divider") return { id, type, orientation: "horizontal", thickness: 1, color: "#dbe2ea" };
  if (type === "spacer") return { id, type, size: 24 };
  return { id, type: "icon", icon: "sparkles", size: 28, color: "#2563eb", align: "center" };
}
function createOnsiteDocument(guide = false) {
  const heading = emptyCell(createBlock("heading", guide));
  const text = emptyCell(createBlock("text", guide));
  const button = emptyCell(createBlock("button", guide));
  return { schemaVersion: 2, id: onsiteId("document"), root: { ...emptyCell(), direction: "column", gap: 12, padding: { top: 20, right: 20, bottom: 20, left: 20 }, children: [heading, text, button] } };
}
function onsiteDocumentFromBuilder(builder) {
  var _a;
  const movcues = (_a = builder == null ? void 0 : builder.projectData) == null ? void 0 : _a.movcues;
  if (!movcues || typeof movcues !== "object") return null;
  const document2 = movcues.onsiteDocument;
  return isOnsiteDocument(document2) ? document2 : null;
}
function applyOnsiteDocument(builder, document2, widgetType) {
  const compiled = compileOnsiteDocument(document2, widgetType);
  builder.version = 1;
  builder.projectData = { ...builder.projectData, movcues: { ...asRecord(builder.projectData.movcues), authoringSurface: "onsite", schemaVersion: 2, onsiteDocument: document2, actionBindings: compiled.actionBindings } };
  builder.html = compiled.html;
  builder.css = compiled.css;
  return compiled;
}
function compileOnsiteDocument(document2, widgetType) {
  var _a;
  const validation = validateOnsiteDocument(document2);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const css = [
    ".movcues-widget{box-sizing:border-box;width:100%;max-width:100%;min-width:0;overflow-wrap:anywhere;background:var(--movcues-bg);color:var(--movcues-fg)}",
    ".movcues-widget *{box-sizing:border-box}",
    ".movcues-widget .movcues-cell{display:flex;min-width:0;max-width:100%}",
    ".movcues-widget .movcues-block{min-width:0;max-width:100%;margin:0}",
    ".movcues-widget .movcues-block img{display:block;max-width:100%}",
    ".movcues-widget .movcues-button{border:0;font:600 14px/1.2 ui-sans-serif,system-ui,sans-serif;cursor:pointer}",
    ".movcues-widget .movcues-button--primary{background:var(--movcues-primary);color:#fff}",
    ".movcues-widget .movcues-button--secondary{background:transparent;color:inherit}",
    ".movcues-widget .movcues-button--outline{background:transparent;color:inherit;border:1px solid currentColor}",
    ".movcues-widget .movcues-block--full{width:100%}"
  ];
  const html = renderCell(document2.root, css);
  css.push('@media(max-width:480px){.movcues-widget [data-movcues-responsive-stack="true"]{flex-direction:column!important}.movcues-widget [data-movcues-sizing="fixed"]{max-width:100%!important}.movcues-widget .movcues-button{min-height:40px}.movcues-widget img{height:auto!important}}');
  const blocks = listBlocks(document2.root);
  const firstHeading = blocks.find((block) => block.type === "heading");
  const text = blocks.filter((block) => block.type === "text").map((block) => richTextToPlain(block.html)).join("\n").slice(0, 2e3);
  const actions = blocks.filter((block) => block.type === "button");
  const actionBindings = Object.fromEntries(actions.map((block) => [block.action.id, block.action]));
  const legacy = actions.slice(0, 2).map((block) => ({ label: block.label, type: block.action.type === "previous_step" ? "dismiss" : block.action.type, ..."url" in block.action ? { url: block.action.url } : {}, ..."eventName" in block.action ? { eventName: block.action.eventName } : {} }));
  const content = {
    heading: firstHeading ? richTextToPlain(firstHeading.html).slice(0, 160) : "",
    body: text,
    ...legacy[0] ? { primaryAction: legacy[0] } : {},
    ...((_a = legacy[1]) == null ? void 0 : _a.type) === "dismiss" ? { secondaryAction: { label: legacy[1].label, type: "dismiss" } } : {}
  };
  return { html: `<section class="movcues-widget movcues-widget--${escapeAttribute(widgetType)}" data-movcues-widget-type="${escapeAttribute(widgetType)}" data-movcues-document-version="2">${html}</section>`, css: css.join(""), content, actionBindings };
}
function renderCell(cell, css, depth) {
  var _a;
  const selector = `.movcues-widget [data-movcues-node-id="${cell.id}"]`;
  const sizing = cell.sizing.mode === "flexible" ? `flex:${round(cell.sizing.weight)} 1 0` : cell.sizing.mode === "hug" ? "flex:0 0 auto" : `flex:0 1 ${cell.sizing.value}px`;
  const style = cell.style ?? {};
  css.push(`${selector}{${sizing};flex-direction:${cell.direction};align-items:${cell.align};justify-content:${cell.justify};gap:${cell.gap}px;padding:${cell.padding.top}px ${cell.padding.right}px ${cell.padding.bottom}px ${cell.padding.left}px;${style.background ? `background:${style.background};` : ""}${style.borderWidth ? `border:${style.borderWidth}px solid ${style.borderColor ?? "#dbe2ea"};` : ""}${style.borderRadius ? `border-radius:${style.borderRadius}px;` : ""}}`);
  const children = ((_a = cell.children) == null ? void 0 : _a.map((child) => renderCell(child, css)).join("")) ?? (cell.block ? renderBlock(cell.block, css) : "");
  return `<div class="movcues-cell" data-movcues-node-id="${cell.id}" data-movcues-sizing="${cell.sizing.mode}"${cell.responsiveStack ? ' data-movcues-responsive-stack="true"' : ""}>${children}</div>`;
}
function renderBlock(block, css) {
  const selector = `.movcues-widget [data-movcues-block-id="${block.id}"]`;
  const align = block.align ?? "left";
  if (block.type === "heading") {
    css.push(`${selector}{font:${block.weight} ${block.fontSize}px/${block.lineHeight ?? 1.25} ui-sans-serif,system-ui,sans-serif;text-align:${align};${block.color ? `color:${block.color};` : ""}}`);
    return `<h${block.level} class="movcues-block movcues-heading" data-movcues-block-id="${block.id}" data-movcues-content="heading">${sanitizeRichText(block.html)}</h${block.level}>`;
  }
  if (block.type === "text") {
    css.push(`${selector}{font:${block.weight} ${block.fontSize}px/${block.lineHeight ?? 1.5} ui-sans-serif,system-ui,sans-serif;text-align:${align};white-space:pre-wrap;${block.color ? `color:${block.color};` : ""}}`);
    return `<div class="movcues-block movcues-text" data-movcues-block-id="${block.id}" data-movcues-content="body">${sanitizeRichText(block.html)}</div>`;
  }
  if (block.type === "button") {
    css.push(`${selector}{align-self:${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"};padding:${block.paddingY}px ${block.paddingX}px;border-radius:${block.radius}px;${block.width === "full" ? "width:100%;" : ""}${block.background ? `background:${block.background};` : ""}${block.color ? `color:${block.color};` : ""}}`);
    return `<button type="button" class="movcues-block movcues-button movcues-button--${block.variant}${block.width === "full" ? " movcues-block--full" : ""}" data-movcues-block-id="${block.id}" data-movcues-action-id="${block.action.id}">${escapeText$1(block.label)}</button>`;
  }
  if (block.type === "image") {
    css.push(`${selector}{align-self:${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"};width:${block.width}%;${block.height ? `height:${block.height}px;` : "height:auto;"}object-fit:${block.fit};border-radius:${block.radius}px}`);
    return `<img class="movcues-block movcues-image" data-movcues-block-id="${block.id}" src="${escapeAttribute(block.src)}" alt="${escapeAttribute(block.alt)}">`;
  }
  if (block.type === "divider") {
    css.push(`${selector}{align-self:stretch;${block.orientation === "horizontal" ? `width:100%;height:${block.thickness}px` : `width:${block.thickness}px;min-height:24px`};border:0;background:${block.color}}`);
    return `<hr class="movcues-block movcues-divider" data-movcues-block-id="${block.id}">`;
  }
  if (block.type === "spacer") {
    css.push(`${selector}{flex:0 0 ${block.size}px;width:${block.size}px;height:${block.size}px}`);
    return `<div class="movcues-block movcues-spacer" data-movcues-block-id="${block.id}" aria-hidden="true"></div>`;
  }
  css.push(`${selector}{align-self:${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"};font-size:${block.size}px;line-height:1;${block.color ? `color:${block.color};` : ""}}`);
  return `<span class="movcues-block movcues-icon" data-movcues-block-id="${block.id}" role="img" aria-label="${block.icon}">${ICONS[block.icon]}</span>`;
}
function validateOnsiteDocument(value) {
  const errors = [];
  if (!isOnsiteDocumentShape(value)) return { valid: false, errors: ["On-site document must use schemaVersion 2 and contain one root cell."] };
  unexpectedKeys(value, ["schemaVersion", "id", "root"], "Document", errors);
  const ids = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  let count = 0;
  const addId = (id, path) => {
    if (typeof id !== "string" || !ID_PATTERN.test(id)) errors.push(`${path} has an invalid ID.`);
    else if (ids.has(id)) errors.push(`${path} reuses ID ${id}.`);
    else ids.add(id);
  };
  const number = (input, min, max, path) => {
    if (typeof input !== "number" || !Number.isFinite(input) || input < min || input > max) errors.push(`${path} must be between ${min} and ${max}.`);
  };
  addId(value.id, "Document");
  const visit = (cell, depth, path) => {
    var _a, _b, _c, _d;
    if (!cell || typeof cell !== "object") {
      errors.push(`${path} must be a cell object.`);
      return;
    }
    if (seen.has(cell)) {
      errors.push(`${path} creates a cycle or duplicate reference.`);
      return;
    }
    seen.add(cell);
    count++;
    addId(cell.id, path);
    unexpectedKeys(cell, ["type", "id", "direction", "sizing", "align", "justify", "gap", "padding", "responsiveStack", "style", "children", "block"], path, errors);
    if (depth > ONSITE_LIMITS.maxDepth) errors.push(`${path} exceeds maximum nesting depth ${ONSITE_LIMITS.maxDepth}.`);
    if (!["row", "column"].includes(cell.direction)) errors.push(`${path} has an invalid direction.`);
    if (!["start", "center", "end", "stretch"].includes(cell.align)) errors.push(`${path} has an invalid alignment.`);
    if (!["start", "center", "end", "space-between"].includes(cell.justify)) errors.push(`${path} has an invalid distribution.`);
    if (cell.responsiveStack !== void 0 && typeof cell.responsiveStack !== "boolean") errors.push(`${path} responsiveStack must be a boolean.`);
    number(cell.gap, 0, 96, `${path} gap`);
    for (const side of ["top", "right", "bottom", "left"]) number((_a = cell.padding) == null ? void 0 : _a[side], 0, 128, `${path} padding ${side}`);
    if (((_b = cell.sizing) == null ? void 0 : _b.mode) === "flexible") number(cell.sizing.weight, 0.1, 20, `${path} flexible weight`);
    else if (((_c = cell.sizing) == null ? void 0 : _c.mode) === "fixed") number(cell.sizing.value, ONSITE_LIMITS.minFixedSize, ONSITE_LIMITS.maxFixedSize, `${path} fixed size`);
    else if (((_d = cell.sizing) == null ? void 0 : _d.mode) !== "hug") errors.push(`${path} has an invalid sizing mode.`);
    if (cell.sizing && typeof cell.sizing === "object") unexpectedKeys(cell.sizing, cell.sizing.mode === "flexible" ? ["mode", "weight"] : cell.sizing.mode === "fixed" ? ["mode", "value"] : ["mode"], `${path} sizing`, errors);
    if (cell.style) {
      unexpectedKeys(cell.style, ["background", "borderColor", "borderWidth", "borderRadius"], `${path} style`, errors);
      if (cell.style.background && !COLOR_PATTERN.test(cell.style.background)) errors.push(`${path} background is not supported.`);
      if (cell.style.borderColor && !COLOR_PATTERN.test(cell.style.borderColor)) errors.push(`${path} border color is not supported.`);
      if (cell.style.borderWidth !== void 0) number(cell.style.borderWidth, 0, 16, `${path} border width`);
      if (cell.style.borderRadius !== void 0) number(cell.style.borderRadius, 0, 100, `${path} border radius`);
    }
    if (cell.children && cell.block) errors.push(`${path} cannot contain both children and a block.`);
    if (cell.children) {
      if (!cell.children.length) errors.push(`${path} cannot contain an empty children list.`);
      cell.children.forEach((child, index) => visit(child, depth + 1, `${path} > cell ${index + 1}`));
    }
    if (cell.block) validateBlock(cell.block, `${path} block`, addId, number, errors);
  };
  try {
    visit(value.root, 1, "Root cell");
  } catch {
    errors.push("Document contains malformed cell or block values.");
  }
  if (count > ONSITE_LIMITS.maxNodes) errors.push(`Document has ${count} cells; maximum is ${ONSITE_LIMITS.maxNodes}.`);
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > ONSITE_LIMITS.maxSerializedBytes) errors.push(`Document exceeds ${ONSITE_LIMITS.maxSerializedBytes} serialized bytes.`);
  } catch {
    errors.push("Document cannot be serialized.");
  }
  return { valid: errors.length === 0, errors };
}
function validateBlock(block, path, addId, number, errors) {
  var _a, _b, _c, _d, _e;
  addId(block.id, path);
  const base = ["id", "type", "align"];
  const keys = { heading: [...base, "html", "level", "fontSize", "weight", "color", "lineHeight"], text: [...base, "html", "fontSize", "weight", "color", "lineHeight"], button: [...base, "label", "action", "variant", "background", "color", "radius", "paddingX", "paddingY", "width"], image: [...base, "src", "alt", "fit", "width", "height", "radius"], divider: [...base, "orientation", "thickness", "color"], spacer: [...base, "size"], icon: [...base, "icon", "size", "color"] };
  if (!Object.prototype.hasOwnProperty.call(keys, block.type)) {
    errors.push(`${path} has an unsupported block type.`);
    return;
  }
  unexpectedKeys(block, keys[block.type], path, errors);
  if (block.align !== void 0 && !["left", "center", "right"].includes(block.align)) errors.push(`${path} has an invalid alignment.`);
  if (block.type === "heading" || block.type === "text") {
    if (typeof block.html !== "string" || block.html.length > ONSITE_LIMITS.maxRichText || sanitizeRichText(block.html) !== block.html) errors.push(`${path} contains unsupported or unsafe rich text.`);
    number(block.fontSize, 10, 72, `${path} font size`);
    number(block.lineHeight ?? 1.4, 0.9, 3, `${path} line height`);
    if (![400, 500, 600, 700].includes(block.weight)) errors.push(`${path} has an invalid font weight.`);
    if (block.type === "heading" && ![1, 2, 3, 4].includes(block.level)) errors.push(`${path} has an invalid heading level.`);
  } else if (block.type === "button") {
    if (!((_a = block.label) == null ? void 0 : _a.trim()) || block.label.length > 80) errors.push(`${path} label must contain 1–80 characters.`);
    addId((_b = block.action) == null ? void 0 : _b.id, `${path} action`);
    if (!block.action || !["next_step", "previous_step", "dismiss", "open_url", "track_event"].includes(block.action.type)) errors.push(`${path} has an invalid action.`);
    else unexpectedKeys(block.action, block.action.type === "open_url" ? ["id", "type", "url"] : block.action.type === "track_event" ? ["id", "type", "eventName"] : ["id", "type"], `${path} action`, errors);
    if (((_c = block.action) == null ? void 0 : _c.type) === "open_url" && (!builderLinkUrlIsSafe(block.action.url) || !/^https?:\/\//i.test(block.action.url))) errors.push(`${path} URL must use HTTP(S).`);
    if (((_d = block.action) == null ? void 0 : _d.type) === "track_event" && (!((_e = block.action.eventName) == null ? void 0 : _e.trim()) || block.action.eventName.length > 200)) errors.push(`${path} custom event must contain 1–200 characters.`);
    if (!["primary", "secondary", "outline"].includes(block.variant)) errors.push(`${path} has an invalid variant.`);
    if (!["hug", "full"].includes(block.width)) errors.push(`${path} has an invalid width behavior.`);
    number(block.radius, 0, 48, `${path} radius`);
    number(block.paddingX, 4, 48, `${path} horizontal padding`);
    number(block.paddingY, 4, 32, `${path} vertical padding`);
  } else if (block.type === "image") {
    if (block.src.length > ONSITE_LIMITS.maxImageUrl || !builderImageUrlIsSafe(block.src)) errors.push(`${path} image URL is not allowed.`);
    if (block.alt.length > 500) errors.push(`${path} alt text exceeds 500 characters.`);
    if (!["contain", "cover"].includes(block.fit)) errors.push(`${path} has an invalid image fit.`);
    number(block.width, 1, 100, `${path} width`);
    if (block.height !== void 0) number(block.height, 24, 1200, `${path} height`);
    number(block.radius, 0, 100, `${path} radius`);
  } else if (block.type === "divider") {
    if (!["horizontal", "vertical"].includes(block.orientation)) errors.push(`${path} has an invalid divider orientation.`);
    number(block.thickness, 1, 16, `${path} thickness`);
  } else if (block.type === "spacer") number(block.size, 4, 240, `${path} size`);
  else if (block.type === "icon") {
    if (!(block.icon in ICONS)) errors.push(`${path} icon is not supported.`);
    number(block.size, 12, 96, `${path} size`);
  }
  if ("color" in block && block.color && !COLOR_PATTERN.test(block.color)) errors.push(`${path} color is not supported.`);
}
function unexpectedKeys(value, allowed, path, errors) {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length) errors.push(`${path} contains unsupported fields: ${extra.join(", ")}.`);
}
function findCell(document2, id) {
  let found = null;
  walkCells(document2.root, (cell) => {
    if (cell.id === id) found = cell;
  });
  return found;
}
function findBlock(document2, id) {
  let found = null;
  walkCells(document2.root, (cell) => {
    var _a;
    if (((_a = cell.block) == null ? void 0 : _a.id) === id) found = cell.block;
  });
  return found;
}
function parentCell(document2, id) {
  let found = null;
  walkCells(document2.root, (cell) => {
    var _a;
    if ((_a = cell.children) == null ? void 0 : _a.some((child) => child.id === id)) found = cell;
  });
  return found;
}
function listBlocks(cell) {
  const blocks = [];
  walkCells(cell, (item) => {
    if (item.block) blocks.push(item.block);
  });
  return blocks;
}
function walkCells(cell, visit) {
  var _a;
  visit(cell);
  (_a = cell.children) == null ? void 0 : _a.forEach((child) => walkCells(child, visit));
}
function splitCell(document2, cellId, direction) {
  const cell = findCell(document2, cellId);
  if (!cell || cell.children) return null;
  const preserved = emptyCell(cell.block);
  const added = emptyCell();
  delete cell.block;
  cell.children = [preserved, added];
  cell.direction = direction;
  cell.responsiveStack = direction === "row";
  return added.id;
}
function insertEdgeCell(document2, edge) {
  const wanted = edge === "left" || edge === "right" ? "row" : "column";
  const added = emptyCell();
  if (document2.root.children && document2.root.direction === wanted && !document2.root.block) document2.root.children[edge === "top" || edge === "left" ? "unshift" : "push"](added);
  else {
    const old = structuredCloneSafe(document2.root);
    old.id = onsiteId("cell");
    document2.root = { ...emptyCell(), id: document2.root.id, direction: wanted, responsiveStack: wanted === "row", children: edge === "top" || edge === "left" ? [added, old] : [old, added] };
  }
  return added.id;
}
function insertAdjacentCell(document2, cellId, edge) {
  const cell = findCell(document2, cellId);
  if (!cell) return null;
  if (cell === document2.root) return insertEdgeCell(document2, edge);
  const parent = parentCell(document2, cellId);
  if (!(parent == null ? void 0 : parent.children)) return null;
  const direction = edge === "left" || edge === "right" ? "row" : "column";
  const before = edge === "top" || edge === "left";
  const index = parent.children.indexOf(cell);
  const added = emptyCell();
  if (parent.direction === direction) parent.children.splice(index + (before ? 0 : 1), 0, added);
  else {
    const group = { ...emptyCell(), direction, sizing: cloneOnsite(cell.sizing), gap: parent.gap, responsiveStack: direction === "row", children: before ? [added, cell] : [cell, added] };
    cell.sizing = { mode: "flexible", weight: 1 };
    parent.children.splice(index, 1, group);
  }
  return added.id;
}
function removeCell(document2, id) {
  const parent = parentCell(document2, id);
  if (!(parent == null ? void 0 : parent.children) || parent.children.length <= 1) {
    const cell = findCell(document2, id);
    if (!cell || cell === document2.root) return false;
    delete cell.block;
    return true;
  }
  parent.children = parent.children.filter((child) => child.id !== id);
  if (parent.children.length === 1) collapseSingleChild(parent);
  return true;
}
function moveCell(document2, id, delta) {
  const parent = parentCell(document2, id);
  if (!(parent == null ? void 0 : parent.children)) return false;
  const index = parent.children.findIndex((child) => child.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= parent.children.length) return false;
  [parent.children[index], parent.children[next]] = [parent.children[next], parent.children[index]];
  return true;
}
function resizeSiblings(document2, firstId, secondId, firstWeight) {
  const parent = parentCell(document2, firstId);
  if (!(parent == null ? void 0 : parent.children) || parent !== parentCell(document2, secondId)) return false;
  const a = parent.children.find((child) => child.id === firstId);
  const b = parent.children.find((child) => child.id === secondId);
  if (!a || !b) return false;
  const bounded = Math.max(0.1, Math.min(1.9, Math.round(firstWeight * 20) / 20));
  a.sizing = { mode: "flexible", weight: bounded };
  b.sizing = { mode: "flexible", weight: 2 - bounded };
  return true;
}
function duplicateCell(document2, id) {
  const source = findCell(document2, id);
  const parent = parentCell(document2, id);
  if (!source || !(parent == null ? void 0 : parent.children)) return null;
  const copy = structuredCloneSafe(source);
  regenerateIds(copy);
  const index = parent.children.findIndex((child) => child.id === id);
  parent.children.splice(index + 1, 0, copy);
  return copy.id;
}
function regenerateIds(cell) {
  var _a;
  cell.id = onsiteId("cell");
  if (cell.block) {
    cell.block.id = onsiteId("block");
    if (cell.block.type === "button") cell.block.action.id = onsiteId("action");
  }
  (_a = cell.children) == null ? void 0 : _a.forEach(regenerateIds);
}
function collapseSingleChild(cell) {
  var _a;
  const child = (_a = cell.children) == null ? void 0 : _a[0];
  if (!child) return;
  const id = cell.id;
  Object.assign(cell, child, { id });
}
function duplicateDocument(document2) {
  const copy = structuredCloneSafe(document2);
  copy.id = onsiteId("document");
  regenerateIds(copy.root);
  return copy;
}
function cloneOnsite(value) {
  return structuredCloneSafe(value);
}
function structuredCloneSafe(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function migrateV1Builder(builder, content, widgetType, guide = false) {
  var _a;
  if (onsiteDocumentFromBuilder(builder)) return onsiteDocumentFromBuilder(builder);
  if (typeof document === "undefined") return null;
  const template = document.createElement("template");
  template.innerHTML = builder.html;
  const root = template.content.querySelector(".movcues-widget");
  if (!root) return null;
  const known = root.querySelectorAll("[data-movcues-content],[data-movcues-action-id],img");
  if (!known.length || root.querySelector("[data-movcues-question-id],[data-movcues-checklist-role]")) return null;
  const compatibility = root.cloneNode(true);
  compatibility.querySelectorAll("[data-movcues-content],[data-movcues-action-id],img").forEach((element) => element.remove());
  compatibility.querySelectorAll("*").forEach((element) => {
    var _a2;
    if (!((_a2 = element.textContent) == null ? void 0 : _a2.trim()) && !element.children.length) element.remove();
  });
  if (((_a = compatibility.textContent) == null ? void 0 : _a.trim()) || compatibility.children.length) return null;
  const cells = [];
  const alignment = (element) => element.classList.contains("movcues-align-center") ? "center" : element.classList.contains("movcues-align-right") ? "right" : element.classList.contains("movcues-align-left") ? "left" : void 0;
  const heading = root.querySelector('[data-movcues-content="heading"]');
  if (heading) {
    const block = createBlock("heading", guide);
    block.html = sanitizeRichText(heading.innerHTML);
    block.align = alignment(heading);
    cells.push(emptyCell(block));
  }
  const body = root.querySelector('[data-movcues-content="body"]');
  if (body) {
    const block = createBlock("text", guide);
    block.html = sanitizeRichText(body.innerHTML);
    block.align = alignment(body);
    cells.push(emptyCell(block));
  }
  root.querySelectorAll("img").forEach((image) => {
    const block = createBlock("image", guide);
    block.src = image.getAttribute("src") ?? "";
    block.alt = image.getAttribute("alt") ?? "";
    cells.push(emptyCell(block));
  });
  for (const [marker, fallback] of [["secondary", content.secondaryAction], ["primary", content.primaryAction]]) {
    const button = root.querySelector(`[data-movcues-action-id="${marker}"]`);
    if (!button || !fallback) continue;
    const block = createBlock("button", guide);
    block.label = fallback.label;
    block.variant = marker === "primary" ? "primary" : "secondary";
    block.action = { id: onsiteId("action"), ...fallback.type === "open_url" && fallback.url ? { type: "open_url", url: fallback.url } : fallback.type === "track_event" && fallback.eventName ? { type: "track_event", eventName: fallback.eventName } : { type: fallback.type === "next_step" ? "next_step" : "dismiss" } };
    cells.push(emptyCell(block));
  }
  if (!cells.length) return null;
  const migrated = { schemaVersion: 2, id: onsiteId("document"), root: { ...emptyCell(), direction: "column", gap: 12, padding: { top: 20, right: 20, bottom: 20, left: 20 }, children: cells } };
  applyOnsiteDocument(builder, migrated, widgetType);
  return migrated;
}
function sanitizeRichText(input) {
  if (typeof document === "undefined") return sanitizeRichTextWithoutDom(input);
  const template = document.createElement("template");
  template.innerHTML = input;
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    if (!SAFE_INLINE_TAGS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) if (!(element.tagName === "A" && ["href", "target", "rel"].includes(attribute.name))) element.removeAttribute(attribute.name);
    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      if (!builderLinkUrlIsSafe(href)) element.removeAttribute("href");
      const target = element.getAttribute("target");
      if (target && !["_blank", "_self"].includes(target)) element.removeAttribute("target");
      if (target === "_blank") element.setAttribute("rel", "noopener noreferrer");
    }
  }
  return template.innerHTML;
}
function sanitizeRichTextWithoutDom(input) {
  return input.replace(/<(?!\/?(?:br|strong|em|u|a|ul|ol|li)(?:\s|>|\/))/gi, "&lt;").replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "").replace(/javascript\s*:/gi, "");
}
function richTextToPlain(input) {
  if (typeof document === "undefined") return input.replace(/<br\s*\/?>/gi, "\n").replace(/<\/li>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  const template = document.createElement("template");
  template.innerHTML = input;
  const read = (node) => {
    if (node.nodeType === 3) return node.textContent ?? "";
    let value = "";
    for (const child of Array.from(node.childNodes)) {
      if (child instanceof HTMLElement && child.tagName === "BR") value += "\n";
      else {
        value += read(child);
        if (child instanceof HTMLElement && child.tagName === "LI") value += "\n";
      }
    }
    return value;
  };
  return read(template.content).trim();
}
function isOnsiteDocument(value) {
  return isOnsiteDocumentShape(value) && validateOnsiteDocument(value).valid;
}
function isOnsiteDocumentShape(value) {
  return !!value && typeof value === "object" && value.schemaVersion === 2 && !!value.root && value.root.type === "cell";
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function escapeText$1(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttribute(value) {
  return escapeText$1(value).replace(/"/g, "&quot;");
}
function round(value) {
  return String(Math.round(value * 100) / 100);
}
const BLOCK_LABEL = { heading: "Heading", text: "Text", button: "Button", image: "Image", divider: "Divider", spacer: "Spacer", icon: "Icon" };
const HISTORY_LIMIT = 50;
const HISTORY_BYTES = 2e6;
class OnsiteCompositionEditor {
  constructor(root, builder, content, widgetType, guide, callbacks) {
    this.root = root;
    this.builder = builder;
    this.content = content;
    this.widgetType = widgetType;
    this.guide = guide;
    this.callbacks = callbacks;
    this.edgeButtons = [];
    this.insertion = null;
    this.paletteAnchor = null;
    this.toolFrame = 0;
    this.handles = [];
    this.selection = { kind: "step", label: "Step" };
    this.history = [];
    this.historyIndex = -1;
    this.historyBytes = 0;
    this.compileTimer = 0;
    this.typingTimer = 0;
    this.composing = false;
    this.resizeCleanup = null;
    this.resizeFrame = 0;
    this.destroyed = false;
    this.onSurfaceClick = (event) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element) return;
      const blockElement = element.closest("[data-movcues-block-id]");
      const cellElement = element.closest("[data-movcues-node-id]");
      if (blockElement && cellElement) {
        const block = findBlock(this.document, blockElement.dataset.movcuesBlockId);
        if (block) this.select({ kind: "block", label: BLOCK_LABEL[block.type], cellId: cellElement.dataset.movcuesNodeId, blockId: block.id, blockType: block.type });
      } else if (cellElement) this.select({ kind: "cell", label: "Cell", cellId: cellElement.dataset.movcuesNodeId });
      else this.selectStep();
      if (blockElement == null ? void 0 : blockElement.matches("button,a")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    this.onDoubleClick = (event) => {
      const element = event.target instanceof Element ? event.target.closest("[data-movcues-block-id]") : null;
      const block = element ? findBlock(this.document, element.dataset.movcuesBlockId) : null;
      if (element && ((block == null ? void 0 : block.type) === "heading" || (block == null ? void 0 : block.type) === "text" || (block == null ? void 0 : block.type) === "button")) {
        element.contentEditable = "true";
        element.focus();
      }
    };
    this.onInput = (event) => {
      const element = event.target instanceof Element ? event.target.closest("[data-movcues-block-id]") : null;
      const block = element ? findBlock(this.document, element.dataset.movcuesBlockId) : null;
      if (!block || !element) return;
      if (block.type === "heading" || block.type === "text") block.html = sanitizeRichText(element.innerHTML);
      else if (block.type === "button") block.label = (element.textContent ?? "").slice(0, 80);
      else return;
      this.scheduleCompile();
      this.positionTools();
      this.callbacks.onChange();
      clearTimeout(this.typingTimer);
      this.typingTimer = window.setTimeout(() => this.pushHistory(), 300);
    };
    this.onBlur = (event) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (element == null ? void 0 : element.isContentEditable) {
        element.contentEditable = "false";
        this.flush();
        this.pushHistory();
      }
    };
    this.onCompositionStart = () => {
      this.composing = true;
    };
    this.onCompositionEnd = () => {
      this.composing = false;
      this.scheduleCompile();
    };
    this.onSurfaceKeyDown = (event) => {
      if (event.key === "Escape" && event.target instanceof HTMLElement && event.target.isContentEditable) {
        event.target.blur();
        event.preventDefault();
      }
      if ((event.ctrlKey || event.metaKey) && !(event.target instanceof HTMLElement && event.target.isContentEditable)) {
        if (event.key === "ArrowUp") {
          this.selectParent();
          event.preventDefault();
        }
        if (event.key === "ArrowDown") {
          this.selectChild();
          event.preventDefault();
        }
      }
    };
    this.onToolbarClick = (event) => {
      const button = event.target instanceof Element ? event.target.closest("button[data-command]") : null;
      if (!button || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const command = button.dataset.command;
      if (command === "add") {
        if (this.palette.hidden) this.openPalette(button);
        else this.closePalette();
      } else if (command === "columns") this.split("row");
      else if (command === "rows") this.split("column");
      else if (command === "parent") this.selectParent();
      else if (command === "duplicate") this.duplicate();
      else if (command === "delete") this.remove();
      else if (command === "move-up") this.move(-1);
      else if (command === "move-down") this.move(1);
    };
    this.onPaletteClick = (event) => {
      var _a;
      const button = event.target instanceof Element ? event.target.closest("[data-insert-block]") : null;
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.insertBlock(button.dataset.insertBlock, this.insertion ?? void 0)) {
        this.closePalette();
        const block = this.getSelectedBlock();
        const element = block ? (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-block-id="${block.id}"]`) : null;
        if (element) {
          element.tabIndex = -1;
          element.focus({ preventScroll: true });
        }
      }
    };
    this.dismissPalette = (event) => {
      if (!this.palette.hidden && !event.composedPath().some((node) => node === this.palette || node === this.paletteAnchor)) this.closePalette();
    };
    this.onPaletteKeyDown = (event) => {
      if (event.key !== "Escape" || this.palette.hidden) return;
      const anchor = this.paletteAnchor;
      this.closePalette();
      anchor == null ? void 0 : anchor.focus({ preventScroll: true });
      event.preventDefault();
    };
    this.positionTools = () => {
      cancelAnimationFrame(this.toolFrame);
      this.toolFrame = requestAnimationFrame(() => {
        if (!this.destroyed) this.updateToolPositions();
      });
    };
    this.startResize = (event) => {
      var _a, _b, _c;
      const handle = event.currentTarget;
      const firstId = handle.dataset.first;
      const secondId = handle.dataset.second;
      const first = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-node-id="${firstId}"]`);
      const second = (_b = this.surface) == null ? void 0 : _b.querySelector(`[data-movcues-node-id="${secondId}"]`);
      if (!first || !second) return;
      this.beforeTransaction();
      const row = handle.dataset.movcuesResizeHandle === "row";
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      const start = row ? event.clientX : event.clientY;
      const total = row ? a.width + b.width : a.height + b.height;
      const initial = row ? a.width : a.height;
      let ratio = initial / total * 2;
      const move = (next) => {
        ratio = Math.max(0.1, Math.min(1.9, (initial + (row ? next.clientX : next.clientY) - start) / total * 2));
        cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = requestAnimationFrame(() => {
          first.style.flex = `${ratio} 1 0px`;
          second.style.flex = `${2 - ratio} 1 0px`;
          this.positionHandles();
        });
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = 0;
        this.resizeCleanup = null;
        if (resizeSiblings(this.document, firstId, secondId, ratio)) this.commit(this.selection);
      };
      (_c = this.resizeCleanup) == null ? void 0 : _c.call(this);
      this.resizeCleanup = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    };
    this.resizeWithKeyboard = (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const handle = event.currentTarget;
      const first = findCell(this.document, handle.dataset.first);
      const weight = (first == null ? void 0 : first.sizing.mode) === "flexible" ? first.sizing.weight : 1;
      const increase = event.key === "ArrowRight" || event.key === "ArrowDown";
      this.beforeTransaction();
      if (resizeSiblings(this.document, handle.dataset.first, handle.dataset.second, weight + (increase ? 0.1 : -0.1))) this.commit(this.selection);
      event.preventDefault();
    };
    const existing = onsiteDocumentFromBuilder(builder);
    this.document = existing ?? migrateV1Builder(builder, content, widgetType, guide) ?? (() => {
      throw new Error("This v1 layout cannot be converted safely. Continue editing it with the compatibility editor.");
    })();
    this.migrated = !existing;
    this.surface = root.querySelector("[data-movcues-builder-surface]");
    this.toolbar = document.createElement("div");
    this.toolbar.dataset.movcuesCompositionToolbar = "";
    this.palette = document.createElement("div");
    this.palette.dataset.movcuesBlockPalette = "";
    this.palette.hidden = true;
  }
  start() {
    if (!this.surface) return;
    const repaired = this.repairDocumentStructure();
    this.compileAndPatch();
    const style = document.createElement("style");
    style.dataset.movcuesCompositionStyle = "";
    style.textContent = AUTHORING_STYLE;
    this.root.append(style);
    this.toolbar.setAttribute("role", "toolbar");
    this.toolbar.setAttribute("aria-label", "Selected element tools");
    const tools = [
      ["add", "Add block", '<path d="M8 3v10M3 8h10"/>'],
      ["columns", "Split into columns", '<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M8 2v12"/>'],
      ["rows", "Split into rows", '<rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 8h12"/>'],
      ["parent", "Select parent", '<path d="M8 13V3m-4 4 4-4 4 4"/>'],
      ["duplicate", "Duplicate", '<rect x="6" y="6" width="8" height="8" rx="1"/><path d="M10 4V2H2v8h2"/>'],
      ["move-up", "Move before", '<path d="M13 8H3m4-4L3 8l4 4"/>'],
      ["move-down", "Move after", '<path d="M3 8h10M9 4l4 4-4 4"/>'],
      ["delete", "Delete", '<path d="m4 4 8 8m0-8-8 8"/>']
    ];
    this.toolbar.innerHTML = tools.map(([command, label, icon]) => `<button type="button" data-command="${command}" title="${label}" aria-label="${label}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></button>`).join("");
    this.palette.innerHTML = Object.keys(BLOCK_LABEL).map((type) => `<button type="button" data-insert-block="${type}">${BLOCK_LABEL[type]}</button>`).join("");
    this.root.append(this.toolbar, this.palette);
    const edgeLabels = { top: "Add above", right: "Add to the right", bottom: "Add below", left: "Add to the left" };
    this.edgeButtons = ["top", "right", "bottom", "left"].map((edge) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.movcuesInsertEdge = edge;
      button.textContent = "+";
      button.title = edgeLabels[edge];
      button.setAttribute("aria-label", edgeLabels[edge]);
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => {
        const cell = this.getSelectedCell();
        if (this.paletteAnchor === button && !this.palette.hidden) this.closePalette();
        else if (cell) this.openPalette(button, { cellId: cell.id, edge });
      });
      this.root.append(button);
      return button;
    });
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
    window.addEventListener("scroll", this.positionTools, true);
    window.addEventListener("resize", this.positionTools);
    window.addEventListener("pointerdown", this.dismissPalette, true);
    window.addEventListener("keydown", this.onPaletteKeyDown);
    this.select({ kind: "step", label: "Step" });
    this.pushHistory();
    if (this.migrated || repaired) this.callbacks.onChange();
  }
  getDocument() {
    return this.document;
  }
  getSelection() {
    return this.selection;
  }
  getSelectedCell() {
    const id = this.selection.kind === "step" ? this.document.root.id : this.selection.cellId;
    return findCell(this.document, id);
  }
  getSelectedBlock() {
    return this.selection.kind === "block" ? findBlock(this.document, this.selection.blockId) : null;
  }
  canUndo() {
    return this.historyIndex > 0;
  }
  canRedo() {
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
  }
  isComposing() {
    return this.composing;
  }
  getValidation() {
    return validateOnsiteDocument(this.document).errors;
  }
  flush() {
    if (this.composing) return false;
    clearTimeout(this.compileTimer);
    this.compileTimer = 0;
    this.repairDocumentStructure();
    const validation = validateOnsiteDocument(this.document);
    this.callbacks.onValidation(validation.errors);
    if (!validation.valid) return false;
    const compiled = applyOnsiteDocument(this.builder, this.document, this.widgetType);
    Object.assign(this.content, compiled.content);
    return true;
  }
  snapshot() {
    this.flush();
    return { builder: cloneOnsite(this.builder), content: cloneOnsite(this.content) };
  }
  undo() {
    if (!this.canUndo() || this.composing) return;
    this.historyIndex--;
    this.restore(this.history[this.historyIndex]);
  }
  redo() {
    if (!this.canRedo() || this.composing) return;
    this.historyIndex++;
    this.restore(this.history[this.historyIndex]);
  }
  selectStep() {
    this.select({ kind: "step", label: "Step" });
  }
  selectParent() {
    if (this.selection.kind === "block") {
      this.select({ kind: "cell", label: "Cell", cellId: this.selection.cellId });
      return;
    }
    if (this.selection.kind === "cell") {
      const parent = parentCell(this.document, this.selection.cellId);
      parent ? this.select({ kind: "cell", label: "Parent cell", cellId: parent.id }) : this.selectStep();
    }
  }
  selectChild() {
    var _a;
    if (this.selection.kind === "step") {
      this.select({ kind: "cell", label: "Root cell", cellId: this.document.root.id });
      return;
    }
    if (this.selection.kind !== "cell") return;
    const cell = findCell(this.document, this.selection.cellId);
    if (!cell) return;
    if (cell.block) this.select({ kind: "block", label: BLOCK_LABEL[cell.block.type], cellId: cell.id, blockId: cell.block.id, blockType: cell.block.type });
    else if ((_a = cell.children) == null ? void 0 : _a[0]) this.select({ kind: "cell", label: "Child cell", cellId: cell.children[0].id });
  }
  insertBlock(type, insertion) {
    const cell = this.getSelectedCell();
    if (!cell) return false;
    this.beforeTransaction();
    const block = createBlock(type, this.guide);
    if (insertion) {
      const candidate = cloneOnsite(this.document);
      const id = insertAdjacentCell(candidate, insertion.cellId, insertion.edge);
      if (!id) return false;
      findCell(candidate, id).block = block;
      const validation = validateOnsiteDocument(candidate);
      this.callbacks.onValidation(validation.errors);
      if (!validation.valid) return false;
      this.document = candidate;
      this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: id, blockId: block.id, blockType: type });
      return true;
    }
    if (cell.children) {
      const added2 = emptyCell(block);
      cell.children.push(added2);
      this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: added2.id, blockId: block.id, blockType: type });
      return true;
    }
    if (!cell.block) {
      cell.block = block;
      this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: cell.id, blockId: block.id, blockType: type });
      return true;
    }
    const addedId = duplicateCell(this.document, cell.id) ?? splitCell(this.document, cell.id, "column");
    const added = addedId ? findCell(this.document, addedId) : null;
    if (!added) return false;
    delete added.children;
    added.block = block;
    this.commit({ kind: "block", label: BLOCK_LABEL[type], cellId: added.id, blockId: block.id, blockType: type });
    return true;
  }
  split(direction) {
    const cell = this.getSelectedCell();
    if (!cell) return false;
    this.beforeTransaction();
    const id = splitCell(this.document, cell.id, direction);
    if (!id) return false;
    this.commit({ kind: "cell", label: direction === "row" ? "Right cell" : "Lower cell", cellId: id });
    return true;
  }
  addEdge(edge) {
    this.beforeTransaction();
    const id = insertEdgeCell(this.document, edge);
    this.commit({ kind: "cell", label: `${edge} cell`, cellId: id });
  }
  duplicate() {
    const cell = this.getSelectedCell();
    if (!cell || cell === this.document.root) return false;
    this.beforeTransaction();
    const id = duplicateCell(this.document, cell.id);
    if (!id) return false;
    this.commit({ kind: "cell", label: "Duplicated cell", cellId: id });
    return true;
  }
  remove() {
    const cell = this.getSelectedCell();
    if (!cell || cell === this.document.root) return false;
    this.beforeTransaction();
    const parent = parentCell(this.document, cell.id);
    if (!removeCell(this.document, cell.id)) return false;
    this.commit(parent ? { kind: "cell", label: "Parent cell", cellId: parent.id } : { kind: "step", label: "Step" });
    return true;
  }
  move(delta) {
    const cell = this.getSelectedCell();
    if (!cell) return false;
    this.beforeTransaction();
    if (!moveCell(this.document, cell.id, delta)) return false;
    this.commit(this.selection);
    return true;
  }
  updateCell(update) {
    const cell = this.getSelectedCell();
    if (!cell) return;
    this.beforeTransaction();
    Object.assign(cell, cloneOnsite(update));
    this.commit(this.selection);
  }
  updateBlock(update) {
    const block = this.getSelectedBlock();
    if (!block) return;
    this.beforeTransaction();
    Object.assign(block, cloneOnsite(update));
    this.commit(this.selection);
  }
  updateButtonAction(action) {
    const block = this.getSelectedBlock();
    if ((block == null ? void 0 : block.type) !== "button") return;
    this.beforeTransaction();
    block.action = { id: block.action.id, ...action };
    this.commit(this.selection);
  }
  editSelected() {
    var _a;
    if (this.selection.kind !== "block") return;
    const block = this.getSelectedBlock();
    if (!block || !["heading", "text", "button"].includes(block.type)) return;
    const element = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-block-id="${block.id}"]`);
    if (element) {
      element.contentEditable = "true";
      element.focus();
    }
  }
  setAlignment(align) {
    this.updateBlock({ align });
  }
  formatInline(tag) {
    return this.wrapSelection(tag);
  }
  toggleList(tag) {
    const block = this.getSelectedBlock();
    if ((block == null ? void 0 : block.type) !== "text") return false;
    this.beforeTransaction();
    const current = block.html.trim();
    block.html = current.startsWith(`<${tag}>`) ? current.replace(new RegExp(`^<${tag}><li>|</li></${tag}>$`, "g"), "") : `<${tag}><li>${current}</li></${tag}>`;
    this.commit(this.selection);
    return true;
  }
  applyLink(url) {
    if (!builderLinkUrlIsSafe(url)) return false;
    return this.wrapSelection("a", url);
  }
  wrapSelection(tag, href) {
    var _a;
    const block = this.getSelectedBlock();
    if (!block || block.type !== "heading" && block.type !== "text") return false;
    const element = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-block-id="${block.id}"]`);
    if (!element) return false;
    this.beforeTransaction();
    const selection = window.getSelection();
    const range = (selection == null ? void 0 : selection.rangeCount) ? selection.getRangeAt(0) : null;
    const selectedInside = range && element.contains(range.commonAncestorContainer) && !range.collapsed;
    if (selectedInside && range) {
      const wrapper = document.createElement(tag);
      if (tag === "a" && href) {
        wrapper.setAttribute("href", href);
        if (/^https?:\/\//i.test(href)) {
          wrapper.setAttribute("target", "_blank");
          wrapper.setAttribute("rel", "noopener noreferrer");
        }
      }
      try {
        range.surroundContents(wrapper);
      } catch {
        wrapper.append(range.extractContents());
        range.insertNode(wrapper);
      }
      block.html = sanitizeRichText(element.innerHTML);
    } else {
      const open = tag === "a" ? `<a href="${escapeHtmlAttribute(href ?? "")}"${/^https?:\/\//i.test(href ?? "") ? ' target="_blank" rel="noopener noreferrer"' : ""}>` : `<${tag}>`;
      block.html = `${open}${block.html}</${tag}>`;
    }
    this.commit(this.selection);
    return true;
  }
  select(selection) {
    var _a, _b, _c, _d;
    this.closePalette();
    this.selection = selection;
    (_a = this.surface) == null ? void 0 : _a.querySelectorAll("[data-movcues-editor-selected]").forEach((element) => element.removeAttribute("data-movcues-editor-selected"));
    const target = selection.kind === "block" ? (_b = this.surface) == null ? void 0 : _b.querySelector(`[data-movcues-block-id="${selection.blockId}"]`) : selection.kind === "cell" ? (_c = this.surface) == null ? void 0 : _c.querySelector(`[data-movcues-node-id="${selection.cellId}"]`) : (_d = this.surface) == null ? void 0 : _d.querySelector(".movcues-widget");
    target == null ? void 0 : target.setAttribute("data-movcues-editor-selected", selection.kind);
    this.syncToolbarState();
    this.callbacks.onSelectionChange(selection);
    this.renderResizeHandles();
    this.positionTools();
  }
  beforeTransaction() {
    clearTimeout(this.typingTimer);
    this.repairDocumentStructure();
    this.flush();
  }
  commit(selection) {
    this.repairDocumentStructure();
    this.selection = selection;
    this.compileAndPatch();
    this.pushHistory();
    this.callbacks.onChange();
    this.select(selection);
  }
  compileAndPatch() {
    var _a;
    const compiled = applyOnsiteDocument(this.builder, this.document, this.widgetType);
    Object.assign(this.content, compiled.content);
    const template = document.createElement("template");
    template.innerHTML = compiled.html;
    (_a = this.surface) == null ? void 0 : _a.replaceChildren(...Array.from(template.content.childNodes));
    const style = this.root.querySelector("style[data-movcues-builder-style]");
    if (style) style.textContent = `${compiled.css}
[data-movcues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movcues-builder-surface]>.movcues-widget{position:relative!important;inset:auto!important}`;
  }
  scheduleCompile() {
    clearTimeout(this.compileTimer);
    this.compileTimer = window.setTimeout(() => {
      if (!this.destroyed && !this.composing) {
        this.repairDocumentStructure();
        const compiled = applyOnsiteDocument(this.builder, this.document, this.widgetType);
        Object.assign(this.content, compiled.content);
        this.callbacks.onValidation(validateOnsiteDocument(this.document).errors);
      }
    }, 160);
  }
  repairDocumentStructure() {
    let repaired = false;
    const blockIds = /* @__PURE__ */ new Set();
    const repair = (cell) => {
      var _a;
      if (cell.children && cell.block) {
        const block = cell.block;
        delete cell.block;
        if (!cell.children.some((child) => listBlocks(child).some((candidate) => candidate.id === block.id))) cell.children.unshift(emptyCell(block));
        repaired = true;
      }
      (_a = cell.children) == null ? void 0 : _a.forEach(repair);
      if (!cell.block) return;
      if (blockIds.has(cell.block.id)) {
        cell.block.id = onsiteId("block");
        if (cell.block.type === "button") cell.block.action.id = onsiteId("action");
        repaired = true;
      }
      blockIds.add(cell.block.id);
    };
    repair(this.document.root);
    return repaired;
  }
  pushHistory() {
    const document2 = cloneOnsite(this.document);
    const bytes = JSON.stringify(document2).length;
    const entry = { document: document2, selection: cloneOnsite(this.selection), bytes };
    if (this.historyIndex < this.history.length - 1) {
      this.historyBytes -= this.history.slice(this.historyIndex + 1).reduce((sum, item) => sum + item.bytes, 0);
      this.history.splice(this.historyIndex + 1);
    }
    this.history.push(entry);
    this.historyBytes += bytes;
    while (this.history.length > HISTORY_LIMIT || this.historyBytes > HISTORY_BYTES) {
      const removed = this.history.shift();
      this.historyBytes -= (removed == null ? void 0 : removed.bytes) ?? 0;
    }
    this.historyIndex = this.history.length - 1;
  }
  restore(entry) {
    this.document = cloneOnsite(entry.document);
    this.compileAndPatch();
    this.selection = cloneOnsite(entry.selection);
    this.callbacks.onChange();
    this.select(this.selection);
  }
  openPalette(anchor, insertion = null) {
    var _a, _b, _c;
    this.closePalette();
    this.insertion = insertion;
    this.paletteAnchor = anchor;
    this.palette.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    if (insertion) (_b = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-node-id="${insertion.cellId}"]`)) == null ? void 0 : _b.setAttribute("data-movcues-insertion-edge", insertion.edge);
    this.positionTools();
    (_c = this.palette.querySelector("button")) == null ? void 0 : _c.focus({ preventScroll: true });
  }
  closePalette() {
    var _a, _b;
    this.palette.hidden = true;
    (_a = this.paletteAnchor) == null ? void 0 : _a.setAttribute("aria-expanded", "false");
    this.paletteAnchor = null;
    this.insertion = null;
    (_b = this.surface) == null ? void 0 : _b.querySelectorAll("[data-movcues-insertion-edge]").forEach((element) => element.removeAttribute("data-movcues-insertion-edge"));
  }
  syncToolbarState() {
    const cell = this.getSelectedCell();
    const atRoot = !cell || cell === this.document.root;
    for (const command of ["delete", "duplicate"]) {
      const button = this.toolbar.querySelector(`[data-command="${command}"]`);
      if (!button) continue;
      button.disabled = atRoot;
      button.title = atRoot ? "Select an element to use this action" : command === "delete" ? "Delete selected element (Undo is available)" : "Duplicate";
    }
  }
  updateToolPositions() {
    var _a, _b;
    const cell = this.getSelectedCell();
    const target = cell ? (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-node-id="${cell.id}"]`) : null;
    const widget = (_b = this.surface) == null ? void 0 : _b.querySelector(".movcues-widget");
    if (!target || !widget) {
      this.toolbar.hidden = true;
      this.edgeButtons.forEach((button) => {
        button.hidden = true;
      });
      this.closePalette();
      return;
    }
    const rect = target.getBoundingClientRect();
    const bounds = this.availableCanvasBounds();
    const visible = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    this.toolbar.hidden = !visible;
    this.edgeButtons.forEach((button) => {
      button.hidden = !visible;
    });
    if (!visible) {
      this.closePalette();
      return;
    }
    this.toolbar.style.maxWidth = `${bounds.right - bounds.left}px`;
    const toolbarRect = this.toolbar.getBoundingClientRect();
    const widgetRect = widget.getBoundingClientRect();
    const point = placeOutside(widgetRect, toolbarRect, bounds);
    this.toolbar.style.transform = `translate(${point.left}px,${point.top}px)`;
    for (const button of this.edgeButtons) {
      const edge = button.dataset.movcuesInsertEdge;
      const x = edge === "left" ? rect.left : edge === "right" ? rect.right : rect.left + rect.width / 2;
      const y = edge === "top" ? rect.top : edge === "bottom" ? rect.bottom : rect.top + rect.height / 2;
      button.style.transform = `translate(${Math.max(2, Math.min(innerWidth - 26, x - 12))}px,${Math.max(2, Math.min(innerHeight - 26, y - 12))}px)`;
    }
    if (!this.palette.hidden && this.paletteAnchor) {
      const palettePoint = placeOutside(this.paletteAnchor.getBoundingClientRect(), this.palette.getBoundingClientRect(), bounds);
      this.palette.style.transform = `translate(${palettePoint.left}px,${palettePoint.top}px)`;
    }
    this.positionHandles();
  }
  availableCanvasBounds() {
    var _a, _b;
    const inset = 6;
    const aside = (_b = (_a = document.querySelector("[data-movcues-editor]")) == null ? void 0 : _a.shadowRoot) == null ? void 0 : _b.querySelector("aside");
    const panel = aside == null ? void 0 : aside.getBoundingClientRect();
    let left = inset;
    let right = innerWidth - inset;
    if (panel && panel.width > 0 && panel.height > 0) {
      if (panel.left < innerWidth / 2 && innerWidth - panel.right > 240) left = Math.max(left, panel.right + inset);
      else if (panel.left >= innerWidth / 2 && panel.left > 240) right = Math.min(right, panel.left - inset);
    }
    return { left, right: Math.max(left, right), top: inset, bottom: innerHeight - inset };
  }
  renderResizeHandles() {
    this.handles.forEach((handle) => handle.remove());
    this.handles = [];
    const cell = this.getSelectedCell();
    const parent = cell ? parentCell(this.document, cell.id) : null;
    if (!cell || !(parent == null ? void 0 : parent.children)) return;
    const index = parent.children.indexOf(cell);
    for (const firstIndex of [index - 1, index]) {
      const first = parent.children[firstIndex];
      const second = parent.children[firstIndex + 1];
      if (!first || !second) continue;
      const handle = document.createElement("button");
      handle.type = "button";
      handle.dataset.movcuesResizeHandle = parent.direction;
      handle.dataset.first = first.id;
      handle.dataset.second = second.id;
      handle.textContent = parent.direction === "row" ? "↔" : "↕";
      handle.setAttribute("aria-label", `Resize ${parent.direction === "row" ? "columns" : "rows"}`);
      handle.addEventListener("pointerdown", this.startResize);
      handle.addEventListener("keydown", this.resizeWithKeyboard);
      this.root.append(handle);
      this.handles.push(handle);
    }
    this.positionHandles();
  }
  positionHandles() {
    var _a;
    for (const handle of this.handles) {
      const first = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-node-id="${handle.dataset.first}"]`);
      if (!first) continue;
      const rect = first.getBoundingClientRect();
      const row = handle.dataset.movcuesResizeHandle === "row";
      handle.style.transform = `translate(${row ? rect.right - 5 : rect.left + rect.width / 2 + 16}px,${row ? rect.top + rect.height / 2 + 16 : rect.bottom - 5}px)`;
    }
  }
  destroy() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    this.destroyed = true;
    clearTimeout(this.compileTimer);
    clearTimeout(this.typingTimer);
    cancelAnimationFrame(this.toolFrame);
    cancelAnimationFrame(this.resizeFrame);
    (_a = this.resizeCleanup) == null ? void 0 : _a.call(this);
    this.closePalette();
    (_b = this.surface) == null ? void 0 : _b.removeEventListener("click", this.onSurfaceClick);
    (_c = this.surface) == null ? void 0 : _c.removeEventListener("dblclick", this.onDoubleClick);
    (_d = this.surface) == null ? void 0 : _d.removeEventListener("input", this.onInput);
    (_e = this.surface) == null ? void 0 : _e.removeEventListener("blur", this.onBlur, true);
    (_f = this.surface) == null ? void 0 : _f.removeEventListener("compositionstart", this.onCompositionStart);
    (_g = this.surface) == null ? void 0 : _g.removeEventListener("compositionend", this.onCompositionEnd);
    (_h = this.surface) == null ? void 0 : _h.removeEventListener("keydown", this.onSurfaceKeyDown);
    this.toolbar.remove();
    this.palette.remove();
    this.edgeButtons.forEach((button) => button.remove());
    this.handles.forEach((handle) => handle.remove());
    (_i = this.root.querySelector("style[data-movcues-composition-style]")) == null ? void 0 : _i.remove();
    this.root.removeEventListener("scroll", this.positionTools, true);
    window.removeEventListener("scroll", this.positionTools, true);
    window.removeEventListener("resize", this.positionTools);
    window.removeEventListener("pointerdown", this.dismissPalette, true);
    window.removeEventListener("keydown", this.onPaletteKeyDown);
  }
}
function placeOutside(rect, size, bounds) {
  const clampX = (x) => Math.max(bounds.left, Math.min(bounds.right - size.width, x));
  const clampY = (y) => Math.max(bounds.top, Math.min(bounds.bottom - size.height, y));
  const candidates = [
    { left: clampX(rect.left), top: rect.bottom + 10 },
    { left: clampX(rect.left), top: rect.top - size.height - 10 },
    { left: rect.right + 10, top: clampY(rect.top) },
    { left: rect.left - size.width - 10, top: clampY(rect.top) }
  ];
  return candidates.find((p) => p.left >= bounds.left && p.left + size.width <= bounds.right && p.top >= bounds.top && p.top + size.height <= bounds.bottom) ?? { left: clampX(rect.left), top: clampY(rect.bottom + 10) };
}
const AUTHORING_STYLE = `
[data-movcues-editor-selected=step]{outline:2px solid #2563eb!important;outline-offset:3px}[data-movcues-editor-selected=cell]{outline:2px solid #0ea5e9!important;outline-offset:-2px}[data-movcues-editor-selected=block]{outline:2px solid #2563eb!important;outline-offset:2px}
[data-movcues-composition-toolbar],[data-movcues-block-palette],[data-movcues-resize-handle],[data-movcues-insert-edge]{box-sizing:border-box;position:fixed;left:0;top:0;z-index:2147483646;pointer-events:auto;font:12px/1.2 ui-sans-serif,system-ui,sans-serif}
[data-movcues-composition-toolbar]{display:flex;gap:1px;max-width:calc(100vw - 12px);overflow:auto;padding:3px;border:1px solid #dbe2ea;border-radius:8px;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.14)}[data-movcues-composition-toolbar] button,[data-movcues-block-palette] button{min-height:28px;padding:5px 7px;border:0;border-radius:5px;background:transparent;color:#334155;font:600 11px inherit;cursor:pointer}[data-movcues-composition-toolbar] button{flex:none;width:28px;padding:0;font-size:16px}[data-movcues-composition-toolbar] button:hover:not(:disabled),[data-movcues-block-palette] button:hover{background:#eff6ff;color:#1d4ed8}[data-movcues-composition-toolbar] button:disabled{cursor:not-allowed;opacity:.42}
[data-movcues-composition-toolbar] svg{display:block;margin:auto}
[data-movcues-insert-edge]{width:24px;height:24px;padding:0;border:1px solid #93c5fd;border-radius:50%;background:#fff;color:#2563eb;box-shadow:0 2px 6px rgba(15,23,42,.12);font-size:18px;cursor:pointer}[data-movcues-insert-edge]:hover,[data-movcues-insert-edge][aria-expanded=true]{background:#2563eb;color:#fff}
[data-movcues-insertion-edge=top]{box-shadow:inset 0 3px #2563eb}[data-movcues-insertion-edge=bottom]{box-shadow:inset 0 -3px #2563eb}[data-movcues-insertion-edge=left]{box-shadow:inset 3px 0 #2563eb}[data-movcues-insertion-edge=right]{box-shadow:inset -3px 0 #2563eb}
[data-movcues-composition-toolbar][hidden],[data-movcues-block-palette][hidden],[data-movcues-insert-edge][hidden]{display:none!important}
[data-movcues-composition-toolbar] button:focus-visible,[data-movcues-block-palette] button:focus-visible,[data-movcues-insert-edge]:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
[data-movcues-block-palette]{display:grid;grid-template-columns:repeat(2,minmax(76px,1fr));gap:3px;width:180px;padding:6px;border:1px solid #dbe2ea;border-radius:9px;background:#fff;box-shadow:0 12px 30px rgba(15,23,42,.2)}[data-movcues-block-palette][hidden]{display:none}
[data-movcues-resize-handle]{width:28px;height:28px;padding:0;border:2px solid #fff;border-radius:50%;background:#2563eb;color:#fff;box-shadow:0 2px 8px rgba(15,23,42,.25);cursor:col-resize}[data-movcues-resize-handle=column]{cursor:row-resize}[contenteditable=true]{cursor:text!important;outline:2px solid #60a5fa!important;outline-offset:2px}
`;
function escapeHtmlAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
class EditorModeController {
  constructor(apiBase) {
    this.apiBase = apiBase;
    this.host = null;
    this.root = null;
    this.picker = new ElementPicker();
    this.preview = new ExperienceRenderer();
    this.contentEditor = null;
    this.compositionEditor = null;
    this.componentSelection = null;
    this.compositionSelection = null;
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
      var _a, _b;
      if (!this.dirty && !this.saveInFlight && !((_a = this.contentEditor) == null ? void 0 : _a.isComposing()) && !((_b = this.compositionEditor) == null ? void 0 : _b.isComposing())) return;
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
    const guideMarkup = selectableSteps ? `<section class="section step-navigator" data-guide><div class="content-heading"><div><div class="eyebrow">${this.guide ? "Guide steps" : "Survey steps"}</div><div class="muted" data-step-label></div></div>${this.guide ? '<div class="history-row"><button type="button" class="secondary-button compact" data-add-step="modal">＋ Modal</button><button type="button" class="secondary-button compact" data-add-step="anchored_card">＋ Anchored</button></div>' : ""}</div><div class="step-flow" data-step-flow>${this.stepButtons()}</div>${this.guide ? '<div class="history-row"><button type="button" class="secondary-button compact" data-duplicate-step>Duplicate</button><button type="button" class="secondary-button compact" data-step-left>←</button><button type="button" class="secondary-button compact" data-step-right>→</button><button type="button" class="secondary-button compact" data-delete-step>Delete</button></div>' : ""}</section>` : "";
    const designDisabled = draft.experience.builderMode !== "onsite" ? ' disabled title="Content is edited in the GrapesJS Dashboard Builder"' : "";
    return `<aside>
      <header data-drag-handle>
        <div class="header-copy"><strong>Movcues Live Editor</strong><span>${escapeText(draft.experience.name)}</span><small><i></i> Connected · <span data-save-state>Draft saved</span></small></div>
        <div class="header-actions"><button type="button" data-global-undo aria-label="Undo">↶</button><button type="button" data-global-redo aria-label="Redo">↷</button><button type="button" data-move-side aria-label="Move inspector to other side">⇄</button><button type="button" data-return-dashboard aria-label="Return to dashboard">↗</button><button type="button" data-minimize aria-label="Minimize editor">—</button><button type="button" data-close aria-label="Close editor">×</button></div>
      </header>
      <main>
        <div class="modebar"><button type="button" data-mode="design"${designDisabled}>Design</button><button type="button" data-mode="target">Target</button><button type="button" data-mode="navigate">Navigate</button><button type="button" data-mode="preview">Preview</button></div>
        <button type="button" class="secondary-button" data-reset-preview hidden>Reset Preview</button><p class="hint" data-preview-limit hidden>Preview tests this step only. Links and external actions are disabled.</p>
        <div class="notice" data-route-notice hidden><b>Page changed</b><span data-route-change></span></div>
        ${guideMarkup}
        <section class="section composition-inspector" data-composition-inspector hidden>
          <div class="content-heading"><div><div class="eyebrow">Inspector</div><strong data-composition-label>Step</strong></div><button type="button" class="secondary-button compact" data-select-step>Step</button></div>
          <div data-inspector="step"><label>Step label<input data-step-name type="text" maxlength="80" placeholder="Step label"></label><div class="history-row"><button type="button" class="secondary-button compact" data-edge="top">Header</button><button type="button" class="secondary-button compact" data-edge="bottom">Footer</button><button type="button" class="secondary-button compact" data-edge="left">Left area</button><button type="button" class="secondary-button compact" data-edge="right">Right area</button></div></div>
          <div data-inspector="cell" hidden>
            <label>Direction<select data-cell-direction><option value="column">Column</option><option value="row">Row</option></select></label>
            <label>Size<select data-cell-size><option value="flexible">Flexible</option><option value="hug">Hug content</option><option value="fixed">Fixed</option></select></label>
            <label data-fixed-size hidden>Fixed size<div class="number"><input data-cell-fixed type="number" min="24" max="1200"><span>px</span></div></label>
            <label>Align<select data-cell-align><option value="stretch">Stretch</option><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></select></label>
            <label>Gap<div class="number"><input data-cell-gap type="number" min="0" max="96"><span>px</span></div></label>
            <label>Padding<div class="number"><input data-cell-padding type="number" min="0" max="128"><span>px</span></div></label>
            <label>Background<input data-cell-background type="color" value="#ffffff"></label><label>Border<div class="number"><input data-cell-border type="number" min="0" max="16"><span>px</span></div></label><label>Radius<div class="number"><input data-cell-radius type="number" min="0" max="100"><span>px</span></div></label>
            <label class="check"><input data-cell-stack type="checkbox"> Stack on narrow screens</label>
          </div>
          <div data-inspector="block" hidden>
            <div data-block="heading,text"><div class="formatbar"><button type="button" data-v2-format="strong"><b>B</b></button><button type="button" data-v2-format="em"><i>I</i></button><button type="button" data-v2-format="u"><u>U</u></button><button type="button" data-v2-list="ul">• List</button><button type="button" data-v2-list="ol">1. List</button></div><div class="link-row"><input data-v2-link-url aria-label="Link URL" type="text" inputmode="url" placeholder="https://… or /path"><button type="button" class="secondary-button compact" data-v2-apply-link>Link</button></div><label>Font size<div class="number"><input data-block-font-size type="number" min="10" max="72"><span>px</span></div></label><label>Line height<input data-block-line-height type="number" min="0.9" max="3" step="0.05"></label><label>Weight<select data-block-weight><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option></select></label><label>Text color<input data-block-color type="color"></label></div>
            <div data-block="button"><label>Label<input data-button-label type="text" maxlength="80"></label><label>Variant<select data-button-variant><option value="primary">Primary</option><option value="secondary">Secondary</option><option value="outline">Outline</option></select></label><label>Action<select data-button-action><option value="dismiss">Dismiss</option>${this.guide ? '<option value="next_step">Next step</option><option value="previous_step">Previous step</option>' : ""}<option value="open_url">Open URL</option><option value="track_event">Track event</option></select></label><label data-action-url hidden>URL<input data-button-url type="url" placeholder="https://example.com"></label><label data-action-event hidden>Event<input data-button-event type="text" maxlength="200" placeholder="feature_clicked"></label><label>Background<input data-button-background type="color"></label><label>Text color<input data-button-color type="color"></label><label>Width<select data-button-width><option value="hug">Hug content</option><option value="full">Full width</option></select></label><label>Horizontal pad<div class="number"><input data-button-padding-x type="number" min="4" max="48"><span>px</span></div></label><label>Vertical pad<div class="number"><input data-button-padding-y type="number" min="4" max="32"><span>px</span></div></label><label>Radius<div class="number"><input data-button-radius type="number" min="0" max="48"><span>px</span></div></label></div>
            <div data-block="image"><label>Source<input data-v2-image-src type="url"></label><label>Alt text<input data-v2-image-alt type="text" maxlength="500"></label><label>Fit<select data-image-fit><option value="cover">Cover</option><option value="contain">Contain</option></select></label><label>Width<div class="number"><input data-image-width type="number" min="1" max="100"><span>%</span></div></label><label>Radius<div class="number"><input data-image-radius type="number" min="0" max="100"><span>px</span></div></label></div>
            <div data-block="divider"><label>Thickness<div class="number"><input data-divider-thickness type="number" min="1" max="16"><span>px</span></div></label><label>Color<input data-divider-color type="color"></label></div>
            <div data-block="spacer"><label>Space<div class="number"><input data-spacer-size type="number" min="4" max="240"><span>px</span></div></label></div>
            <div data-block="icon"><label>Icon<select data-icon-name><option value="check">Check</option><option value="star">Star</option><option value="info">Info</option><option value="warning">Warning</option><option value="sparkles">Sparkles</option><option value="arrow">Arrow</option><option value="heart">Heart</option><option value="rocket">Rocket</option></select></label><label>Size<div class="number"><input data-icon-size type="number" min="12" max="96"><span>px</span></div></label><label>Color<input data-icon-color type="color"></label></div>
            <label>Alignment<select data-block-align><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          </div>
          <div class="history-row"><button type="button" class="secondary-button compact" data-v2-undo>Undo</button><button type="button" class="secondary-button compact" data-v2-redo>Redo</button></div>
        </section>
        <section class="section content-inspector" data-content-inspector hidden>
          <div class="content-heading"><div><div class="eyebrow">Content</div><strong data-component-label>Nothing selected</strong></div><button type="button" class="secondary-button compact" data-edit-component>Edit</button></div>
          <div class="formatbar" data-text-controls><button type="button" data-format="strong" aria-label="Bold"><b>B</b></button><button type="button" data-format="em" aria-label="Italic"><i>I</i></button><button type="button" data-format="u" aria-label="Underline"><u>U</u></button><button type="button" data-list="ul" aria-label="Bulleted list">• List</button><button type="button" data-list="ol" aria-label="Numbered list">1. List</button></div>
          <div class="format-row" data-text-controls><label>Align<select data-text-align><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
          <div class="link-row" data-text-controls><input data-link-url aria-label="Link URL" type="text" inputmode="url" placeholder="https://… or /path"><button type="button" class="secondary-button compact" data-apply-link>Link</button></div>
          <div class="image-controls" data-image-controls hidden><label>Source URL<input data-image-src type="text" inputmode="url"></label><label>Alt text<input data-image-alt type="text" maxlength="500"></label><button type="button" class="secondary-button" data-apply-image>Apply image</button></div>
          <div class="history-row"><button type="button" class="secondary-button compact" data-undo disabled>Undo</button><button type="button" class="secondary-button compact" data-redo disabled>Redo</button></div>
        </section>
        <section class="section" data-step-only data-for="target">
          <div class="eyebrow">Target</div><strong class="truncate" data-target-label>Not selected</strong><div class="reliability" data-reliability></div>
          <button class="secondary-button" type="button" data-pick>Reselect target</button>
        </section>
        <section class="section" data-step-only data-layering-section>
          <div class="eyebrow">Layering</div>
          <label>Policy<select data-layer-mode><option value="auto">Automatic</option><option value="relative">Relative to an element</option><option value="always_on_top">Always on top</option><option value="custom">Advanced / Custom</option></select></label>
          <div class="muted" data-layer-description></div>
          <div data-layer-relative hidden><strong class="truncate" data-layer-target>Not selected</strong><button class="secondary-button" type="button" data-pick-layer>Select element from page</button><label>Relationship<select data-layer-relation><option value="above">Above</option><option value="below">Below</option></select></label></div>
          <label data-layer-custom hidden>Custom z-index<input data-layer-z-index type="number" min="1" max="2147483647"></label>
        </section>
        <section class="section" data-step-only data-placement-section>
          <div class="eyebrow">Placement</div>
          <div data-for="anchored"><div class="placement-grid">${placementButton("top", "Top")}${placementButton("left", "Left")}${placementButton("auto", "Auto")}${placementButton("right", "Right")}${placementButton("bottom", "Bottom")}</div><label>Alignment<select data-alignment><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></select></label><label>Offset<div class="number"><input data-offset type="number" min="0" max="100"><span>px</span></div></label></div>
          <div data-for="toast"><label>Position<select data-toast-position><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label><label>Auto-dismiss<div class="number"><input data-auto-dismiss type="number" min="500" placeholder="Disabled"><span>ms</span></div></label></div>
          <div data-for="modal"><label>Layout<select data-modal-layout><option value="center">Centered</option><option value="fullscreen">Fullscreen</option></select></label></div>
          <div data-for="backdrop"><label class="check"><input data-backdrop type="checkbox"> Backdrop</label><label>Backdrop opacity<input data-backdrop-opacity type="number" min="0" max="0.9" step="0.05"></label><label class="check"><input data-close-backdrop type="checkbox"> Dismiss on backdrop click</label></div>
          <div data-for="slideout"><label>Position<select data-slideout-position><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="center-left">Center left</option><option value="center-right">Center right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label></div>
          <div data-for="banner"><label>Position<select data-banner-position><option value="top">Top</option><option value="bottom">Bottom</option></select></label></div>
          <div data-for="cursor"><label>X offset<div class="number"><input data-cursor-x type="number"><span>px</span></div></label><label>Y offset<div class="number"><input data-cursor-y type="number"><span>px</span></div></label></div>
          <div data-for="hotspot"><label>Beacon style<select data-hotspot-style><option value="pulse">Pulse</option><option value="dot">Dot</option><option value="question">Question mark</option></select></label><label>Beacon color<input data-hotspot-color type="color"></label></div>
        </section>
        <section class="section" data-step-only data-step-summary hidden><div class="eyebrow">Step</div><dl><dt>Advances on</dt><dd data-advance></dd><dt>Dismissible</dt><dd data-dismissible></dd></dl></section>
        <section class="section" data-step-only><div class="eyebrow">Configured</div><dl data-configured></dl></section>
        <section class="section live"><div class="eyebrow">Live status</div><div class="status-ok">✓ SDK/editor connected</div><div data-preview-status></div><div data-live-target></div><div class="status-ok">✓ Current page available</div><code data-current-path></code><div data-missing-selector hidden><span>Target selector</span><code></code><button class="secondary-button" type="button" data-pick>Reselect target</button></div></section>
        <p class="hint status-error" role="alert" data-content-error hidden></p>
        <div class="save-recovery" data-save-recovery hidden><button type="button" class="secondary-button" data-retry-save>Retry save</button><button type="button" class="secondary-button" data-reload-draft hidden>Reload latest</button><button type="button" class="secondary-button" data-export-draft>Copy / Export unsaved draft</button><button type="button" class="secondary-button" data-discard-draft>Discard and close</button><span data-recovery-message>Local edits are preserved.</span></div><p class="hint" data-mode-hint></p>
      </main>
    </aside>`;
  }
  stepButtons() {
    var _a, _b;
    const steps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps) ?? [];
    return steps.map((step, index) => `<button class="step" type="button" data-step="${index}" aria-label="Open step ${index + 1}"><span>${index + 1}</span><small>${escapeText("label" in step && typeof step.label === "string" && step.label.trim() ? step.label : "content" in step && step.content.heading.trim() ? step.content.heading : `Step ${index + 1}`)}</small><i data-step-icon>○</i></button>`).join("");
  }
  bindPanel() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
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
    (_j = root.querySelector("[data-global-undo]")) == null ? void 0 : _j.addEventListener("click", () => {
      var _a2, _b2;
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.undo();
      (_b2 = this.contentEditor) == null ? void 0 : _b2.undo();
      this.syncContentInspector();
    });
    (_k = root.querySelector("[data-global-redo]")) == null ? void 0 : _k.addEventListener("click", () => {
      var _a2, _b2;
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.redo();
      (_b2 = this.contentEditor) == null ? void 0 : _b2.redo();
      this.syncContentInspector();
    });
    (_l = root.querySelector("[data-move-side]")) == null ? void 0 : _l.addEventListener("click", () => {
      var _a2;
      return (_a2 = root.querySelector("aside")) == null ? void 0 : _a2.classList.toggle("left-side");
    });
    (_m = root.querySelector("[data-select-step]")) == null ? void 0 : _m.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.selectStep();
    });
    root.querySelectorAll("[data-edge]").forEach((button) => button.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.addEdge(button.dataset.edge);
    }));
    root.querySelectorAll("[data-add-step]").forEach((button) => button.addEventListener("click", () => this.addGuideStep(button.dataset.addStep)));
    (_n = root.querySelector("[data-duplicate-step]")) == null ? void 0 : _n.addEventListener("click", () => this.duplicateGuideStep());
    (_o = root.querySelector("[data-delete-step]")) == null ? void 0 : _o.addEventListener("click", () => this.deleteGuideStep());
    (_p = root.querySelector("[data-step-left]")) == null ? void 0 : _p.addEventListener("click", () => this.moveGuideStep(-1));
    (_q = root.querySelector("[data-step-right]")) == null ? void 0 : _q.addEventListener("click", () => this.moveGuideStep(1));
    (_r = root.querySelector("[data-step-name]")) == null ? void 0 : _r.addEventListener("change", (event) => {
      if (!this.guide) return;
      this.guide.steps[this.stepIndex].label = event.currentTarget.value.trim().slice(0, 80) || void 0;
      this.changed();
      this.refreshStepBar();
    });
    (_s = root.querySelector("[data-edit-component]")) == null ? void 0 : _s.addEventListener("click", () => {
      var _a2, _b2;
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.editSelected();
      (_b2 = this.contentEditor) == null ? void 0 : _b2.editSelected();
    });
    root.querySelectorAll("[data-format]").forEach((button) => button.addEventListener("click", () => {
      var _a2, _b2;
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.formatInline(button.dataset.format);
      (_b2 = this.contentEditor) == null ? void 0 : _b2.formatInline(button.dataset.format);
      this.syncContentInspector();
    }));
    root.querySelectorAll("[data-list]").forEach((button) => button.addEventListener("click", () => {
      var _a2, _b2;
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.toggleList(button.dataset.list);
      (_b2 = this.contentEditor) == null ? void 0 : _b2.toggleList(button.dataset.list);
      this.syncContentInspector();
    }));
    (_t = root.querySelector("[data-text-align]")) == null ? void 0 : _t.addEventListener("change", (event) => {
      var _a2, _b2;
      const value = event.currentTarget.value;
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.setAlignment(value);
      (_b2 = this.contentEditor) == null ? void 0 : _b2.setAlignment(value);
      this.syncContentInspector();
    });
    (_u = root.querySelector("[data-apply-link]")) == null ? void 0 : _u.addEventListener("click", () => {
      var _a2, _b2;
      const input = root.querySelector("[data-link-url]");
      const applied = input ? ((_a2 = this.compositionEditor) == null ? void 0 : _a2.applyLink(input.value)) ?? ((_b2 = this.contentEditor) == null ? void 0 : _b2.applyLink(input.value)) : false;
      if (input && !applied) {
        input.setCustomValidity("Select text in a heading or body and use an HTTP(S), email, phone, relative, or hash URL.");
        input.reportValidity();
      } else input == null ? void 0 : input.setCustomValidity("");
      this.syncContentInspector();
    });
    (_v = root.querySelector("[data-apply-image]")) == null ? void 0 : _v.addEventListener("click", () => {
      var _a2;
      const source = root.querySelector("[data-image-src]");
      const alt = root.querySelector("[data-image-alt]");
      if (source && alt && !((_a2 = this.contentEditor) == null ? void 0 : _a2.updateImage(source.value, alt.value))) source.setCustomValidity("Use an HTTP(S), relative, or supported data image URL.");
      else source == null ? void 0 : source.setCustomValidity("");
      this.syncContentInspector();
    });
    (_w = root.querySelector("[data-undo]")) == null ? void 0 : _w.addEventListener("click", () => {
      var _a2;
      (_a2 = this.contentEditor) == null ? void 0 : _a2.undo();
      this.syncContentInspector();
    });
    (_x = root.querySelector("[data-redo]")) == null ? void 0 : _x.addEventListener("click", () => {
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
    this.bindCompositionInspector();
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
  bindCompositionInspector() {
    var _a, _b, _c, _d;
    const root = this.root;
    const change = (selector, run) => {
      var _a2;
      return (_a2 = root.querySelector(selector)) == null ? void 0 : _a2.addEventListener("change", (event) => run(event.currentTarget.value));
    };
    const number = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    change("[data-cell-direction]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ direction: value });
    });
    change("[data-cell-size]", (value) => {
      var _a2, _b2;
      const cell = (_a2 = this.compositionEditor) == null ? void 0 : _a2.getSelectedCell();
      if (!cell) return;
      (_b2 = this.compositionEditor) == null ? void 0 : _b2.updateCell({ sizing: value === "fixed" ? { mode: "fixed", value: 160 } : value === "hug" ? { mode: "hug" } : { mode: "flexible", weight: 1 } });
    });
    change("[data-cell-fixed]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ sizing: { mode: "fixed", value: Math.max(24, Math.min(1200, number(value, 160))) } });
    });
    change("[data-cell-align]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ align: value });
    });
    change("[data-cell-gap]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ gap: Math.max(0, Math.min(96, number(value, 0))) });
    });
    change("[data-cell-padding]", (value) => {
      var _a2;
      const padding = Math.max(0, Math.min(128, number(value, 0)));
      (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ padding: { top: padding, right: padding, bottom: padding, left: padding } });
    });
    change("[data-cell-background]", (value) => {
      var _a2, _b2;
      const cell = (_a2 = this.compositionEditor) == null ? void 0 : _a2.getSelectedCell();
      (_b2 = this.compositionEditor) == null ? void 0 : _b2.updateCell({ style: { ...cell == null ? void 0 : cell.style, background: value } });
    });
    change("[data-cell-border]", (value) => {
      var _a2, _b2;
      const cell = (_a2 = this.compositionEditor) == null ? void 0 : _a2.getSelectedCell();
      (_b2 = this.compositionEditor) == null ? void 0 : _b2.updateCell({ style: { ...cell == null ? void 0 : cell.style, borderWidth: Math.max(0, Math.min(16, number(value, 0))) } });
    });
    change("[data-cell-radius]", (value) => {
      var _a2, _b2;
      const cell = (_a2 = this.compositionEditor) == null ? void 0 : _a2.getSelectedCell();
      (_b2 = this.compositionEditor) == null ? void 0 : _b2.updateCell({ style: { ...cell == null ? void 0 : cell.style, borderRadius: Math.max(0, Math.min(100, number(value, 0))) } });
    });
    (_a = root.querySelector("[data-cell-stack]")) == null ? void 0 : _a.addEventListener("change", (event) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateCell({ responsiveStack: event.currentTarget.checked });
    });
    change("[data-block-align]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ align: value });
    });
    change("[data-block-font-size]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ fontSize: Math.max(10, Math.min(72, number(value, 15))) });
    });
    change("[data-block-line-height]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ lineHeight: Math.max(0.9, Math.min(3, number(value, 1.5))) });
    });
    change("[data-block-weight]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ weight: number(value, 400) });
    });
    change("[data-block-color]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ color: value });
    });
    change("[data-button-label]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ label: value.trim().slice(0, 80) || "Button" });
    });
    change("[data-button-variant]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ variant: value });
    });
    change("[data-button-width]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ width: value });
    });
    change("[data-button-background]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ background: value });
    });
    change("[data-button-color]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ color: value });
    });
    change("[data-button-padding-x]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ paddingX: Math.max(4, Math.min(48, number(value, 16))) });
    });
    change("[data-button-padding-y]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ paddingY: Math.max(4, Math.min(32, number(value, 9))) });
    });
    change("[data-button-radius]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ radius: Math.max(0, Math.min(48, number(value, 8))) });
    });
    change("[data-button-action]", (value) => {
      var _a2, _b2, _c2;
      if (value === "open_url") (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateButtonAction({ type: "open_url", url: "https://example.com" });
      else if (value === "track_event") (_b2 = this.compositionEditor) == null ? void 0 : _b2.updateButtonAction({ type: "track_event", eventName: "button_clicked" });
      else (_c2 = this.compositionEditor) == null ? void 0 : _c2.updateButtonAction({ type: value });
    });
    change("[data-button-url]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateButtonAction({ type: "open_url", url: value.trim() });
    });
    change("[data-button-event]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateButtonAction({ type: "track_event", eventName: value.trim() });
    });
    change("[data-v2-image-src]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ src: value.trim() });
    });
    change("[data-v2-image-alt]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ alt: value.slice(0, 500) });
    });
    change("[data-image-fit]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ fit: value });
    });
    change("[data-image-width]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ width: Math.max(1, Math.min(100, number(value, 100))) });
    });
    change("[data-image-radius]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ radius: Math.max(0, Math.min(100, number(value, 0))) });
    });
    change("[data-divider-thickness]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ thickness: Math.max(1, Math.min(16, number(value, 1))) });
    });
    change("[data-divider-color]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ color: value });
    });
    change("[data-spacer-size]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ size: Math.max(4, Math.min(240, number(value, 24))) });
    });
    change("[data-icon-name]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ icon: value });
    });
    change("[data-icon-size]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ size: Math.max(12, Math.min(96, number(value, 28))) });
    });
    change("[data-icon-color]", (value) => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.updateBlock({ color: value });
    });
    root.querySelectorAll("[data-v2-format]").forEach((button) => button.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.formatInline(button.dataset.v2Format);
    }));
    root.querySelectorAll("[data-v2-list]").forEach((button) => button.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.toggleList(button.dataset.v2List);
    }));
    (_b = root.querySelector("[data-v2-apply-link]")) == null ? void 0 : _b.addEventListener("click", () => {
      var _a2;
      const input = root.querySelector("[data-v2-link-url]");
      if (input && !((_a2 = this.compositionEditor) == null ? void 0 : _a2.applyLink(input.value))) {
        input.setCustomValidity("Use an HTTP(S), email, phone, relative, or hash URL.");
        input.reportValidity();
      } else input == null ? void 0 : input.setCustomValidity("");
    });
    (_c = root.querySelector("[data-v2-undo]")) == null ? void 0 : _c.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.undo();
    });
    (_d = root.querySelector("[data-v2-redo]")) == null ? void 0 : _d.addEventListener("click", () => {
      var _a2;
      return (_a2 = this.compositionEditor) == null ? void 0 : _a2.redo();
    });
  }
  addGuideStep(pattern) {
    if (!this.guide || !this.flushContent()) return;
    const document2 = createOnsiteDocument(true);
    const builder = { version: 1, projectData: {}, html: "", css: "" };
    const compiled = applyOnsiteDocument(builder, document2, pattern);
    const step = { id: editorId("step"), label: pattern === "modal" ? "Modal step" : "Anchored step", pattern, content: compiled.content, builder, advance: { type: "button" }, behavior: pattern === "modal" ? { dismissible: true } : { placement: "auto", alignment: "center", offset: 8, pointer: { enabled: true, size: 10 }, dismissible: true } };
    this.guide.steps.splice(this.stepIndex + 1, 0, step);
    this.stepIndex++;
    this.changed();
    this.refreshStepBar();
  }
  duplicateGuideStep() {
    if (!this.guide || !this.flushContent()) return;
    const source = this.guide.steps[this.stepIndex];
    const copy = cloneOnsite(source);
    copy.id = editorId("step");
    copy.label = `${source.label || source.content.heading || "Step"} copy`;
    const document2 = onsiteDocumentFromBuilder(copy.builder);
    if (document2 && copy.builder) {
      const next = duplicateDocument(document2);
      const compiled = applyOnsiteDocument(copy.builder, next, getGuideStepPattern(copy));
      copy.content = compiled.content;
    }
    this.guide.steps.splice(this.stepIndex + 1, 0, copy);
    this.stepIndex++;
    this.changed();
    this.refreshStepBar();
  }
  deleteGuideStep() {
    if (!this.guide || this.guide.steps.length <= 1 || !window.confirm("Delete this Guide step?")) return;
    if (!this.flushContent()) return;
    this.guide.steps.splice(this.stepIndex, 1);
    this.stepIndex = Math.min(this.stepIndex, this.guide.steps.length - 1);
    this.changed();
    this.refreshStepBar();
  }
  moveGuideStep(delta) {
    if (!this.guide || !this.flushContent()) return;
    const next = this.stepIndex + delta;
    if (next < 0 || next >= this.guide.steps.length) return;
    const [step] = this.guide.steps.splice(this.stepIndex, 1);
    this.guide.steps.splice(next, 0, step);
    this.stepIndex = next;
    this.changed();
    this.refreshStepBar();
  }
  refreshStepBar() {
    var _a;
    const flow = (_a = this.root) == null ? void 0 : _a.querySelector("[data-step-flow]");
    if (!flow) return;
    flow.innerHTML = this.stepButtons();
    flow.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => this.switchStep(Number(button.dataset.step))));
    this.syncPanel();
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
    var _a, _b, _c, _d;
    const steps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
    if (!steps || index < 0 || index >= steps.length || index === this.stepIndex) return;
    if (!this.flushContent()) return;
    this.selectionGeneration++;
    this.picker.cancel();
    (_c = this.contentEditor) == null ? void 0 : _c.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    (_d = this.compositionEditor) == null ? void 0 : _d.destroy();
    this.compositionEditor = null;
    this.compositionSelection = null;
    if (this.dirty) void this.persist();
    this.stepIndex = index;
    this.updateContinuation();
    this.syncPanel();
    this.applyMode();
  }
  setMode(mode) {
    var _a, _b, _c;
    if (mode === "design" && ((_a = this.draft) == null ? void 0 : _a.experience.builderMode) !== "onsite") return;
    if (this.mode === mode && (mode !== "target" || this.pickerIsSelecting())) return;
    if (!this.flushContent()) return;
    this.selectionGeneration++;
    this.picker.cancel();
    (_b = this.contentEditor) == null ? void 0 : _b.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    (_c = this.compositionEditor) == null ? void 0 : _c.destroy();
    this.compositionEditor = null;
    this.compositionSelection = null;
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
    var _a, _b;
    if (this.contentEditor && !this.contentEditor.flush()) {
      this.setText("[data-save-state]", "Finish composing text before continuing");
      return false;
    }
    const errors = ((_a = this.contentEditor) == null ? void 0 : _a.getValidation()) ?? [];
    if (this.compositionEditor && !this.compositionEditor.flush()) {
      const compositionErrors = this.compositionEditor.getValidation();
      this.showValidation(compositionErrors);
      return false;
    }
    const allErrors = [...errors, ...((_b = this.compositionEditor) == null ? void 0 : _b.getValidation()) ?? []];
    this.showValidation(allErrors);
    return !allErrors.length;
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
    var _a, _b, _c, _d, _e, _f;
    if (!this.definition || !this.dirty && !((_a = this.contentEditor) == null ? void 0 : _a.isComposing()) && !((_b = this.compositionEditor) == null ? void 0 : _b.isComposing())) return;
    const definition = JSON.parse(JSON.stringify(this.definition));
    const snapshot = ((_c = this.compositionEditor) == null ? void 0 : _c.snapshot()) ?? ((_d = this.contentEditor) == null ? void 0 : _d.snapshot());
    if (snapshot) {
      const part = isGuideDefinition(definition) ? definition.steps[this.stepIndex] : definition;
      part.builder = snapshot.builder;
      part.content = snapshot.content;
    }
    this.recoveryDraft = JSON.stringify({ experienceId: (_e = this.draft) == null ? void 0 : _e.experience.id, revision: (_f = this.draft) == null ? void 0 : _f.version.revision, definition }, null, 2);
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    if (this.saveState === "expired") return;
    (_a = this.contentEditor) == null ? void 0 : _a.flush();
    (_b = this.compositionEditor) == null ? void 0 : _b.flush();
    this.captureRecovery();
    this.dirty = this.dirty || !!((_c = this.contentEditor) == null ? void 0 : _c.isComposing()) || !!((_d = this.compositionEditor) == null ? void 0 : _d.isComposing());
    this.saveState = "expired";
    this.lifecycle++;
    clearTimeout(this.saveTimer);
    clearTimeout(this.expiryTimer);
    clearInterval(this.validationTimer);
    (_e = this.contentEditor) == null ? void 0 : _e.destroy();
    this.contentEditor = null;
    (_f = this.compositionEditor) == null ? void 0 : _f.destroy();
    this.compositionEditor = null;
    this.previewGeneration++;
    this.preview.destroy();
    this.previewRendered = false;
    this.picker.cancel();
    (_g = this.mutationObserver) == null ? void 0 : _g.disconnect();
    (_h = this.routeUnsubscribe) == null ? void 0 : _h.call(this);
    this.routeObserver.stop();
    this.bridge = null;
    this.session = null;
    clearEditorContinuation();
    (_i = this.root) == null ? void 0 : _i.querySelectorAll("button,input,select").forEach((control) => {
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
    var _a, _b, _c, _d;
    if (!this.definition || !this.draft || this.mode === "navigate" || this.saveState === "expired") return;
    if (!this.flushContent()) return;
    const generation = ++this.previewGeneration;
    this.previewRendered = false;
    (_a = this.contentEditor) == null ? void 0 : _a.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    (_b = this.compositionEditor) == null ? void 0 : _b.destroy();
    this.compositionEditor = null;
    this.compositionSelection = null;
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
    if (this.mode === "target") {
      if (isGuideDefinition(rendered)) rendered.steps.forEach((step) => {
        step.behavior.backdrop = false;
      });
      else if (this.draft.experience.widgetType === "anchored_card") rendered.behavior.backdrop = false;
    }
    const selectedStepId = (_d = (_c = this.survey) == null ? void 0 : _c.steps[this.stepIndex]) == null ? void 0 : _d.id;
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
      onGuideAdvance: () => {
        if (this.mode === "preview" && this.guide && this.stepIndex < this.guide.steps.length - 1) this.switchStep(this.stepIndex + 1);
      },
      onGuideBack: () => {
        if (this.mode === "preview" && this.guide && this.stepIndex > 0) this.switchStep(this.stepIndex - 1);
      },
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
    var _a, _b, _c;
    if (((_a = this.draft) == null ? void 0 : _a.experience.builderMode) !== "onsite" || this.mode !== "design") return;
    const host = Array.from(document.querySelectorAll("[data-movcues-experience]")).find(
      (element) => element.dataset.movcuesExperience === this.draft.experience.id
    );
    const builder = this.currentBuilder();
    const content = this.currentContent();
    if (!(host == null ? void 0 : host.shadowRoot) || !builder || !content) return;
    (_b = this.contentEditor) == null ? void 0 : _b.destroy();
    (_c = this.compositionEditor) == null ? void 0 : _c.destroy();
    try {
      this.compositionEditor = new OnsiteCompositionEditor(host.shadowRoot, builder, content, this.guide ? getGuideStepPattern(this.guide.steps[this.stepIndex]) : this.draft.experience.widgetType ?? "modal", Boolean(this.guide), {
        onChange: () => {
          this.syncOnsiteAnchoredPointer(host.shadowRoot, builder);
          this.changed(false);
        },
        onValidation: (errors) => this.showValidation(errors),
        onSelectionChange: (selection) => {
          this.compositionSelection = selection;
          this.syncCompositionInspector();
        }
      });
      this.compositionEditor.start();
      this.syncOnsiteAnchoredPointer(host.shadowRoot, builder);
      return;
    } catch (error) {
      this.showValidation([error instanceof Error ? error.message : "This layout could not be converted safely."]);
      this.compositionEditor = null;
    }
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
  syncOnsiteAnchoredPointer(root, builder) {
    var _a, _b;
    const pointer = root.querySelector(".movcues-anchor-pointer");
    if (!pointer) return;
    const color = (_b = (_a = onsiteDocumentFromBuilder(builder)) == null ? void 0 : _a.root.style) == null ? void 0 : _b.background;
    if (color) {
      if (pointer.dataset.movcuesAuthoringPointerColor === void 0) pointer.dataset.movcuesAuthoringPointerColor = pointer.style.color;
      pointer.style.setProperty("color", color, "important");
    } else if (pointer.dataset.movcuesAuthoringPointerColor !== void 0) {
      pointer.style.setProperty("color", pointer.dataset.movcuesAuthoringPointerColor);
      delete pointer.dataset.movcuesAuthoringPointerColor;
    }
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
  syncCompositionInspector() {
    var _a, _b, _c, _d;
    if (!this.root) return;
    const editor = this.compositionEditor;
    const selection = this.compositionSelection;
    const inspector = this.root.querySelector("[data-composition-inspector]");
    if (!inspector) return;
    inspector.hidden = this.mode !== "design" || !editor || !selection;
    this.root.querySelector("[data-content-inspector]").hidden = Boolean(editor) || this.mode !== "design" || !this.componentSelection;
    if (!editor || !selection) return;
    this.setText("[data-composition-label]", selection.label);
    this.root.querySelectorAll("[data-step-only]").forEach((group) => {
      group.hidden = selection.kind !== "step";
    });
    this.root.querySelectorAll("[data-inspector]").forEach((group) => {
      group.hidden = group.dataset.inspector !== selection.kind;
    });
    const step = (_a = this.guide) == null ? void 0 : _a.steps[this.stepIndex];
    this.setValue("[data-step-name]", (step == null ? void 0 : step.label) ?? (step == null ? void 0 : step.content.heading) ?? "");
    const cell = editor.getSelectedCell();
    if (cell) {
      this.setValue("[data-cell-direction]", cell.direction);
      this.setValue("[data-cell-size]", cell.sizing.mode);
      this.setValue("[data-cell-fixed]", String(cell.sizing.mode === "fixed" ? cell.sizing.value : 160));
      this.root.querySelector("[data-fixed-size]").hidden = cell.sizing.mode !== "fixed";
      this.setValue("[data-cell-align]", cell.align);
      this.setValue("[data-cell-gap]", String(cell.gap));
      this.setValue("[data-cell-padding]", String(cell.padding.top));
      this.setValue("[data-cell-background]", ((_b = cell.style) == null ? void 0 : _b.background) && /^#[0-9a-f]{6}$/i.test(cell.style.background) ? cell.style.background : "#ffffff");
      this.setValue("[data-cell-border]", String(((_c = cell.style) == null ? void 0 : _c.borderWidth) ?? 0));
      this.setValue("[data-cell-radius]", String(((_d = cell.style) == null ? void 0 : _d.borderRadius) ?? 0));
      this.setChecked("[data-cell-stack]", Boolean(cell.responsiveStack));
    }
    const block = editor.getSelectedBlock();
    this.root.querySelectorAll("[data-block]").forEach((group) => {
      group.hidden = !block || !group.dataset.block.split(",").includes(block.type);
    });
    if (block) {
      this.setValue("[data-block-align]", block.align ?? "left");
      if (block.type === "heading" || block.type === "text") {
        this.setValue("[data-block-font-size]", String(block.fontSize));
        this.setValue("[data-block-line-height]", String(block.lineHeight ?? (block.type === "heading" ? 1.25 : 1.5)));
        this.setValue("[data-block-weight]", String(block.weight));
        this.setValue("[data-block-color]", block.color && /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : "#111827");
      }
      if (block.type === "button") {
        this.setValue("[data-button-label]", block.label);
        this.setValue("[data-button-variant]", block.variant);
        this.setValue("[data-button-action]", block.action.type);
        this.setValue("[data-button-url]", "url" in block.action ? block.action.url : "");
        this.setValue("[data-button-event]", "eventName" in block.action ? block.action.eventName : "");
        this.setValue("[data-button-background]", block.background && /^#[0-9a-f]{6}$/i.test(block.background) ? block.background : "#2563eb");
        this.setValue("[data-button-color]", block.color && /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : "#ffffff");
        this.setValue("[data-button-width]", block.width);
        this.setValue("[data-button-padding-x]", String(block.paddingX));
        this.setValue("[data-button-padding-y]", String(block.paddingY));
        this.setValue("[data-button-radius]", String(block.radius));
        this.root.querySelector("[data-action-url]").hidden = block.action.type !== "open_url";
        this.root.querySelector("[data-action-event]").hidden = block.action.type !== "track_event";
      }
      if (block.type === "image") {
        this.setValue("[data-v2-image-src]", block.src);
        this.setValue("[data-v2-image-alt]", block.alt);
        this.setValue("[data-image-fit]", block.fit);
        this.setValue("[data-image-width]", String(block.width));
        this.setValue("[data-image-radius]", String(block.radius));
      }
      if (block.type === "divider") {
        this.setValue("[data-divider-thickness]", String(block.thickness));
        this.setValue("[data-divider-color]", block.color);
      }
      if (block.type === "spacer") this.setValue("[data-spacer-size]", String(block.size));
      if (block.type === "icon") {
        this.setValue("[data-icon-name]", block.icon);
        this.setValue("[data-icon-size]", String(block.size));
        this.setValue("[data-icon-color]", block.color ?? "#2563eb");
      }
    }
    const undo = this.root.querySelector("[data-v2-undo]");
    if (undo) undo.disabled = !editor.canUndo();
    const redo = this.root.querySelector("[data-v2-redo]");
    if (redo) redo.disabled = !editor.canRedo();
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
    const activeGroups = new Set(guidePattern === "anchored_card" ? ["target", "anchored", "backdrop"] : !this.guide && widgetType === "anchored_card" ? ["target", "anchored", "backdrop"] : guidePattern === "modal" ? [] : widgetType === "hotspot" ? ["target", "anchored", "hotspot"] : widgetType === "toast" ? ["toast"] : widgetType === "modal" || widgetType === "survey" ? ["modal", "backdrop"] : widgetType === "slideout" ? ["slideout", "backdrop"] : widgetType === "banner" ? ["banner"] : ["cursor"]);
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
    this.syncCompositionInspector();
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
      if (!guideStep) {
        button.remove();
        return;
      }
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
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
    (_g = this.compositionEditor) == null ? void 0 : _g.flush();
    this.previewGeneration++;
    this.preview.destroy();
    (_h = this.contentEditor) == null ? void 0 : _h.destroy();
    this.contentEditor = null;
    this.componentSelection = null;
    (_i = this.compositionEditor) == null ? void 0 : _i.destroy();
    this.compositionEditor = null;
    this.compositionSelection = null;
    this.picker.cancel();
    (_j = this.host) == null ? void 0 : _j.remove();
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
function editorId(prefix) {
  const bytes = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Array.from(bytes).map((value) => value.toString(36)).join("")}`.slice(0, 64);
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
:host{all:initial}*{box-sizing:border-box}aside{position:fixed;right:12px;top:12px;width:min(326px,calc(100vw - 8px));max-height:calc(100dvh - 24px);z-index:2147483647;overflow:hidden;background:#fff;color:#111827;border:1px solid #d7dce3;border-radius:12px;box-shadow:0 18px 50px rgba(15,23,42,.24);font:13px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif}aside.left-side{left:12px;right:auto}header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 12px 10px;border-bottom:1px solid #e5e7eb;cursor:move;user-select:none}.header-copy{display:grid;min-width:0}.header-copy strong{font-size:13px}.header-copy>span{overflow:hidden;color:#4b5563;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.header-copy small{margin-top:3px;color:#6b7280;font-size:11px}.header-copy i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a}.header-actions{display:flex;gap:2px}.header-actions button{width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:#64748b;font:16px/1 inherit;cursor:pointer}.header-actions button:hover{background:#f1f5f9;color:#0f172a}main{max-height:calc(100dvh - 82px);overflow:auto}.minimized{width:min(260px,calc(100vw - 8px))}.minimized main{display:none}.modebar{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px;border-bottom:1px solid #e5e7eb}.modebar button,.secondary-button,.placement-grid button,.formatbar button{border:1px solid #d7dce3;border-radius:7px;background:#fff;color:#334155;font:600 12px inherit;cursor:pointer}.modebar button{min-width:0;padding:7px 3px}.modebar button:disabled{cursor:not-allowed;opacity:.42}.modebar button.active,.placement-grid button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.notice{display:grid;gap:2px;margin:8px 10px 0;padding:8px;border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;color:#1e40af;font-size:11px}.section{display:grid;gap:8px;padding:10px 12px;border-bottom:1px solid #eef0f3}.eyebrow{color:#64748b;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.muted,.hint{color:#64748b;font-size:11px}.hint{margin:0;padding:9px 12px}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.step-navigator{position:fixed;left:50%;bottom:10px;width:min(680px,calc(100vw - 16px));transform:translateX(-50%);z-index:2147483647;border:1px solid #d7dce3;border-radius:10px;background:#fff;box-shadow:0 10px 32px rgba(15,23,42,.18)}.step-flow{display:flex;align-items:stretch;gap:4px;overflow:auto}.step{display:grid;grid-template-columns:auto minmax(54px,1fr) auto;align-items:center;gap:4px;flex:none;max-width:130px;padding:5px 7px;border:0;border-radius:6px;background:transparent;color:#64748b;font:600 11px inherit;cursor:pointer}.step small{overflow:hidden;font:10px/1.2 inherit;text-overflow:ellipsis;white-space:nowrap}.step i{font-style:normal}.step.active{background:#eff6ff;color:#1d4ed8}.step[data-step-status=found]{color:#15803d}.step[data-step-status=missing]{color:#b45309}.step.active{color:#1d4ed8}.reliability{color:#64748b;font-size:11px}.reliability[data-level=reliable]{color:#15803d}.reliability[data-level=fragile]{color:#b45309}.secondary-button{padding:7px 9px}.secondary-button.compact{padding:5px 7px}.content-heading,.history-row,.link-row,.save-recovery{display:flex;align-items:center;justify-content:space-between;gap:6px}.content-heading>div{min-width:0}.formatbar{display:flex;flex-wrap:wrap;gap:4px}.formatbar button{padding:5px 7px}.link-row input{min-width:0}.history-row{justify-content:flex-start;flex-wrap:wrap}.save-recovery{flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid #fee2e2;background:#fff7ed;color:#9a3412;font-size:11px}.placement-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.placement-grid button{padding:6px}.placement-grid button[data-placement=top]{grid-column:2}.placement-grid button[data-placement=left]{grid-column:1}.placement-grid button[data-placement=auto]{grid-column:2}.placement-grid button[data-placement=right]{grid-column:3}.placement-grid button[data-placement=bottom]{grid-column:2}label{display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:8px;color:#475569;font-size:11px}label.check{display:flex}label.check input{width:auto}input,select{min-width:0;width:100%;padding:6px 7px;border:1px solid #d7dce3;border-radius:6px;background:#fff;color:#111827;font:12px inherit}.number{display:grid;grid-template-columns:1fr auto;align-items:center;gap:5px}.number span{color:#64748b;font-size:11px}dl{display:grid;grid-template-columns:82px minmax(0,1fr);gap:5px 8px;margin:0;font-size:11px}dt{color:#64748b}dd{min-width:0;margin:0;overflow-wrap:anywhere;color:#1f2937}.live{font-size:11px}.status-ok{color:#15803d}.status-error{color:#b91c1c}.live code{display:block;overflow:hidden;padding:4px 6px;border-radius:5px;background:#f8fafc;color:#475569;font:11px/1.35 ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap}[data-missing-selector]{display:grid;gap:5px;padding-top:4px;color:#b91c1c}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #2563eb;outline-offset:2px}textarea[data-recovery-export]{box-sizing:border-box;width:100%;height:180px;font:11px monospace}[hidden]{display:none!important}@media(max-width:480px){.step-navigator{position:static;width:auto;transform:none;box-shadow:none}}@media(max-width:420px){aside{right:4px;top:4px;max-height:calc(100dvh - 8px)}aside.left-side{left:4px}main{max-height:calc(100dvh - 66px)}header{padding:9px}.section{padding:8px 10px}.modebar{padding:6px}.modebar button{font-size:10px}}
`;
export {
  EditorModeController
};
//# sourceMappingURL=EditorModeController-Br33mxow.js.map
