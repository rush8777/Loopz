(function() {
  "use strict";
  function isGuideDefinition(value) {
    return "steps" in value;
  }
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
      if (!response.ok) throw new Error("Editor session expired");
      return response.json();
    }
    async save(definition) {
      const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { method: "PATCH", headers: this.headers(), credentials: "omit", body: JSON.stringify({ definition }) });
      if (!response.ok) throw new Error("Draft could not be saved");
    }
  }
  const SENSITIVE_INPUT_TYPES = /* @__PURE__ */ new Set(["password", "email", "tel", "credit-card", "cc-number"]);
  const SENSITIVE_TAGS = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA", "SELECT"]);
  const PRIVATE_ATTRIBUTES = ["data-private", "data-ignore", "data-analytics-ignore"];
  class SensitiveElementDetector {
    isSensitiveFormElement(el) {
      const tag = el.tagName;
      if (!SENSITIVE_TAGS.has(tag)) return false;
      if (tag === "INPUT") {
        const type = (el.getAttribute("type") || "text").toLowerCase();
        if (SENSITIVE_INPUT_TYPES.has(type)) return true;
        if (type === "text" || type === "search" || type === "number") return true;
      }
      return tag === "TEXTAREA" || tag === "SELECT" ? false : tag === "INPUT";
    }
    hasPrivacyMarker(el) {
      return PRIVATE_ATTRIBUTES.some((attr) => el.hasAttribute(attr));
    }
    /** Walk up the tree - if any ancestor (or the element itself) is marked private, the whole subtree is private. */
    isWithinPrivateSubtree(el) {
      let node = el;
      while (node) {
        if (this.hasPrivacyMarker(node)) return true;
        node = node.parentElement;
      }
      return false;
    }
  }
  const MAX_LABEL_LENGTH = 60;
  const OVERRIDE_ATTR = "data-loopz-name";
  const detector = new SensitiveElementDetector();
  function clean(text) {
    if (!text) return void 0;
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return void 0;
    return trimmed.length > MAX_LABEL_LENGTH ? `${trimmed.slice(0, MAX_LABEL_LENGTH - 1)}…` : trimmed;
  }
  function computeElementLabel(el) {
    const override = clean(el.getAttribute(OVERRIDE_ATTR));
    if (override) return override;
    const ariaLabel = clean(el.getAttribute("aria-label"));
    if (ariaLabel) return ariaLabel;
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelText = labelledBy.split(/\s+/).map((id) => {
        var _a;
        return (_a = document.getElementById(id)) == null ? void 0 : _a.textContent;
      }).filter(Boolean).join(" ");
      const cleaned = clean(labelText);
      if (cleaned) return cleaned;
    }
    if (!detector.isWithinPrivateSubtree(el)) {
      const text = clean(el.textContent);
      if (text) return text;
    }
    const alt = clean(el.getAttribute("alt"));
    if (alt) return alt;
    const title = clean(el.getAttribute("title"));
    if (title) return title;
    const placeholder = clean(el.getAttribute("placeholder"));
    if (placeholder) return placeholder;
    return semanticFallback(el);
  }
  function semanticFallback(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    if (tag === "button" || role === "button") {
      return el.getAttribute("type") === "submit" ? "Submit button" : "Button";
    }
    if (tag === "a" || role === "link") return "Link";
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      return `${type.charAt(0).toUpperCase()}${type.slice(1)} field`;
    }
    if (tag === "select") return "Dropdown";
    if (tag === "textarea") return "Text field";
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  }
  function computeElementRole(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "button") return "button";
    if (tag === "a") return "link";
    if (tag === "input") return `input:${(el.getAttribute("type") || "text").toLowerCase()}`;
    if (tag === "select") return "select";
    if (tag === "textarea") return "textarea";
    return void 0;
  }
  const STABLE_DATA_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy", "data-analytics-id"];
  const SEMANTIC_ATTRS = ["role", "aria-label", "name", "type", "href"];
  const DYNAMIC_CLASS_PATTERN = /^(css-|sc-|jsx-|_|[a-z0-9]{6,}$)/i;
  const TAILWIND_UTILITY_PATTERN = /^(-?(m|p)[trblxy]?-|w-|h-|min-|max-|inset-|top-|right-|bottom-|left-|z-|order-|col-|row-|gap-|space-|grid-|flex-\d|flex$|inline-flex$|inline-block$|inline$|block$|hidden$|table|items-|justify-|content-|self-|place-|text-|font-|leading-|tracking-|whitespace-|break-|truncate$|bg-|from-|via-|to-|border|divide-|rounded|shadow|opacity-|blur-|brightness-|contrast-|grayscale|invert|saturate|sepia|backdrop-|transition|duration-|ease-|delay-|animate-|cursor-|select-|resize-|scroll-|snap-|touch-|pointer-events-|will-change-|appearance-|outline-|ring-|overflow-|overscroll-|absolute$|relative$|fixed$|sticky$|static$|visible$|invisible$|float-|clear-|isolate$|object-|aspect-|columns-|underline$|line-through$|no-underline$|uppercase$|lowercase$|capitalize$|normal-case$|italic$|not-italic$|antialiased$)/;
  const TAILWIND_VARIANT_PREFIX_PATTERN = /^(sm|md|lg|xl|2xl|hover|focus|active|disabled|dark|group-hover|focus-visible|first|last|odd|even):/;
  function isTailwindUtilityClass(cls) {
    const unescaped = cls.replace(/\\/g, "");
    return TAILWIND_UTILITY_PATTERN.test(unescaped) || TAILWIND_VARIANT_PREFIX_PATTERN.test(unescaped);
  }
  function isStableClass(cls) {
    if (!cls) return false;
    if (DYNAMIC_CLASS_PATTERN.test(cls)) return false;
    if (/^\d/.test(cls)) return false;
    if (isTailwindUtilityClass(cls)) return false;
    return true;
  }
  const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const NUMERIC_SEGMENT = /^\d+$/;
  const PREFIXED_HEX_ID_SEGMENT = /^[a-z]{1,12}_[0-9a-f]{6,}$/i;
  const BARE_HEX_ID_SEGMENT = /^[0-9a-f]{12,}$/i;
  function canonicalizePathSegment(segment) {
    if (UUID_SEGMENT.test(segment) || NUMERIC_SEGMENT.test(segment) || PREFIXED_HEX_ID_SEGMENT.test(segment) || BARE_HEX_ID_SEGMENT.test(segment)) {
      return ":id";
    }
    return segment;
  }
  const SAFE_FRAGMENT_ID = /^[a-z][a-z0-9_.:-]{0,99}$/i;
  const SAFE_HASH_ROUTE = /^\/[a-z0-9_./:-]{0,199}$/i;
  function canonicalizePath(path) {
    return path.split("/").map((segment) => segment ? canonicalizePathSegment(segment) : segment).join("/");
  }
  function canonicalizeHref(href) {
    if (href.startsWith("#/")) {
      const hashPath = href.slice(1).split("?")[0].split("#")[0];
      return SAFE_HASH_ROUTE.test(hashPath) ? `#${canonicalizePath(hashPath)}` : null;
    }
    if (href.startsWith("#")) {
      const fragment = href.slice(1);
      return SAFE_FRAGMENT_ID.test(fragment) ? `#${fragment}` : null;
    }
    const path = href.split("?")[0].split("#")[0];
    return path ? canonicalizePath(path) : null;
  }
  class SelectorGenerator {
    generate(el) {
      const id = el.getAttribute("id");
      if (id && this.isUniqueId(id)) {
        return `${el.tagName.toLowerCase()}#${cssEscape(id)}`;
      }
      for (const attr of STABLE_DATA_ATTRS) {
        const value = el.getAttribute(attr);
        if (value) {
          return `${el.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
        }
      }
      for (const attr of SEMANTIC_ATTRS) {
        const rawValue = el.getAttribute(attr);
        if (!rawValue) continue;
        const value = attr === "href" ? canonicalizeHref(rawValue) : rawValue;
        if (!value) continue;
        if (value.length < 100) {
          return `${el.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
        }
      }
      const classes = this.getClassList(el).filter(isStableClass);
      if (classes.length > 0) {
        return `${el.tagName.toLowerCase()}.${classes.map(cssEscape).join(".")}`;
      }
      return this.limitedStructuralPath(el);
    }
    describe(el) {
      const classes = this.getClassList(el);
      return {
        tagName: el.tagName.toLowerCase(),
        id: el.getAttribute("id") || void 0,
        classes: classes.length ? classes : void 0,
        selector: this.generate(el),
        label: computeElementLabel(el),
        role: computeElementRole(el)
      };
    }
    getClassList(el) {
      const raw = el.getAttribute("class");
      if (!raw) return [];
      return raw.split(/\s+/).filter(Boolean).slice(0, 5);
    }
    isUniqueId(id) {
      try {
        return document.querySelectorAll(`#${cssEscape(id)}`).length === 1;
      } catch {
        return false;
      }
    }
    limitedStructuralPath(el, maxDepth = 3) {
      const parts = [];
      let node = el;
      let depth = 0;
      while (node && node !== document.body && depth < maxDepth) {
        const tag = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
          const idx = siblings.indexOf(node) + 1;
          parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
        } else {
          parts.unshift(tag);
        }
        node = parent;
        depth++;
      }
      return parts.join(" > ") || el.tagName.toLowerCase();
    }
  }
  function cssEscape(value) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
  class HighlightOverlay {
    constructor() {
      this.element = document.createElement("div");
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
  function reliability(selector) {
    if (/#[a-z][\w:-]*|\[data-(?:testid|test|qa|cy|analytics-id)=/i.test(selector)) return "reliable";
    if (/\[(?:role|aria-label|name|type|href)=|\.[a-z][\w-]*/i.test(selector) && !selector.includes(":nth-of-type")) return "moderate";
    return "fragile";
  }
  class ElementPicker {
    constructor() {
      this.overlay = null;
      this.generator = new SelectorGenerator();
      this.resolve = null;
      this.move = (event) => {
        var _a, _b;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        if (target && !target.closest("[data-loopz-editor]")) (_a = this.overlay) == null ? void 0 : _a.show(target);
        else (_b = this.overlay) == null ? void 0 : _b.hide();
      };
      this.click = (event) => {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        if (!target || target.closest("[data-loopz-editor]")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const descriptor = this.generator.describe(target);
        const selector = descriptor.selector;
        this.finish({ primarySelector: selector, fallbackSelectors: [], label: descriptor.label, role: descriptor.role, tagName: descriptor.tagName, reliability: reliability(selector) });
      };
      this.key = (event) => {
        if (event.key === "Escape") this.finish(null);
      };
    }
    pick() {
      this.cancel();
      this.overlay = new HighlightOverlay();
      document.addEventListener("pointermove", this.move, true);
      document.addEventListener("click", this.click, true);
      document.addEventListener("keydown", this.key, true);
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
      document.removeEventListener("keydown", this.key, true);
      (_a = this.overlay) == null ? void 0 : _a.destroy();
      this.overlay = null;
    }
  }
  const ALLOWED_TAGS = /* @__PURE__ */ new Set(["DIV", "SECTION", "H1", "H2", "H3", "H4", "P", "SPAN", "BUTTON", "IMG", "HR"]);
  const ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "id", "title", "role", "aria-label", "alt", "src", "width", "height", "data-loopz-action-id", "data-loopz-content", "data-loopz-widget-type"]);
  function mountBuilderContent(root, card, builder, callbacks) {
    const html = sanitizeBuilderHtml(builder.html);
    const css = safeBuilderCss(builder.css);
    if (!html || css === null) return false;
    let style = root.querySelector("style[data-loopz-builder-style]");
    if (!style) {
      style = document.createElement("style");
      style.dataset.loopzBuilderStyle = "";
      root.appendChild(style);
    }
    style.textContent = `${css}
${ISOLATION_CSS}`;
    const content = document.createElement("div");
    content.className = "builder-content";
    content.dataset.loopzBuilderSurface = "";
    content.append(...html);
    card.appendChild(content);
    card.classList.add("builder-card");
    card.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-loopz-action-id]") : null;
      if (!target || !card.contains(target)) return;
      if (target.dataset.loopzActionId === "primary") callbacks.onPrimary();
      if (target.dataset.loopzActionId === "secondary") callbacks.onSecondary();
    });
    return true;
  }
  const ISOLATION_CSS = `[data-loopz-builder-surface]{position:relative;overflow:hidden;contain:layout style paint}[data-loopz-builder-surface]>.loopz-widget{position:relative!important;inset:auto!important;width:100%!important;min-width:0!important;max-width:100%!important;max-height:100%!important}`;
  function sanitizeBuilderHtml(input) {
    const template = document.createElement("template");
    template.innerHTML = input;
    for (const element of Array.from(template.content.querySelectorAll("*"))) {
      if (!ALLOWED_TAGS.has(element.tagName)) {
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/i.test(element.tagName)) element.remove();
        else element.replaceWith(...Array.from(element.childNodes));
        continue;
      }
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (!ALLOWED_ATTRIBUTES.has(name) || name.startsWith("on") || /javascript\s*:/i.test(attribute.value)) element.removeAttribute(attribute.name);
      }
      const action = element.getAttribute("data-loopz-action-id");
      if (action && action !== "primary" && action !== "secondary") element.removeAttribute("data-loopz-action-id");
      if (element.tagName === "IMG") {
        const source = element.getAttribute("src") ?? "";
        if (source && !/^(https?:|data:image\/(?:png|gif|jpeg|webp);base64,|\/)/i.test(source)) element.removeAttribute("src");
      }
    }
    const root = template.content.querySelector(".loopz-widget");
    if (!root) return null;
    for (const slot of ["primary", "secondary"]) {
      const actions = Array.from(template.content.querySelectorAll(`[data-loopz-action-id="${slot}"]`));
      actions.slice(1).forEach((action) => action.remove());
    }
    return Array.from(template.content.childNodes);
  }
  function safeBuilderCss(input) {
    const css = input.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (/@import|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding/i.test(css)) return null;
    const rule = /([^{}]+)\{/g;
    let match;
    while ((match = rule.exec(css)) !== null) {
      const prelude = match[1].trim();
      if (!prelude || prelude.startsWith("@")) continue;
      if (prelude.split(",").some((selector) => !selector.trim().includes(".loopz-widget"))) return null;
    }
    return css;
  }
  const WIDGET_SIZE_CONSTRAINTS = {
    anchored_card: { width: { default: 320, min: 240, max: 480 }, height: {}, viewportGutter: 24 },
    toast: { width: { default: 380, min: 280, max: 520 }, height: {}, viewportGutter: 24 },
    cursor_follow: { width: { default: 280, min: 200, max: 360 }, height: {}, viewportGutter: 24 },
    modal: { width: { default: 600, min: 320, max: 960, allowFull: true }, height: { allowFixed: true, allowViewport: true, min: 200, max: 900 }, viewportGutter: 24 },
    slideout: { width: { default: 400, min: 320, max: 640 }, height: { allowFixed: true, allowViewport: true, min: 240, max: 900 }, viewportGutter: 24 },
    hotspot: { width: { default: 300, min: 220, max: 420 }, height: {}, viewportGutter: 24 },
    banner: { width: { default: "full" }, height: {}, viewportGutter: 0 }
  };
  function normalizeWidgetSize(widgetType, design) {
    var _a, _b;
    const constraint = WIDGET_SIZE_CONSTRAINTS[widgetType];
    if (widgetType === "banner") return { width: { mode: "full" }, height: { mode: "auto" } };
    const legacyValue = design.width === "sm" ? constraint.width.min : design.width === "lg" ? constraint.width.max : constraint.width.default;
    const requestedWidth = (_a = design.size) == null ? void 0 : _a.width;
    const width = (requestedWidth == null ? void 0 : requestedWidth.mode) === "full" && constraint.width.allowFull ? { mode: "full" } : { mode: "fixed", value: clamp((requestedWidth == null ? void 0 : requestedWidth.value) ?? legacyValue, constraint.width.min, constraint.width.max) };
    const requestedHeight = (_b = design.size) == null ? void 0 : _b.height;
    const height = (requestedHeight == null ? void 0 : requestedHeight.mode) === "fixed" && constraint.height.allowFixed ? { mode: "fixed", value: clamp(requestedHeight.value ?? constraint.height.min, constraint.height.min, constraint.height.max) } : (requestedHeight == null ? void 0 : requestedHeight.mode) === "viewport" && constraint.height.allowViewport ? { mode: "viewport" } : { mode: "auto" };
    return { width, height };
  }
  function applyWidgetSizeEnvelope(card, widgetType, design) {
    const constraint = WIDGET_SIZE_CONSTRAINTS[widgetType];
    const size = normalizeWidgetSize(widgetType, design);
    const gutter = Math.max(24, constraint.viewportGutter);
    card.dataset.sizeWidth = size.width.mode;
    card.dataset.sizeHeight = size.height.mode;
    if (size.width.mode === "full") {
      card.style.width = widgetType === "banner" ? "100%" : `calc(100vw - ${gutter}px)`;
      card.style.minWidth = "0";
      card.style.maxWidth = "none";
    } else {
      card.style.width = `${size.width.value}px`;
      card.style.minWidth = `min(${constraint.width.min}px, calc(100vw - ${gutter}px))`;
      card.style.maxWidth = `min(${constraint.width.max}px, calc(100vw - ${gutter}px))`;
    }
    card.style.height = size.height.mode === "fixed" ? `${size.height.value}px` : size.height.mode === "viewport" ? `calc(100vh - ${gutter}px)` : "auto";
    card.style.maxHeight = `calc(100vh - ${gutter}px)`;
    card.style.overflowX = "hidden";
    card.style.overflowY = "auto";
  }
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
  }
  function findTarget(target) {
    if (!target) return null;
    for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
      try {
        const element = document.querySelector(selector);
        if (element) return element;
      } catch {
      }
    }
    return null;
  }
  function waitForTarget(target, onFound, onUnavailable, timeoutMs = 5e3) {
    const immediate = findTarget(target);
    if (immediate) {
      onFound(immediate);
      return () => void 0;
    }
    let stopped = false;
    let observer = null;
    let timer = 0;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      observer == null ? void 0 : observer.disconnect();
      clearTimeout(timer);
    };
    const check = () => {
      if (stopped) return;
      const element = findTarget(target);
      if (element) {
        stop();
        onFound(element);
      }
    };
    if (typeof MutationObserver === "undefined" || !document.documentElement) {
      timer = window.setTimeout(() => {
        stop();
        onUnavailable();
      }, timeoutMs);
      return stop;
    }
    observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    timer = window.setTimeout(() => {
      if (!stopped) {
        stop();
        onUnavailable();
      }
    }, timeoutMs);
    return stop;
  }
  function buildCard(root, content, design, behavior, callbacks, builder, widgetType) {
    var _a, _b, _c;
    const card = document.createElement("section");
    card.className = "card";
    card.style.setProperty("--loopz-bg", design.theme.background);
    card.style.setProperty("--loopz-fg", design.theme.foreground);
    card.style.setProperty("--loopz-primary", design.theme.primary);
    card.dataset.width = design.width;
    card.dataset.radius = design.theme.borderRadius;
    if (widgetType) applyWidgetSizeEnvelope(card, widgetType, design);
    const close = behavior.dismissible ? `<button class="close" data-dismiss aria-label="Dismiss">×</button>` : "";
    card.innerHTML = close;
    (_a = card.querySelector("[data-dismiss]")) == null ? void 0 : _a.addEventListener("click", callbacks.onDismiss);
    if (!builder || !mountBuilderContent(root, card, builder, callbacks)) {
      const primary = content.primaryAction ? `<button class="primary" data-primary>${escapeText$1(content.primaryAction.label)}</button>` : "";
      const secondary = content.secondaryAction ? `<button class="secondary" data-secondary>${escapeText$1(content.secondaryAction.label)}</button>` : "";
      card.insertAdjacentHTML("beforeend", `<div class="legacy-content"><h2>${escapeText$1(content.heading)}</h2><p>${escapeText$1(content.body)}</p><footer>${secondary}${primary}</footer></div>`);
      (_b = card.querySelector("[data-primary]")) == null ? void 0 : _b.addEventListener("click", callbacks.onPrimary);
      (_c = card.querySelector("[data-secondary]")) == null ? void 0 : _c.addEventListener("click", callbacks.onSecondary);
    }
    root.appendChild(card);
    return card;
  }
  class AnchoredCardRenderer {
    constructor() {
      this.cleanup = [];
    }
    render(root, target, content, design, behavior, callbacks, builder, widgetType) {
      const card = buildCard(root, content, design, behavior, callbacks, builder, widgetType);
      const update = () => position(card, target.getBoundingClientRect(), behavior);
      const onWindow = () => requestAnimationFrame(update);
      window.addEventListener("scroll", onWindow, true);
      window.addEventListener("resize", onWindow);
      this.cleanup.push(() => window.removeEventListener("scroll", onWindow, true), () => window.removeEventListener("resize", onWindow));
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(update);
        observer.observe(target);
        observer.observe(card);
        this.cleanup.push(() => observer.disconnect());
      }
      if (typeof MutationObserver !== "undefined") {
        const observer = new MutationObserver(onWindow);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        this.cleanup.push(() => observer.disconnect());
      }
      update();
      return card;
    }
    destroy() {
      this.cleanup.splice(0).forEach((fn) => fn());
    }
  }
  function position(card, rect, behavior) {
    const gap = behavior.offset ?? 8;
    const bounds = card.getBoundingClientRect();
    const margin = 8;
    let placement = behavior.placement === "auto" || !behavior.placement ? "bottom" : behavior.placement;
    if (placement === "bottom" && rect.bottom + gap + bounds.height > innerHeight) placement = "top";
    if (placement === "top" && rect.top - gap - bounds.height < 0) placement = "bottom";
    let left = rect.left + (rect.width - bounds.width) / 2;
    let top = rect.bottom + gap;
    if (placement === "top") top = rect.top - bounds.height - gap;
    if (placement === "left") {
      left = rect.left - bounds.width - gap;
      top = rect.top + (rect.height - bounds.height) / 2;
    }
    if (placement === "right") {
      left = rect.right + gap;
      top = rect.top + (rect.height - bounds.height) / 2;
    }
    if (behavior.alignment === "start" && (placement === "top" || placement === "bottom")) left = rect.left;
    if (behavior.alignment === "end" && (placement === "top" || placement === "bottom")) left = rect.right - bounds.width;
    card.style.left = `${Math.max(margin, Math.min(left, innerWidth - bounds.width - margin))}px`;
    card.style.top = `${Math.max(margin, Math.min(top, innerHeight - bounds.height - margin))}px`;
  }
  function escapeText$1(value) {
    const span = document.createElement("span");
    span.textContent = value;
    return span.innerHTML;
  }
  class ToastRenderer {
    constructor() {
      this.timer = null;
    }
    render(root, content, design, behavior, callbacks, builder) {
      const card = buildCard(root, content, design, behavior, callbacks, builder, "toast");
      card.classList.add("toast");
      card.dataset.position = behavior.toastPosition ?? "bottom-right";
      if (behavior.autoDismissMs) this.timer = window.setTimeout(callbacks.onDismiss, behavior.autoDismissMs);
      return card;
    }
    destroy() {
      if (this.timer !== null) clearTimeout(this.timer);
    }
  }
  class CursorFollowRenderer {
    constructor() {
      this.cleanup = null;
    }
    render(root, content, design, behavior, callbacks, builder) {
      const card = buildCard(root, content, design, behavior, callbacks, builder, "cursor_follow");
      card.classList.add("cursor");
      let frame = 0;
      let x = innerWidth / 2;
      let y = innerHeight / 2;
      const offset = behavior.cursorOffset ?? { x: 16, y: 16 };
      const update = () => {
        frame = 0;
        const rect = card.getBoundingClientRect();
        card.style.left = `${Math.max(8, Math.min(x + offset.x, innerWidth - rect.width - 8))}px`;
        card.style.top = `${Math.max(8, Math.min(y + offset.y, innerHeight - rect.height - 8))}px`;
      };
      const move = (event) => {
        x = event.clientX;
        y = event.clientY;
        if (!frame) frame = requestAnimationFrame(update);
      };
      window.addEventListener("pointermove", move, { passive: true });
      this.cleanup = () => {
        window.removeEventListener("pointermove", move);
        if (frame) cancelAnimationFrame(frame);
      };
      update();
      return card;
    }
    destroy() {
      var _a;
      (_a = this.cleanup) == null ? void 0 : _a.call(this);
      this.cleanup = null;
    }
  }
  class ModalRenderer {
    render(root, content, design, behavior, callbacks, builder) {
      if (behavior.backdrop !== false) {
        const backdrop = document.createElement("div");
        backdrop.className = "backdrop";
        backdrop.style.setProperty("--loopz-backdrop-opacity", String(behavior.backdropOpacity ?? 0.45));
        if (behavior.closeOnBackdrop && behavior.dismissible) backdrop.addEventListener("click", callbacks.onDismiss);
        root.appendChild(backdrop);
      }
      const card = buildCard(root, content, design, behavior, callbacks, builder, "modal");
      card.classList.add("modal");
      card.dataset.layout = behavior.modalLayout ?? "center";
      return card;
    }
    destroy() {
    }
  }
  class SlideoutRenderer {
    render(root, content, design, behavior, callbacks, builder) {
      if (behavior.backdrop) {
        const backdrop = document.createElement("div");
        backdrop.className = "backdrop";
        backdrop.style.setProperty("--loopz-backdrop-opacity", String(behavior.backdropOpacity ?? 0.35));
        if (behavior.closeOnBackdrop && behavior.dismissible) backdrop.addEventListener("click", callbacks.onDismiss);
        root.appendChild(backdrop);
      }
      const card = buildCard(root, content, design, behavior, callbacks, builder, "slideout");
      card.classList.add("slideout");
      card.dataset.position = behavior.slideoutPosition ?? "bottom-right";
      return card;
    }
    destroy() {
    }
  }
  class HotspotRenderer {
    constructor() {
      this.cleanup = [];
      this.cardRenderer = null;
      this.card = null;
    }
    render(root, target, content, design, behavior, callbacks, builder) {
      const beacon = document.createElement("button");
      beacon.className = "hotspot";
      beacon.dataset.style = behavior.hotspotStyle ?? "pulse";
      beacon.style.setProperty("--loopz-hotspot", behavior.hotspotColor ?? design.theme.primary);
      beacon.type = "button";
      beacon.setAttribute("aria-label", `Open ${content.heading}`);
      if (beacon.dataset.style === "question") beacon.textContent = "?";
      root.appendChild(beacon);
      const update = () => {
        const rect = target.getBoundingClientRect();
        beacon.style.left = `${Math.max(4, Math.min(rect.right - 7, innerWidth - 18))}px`;
        beacon.style.top = `${Math.max(4, Math.min(rect.top - 7, innerHeight - 18))}px`;
      };
      const schedule = () => requestAnimationFrame(update);
      const toggle = () => {
        var _a;
        if (this.card) {
          this.card.remove();
          this.card = null;
          (_a = this.cardRenderer) == null ? void 0 : _a.destroy();
          this.cardRenderer = null;
          return;
        }
        this.cardRenderer = new AnchoredCardRenderer();
        this.card = this.cardRenderer.render(root, target, content, design, behavior, callbacks, builder, "hotspot");
      };
      beacon.addEventListener("click", toggle);
      window.addEventListener("scroll", schedule, true);
      window.addEventListener("resize", schedule);
      this.cleanup.push(() => beacon.removeEventListener("click", toggle), () => window.removeEventListener("scroll", schedule, true), () => window.removeEventListener("resize", schedule));
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(schedule);
        observer.observe(target);
        this.cleanup.push(() => observer.disconnect());
      }
      update();
      return beacon;
    }
    destroy() {
      var _a;
      (_a = this.cardRenderer) == null ? void 0 : _a.destroy();
      this.cardRenderer = null;
      this.card = null;
      this.cleanup.splice(0).forEach((fn) => fn());
    }
  }
  class BannerRenderer {
    render(root, content, design, behavior, callbacks, builder) {
      const card = buildCard(root, content, design, behavior, callbacks, builder, "banner");
      card.classList.add("banner");
      card.dataset.position = behavior.bannerPosition ?? "top";
      return card;
    }
    destroy() {
    }
  }
  class ExperienceRenderer {
    constructor() {
      this.host = null;
      this.renderer = null;
      this.cancelPendingTarget = null;
      this.step = 0;
    }
    render(experience, callbacks) {
      this.destroy();
      this.step = 0;
      if (isGuideDefinition(experience.definition)) return this.renderGuide(experience, experience.definition, callbacks);
      return this.renderWidget(experience, experience.definition, callbacks);
    }
    root(experienceId) {
      this.host = document.createElement("div");
      this.host.dataset.loopzExperience = experienceId;
      this.host.dataset.loopzExperienceRoot = experienceId;
      this.host.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:none";
      const root = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLES;
      root.appendChild(style);
      document.documentElement.appendChild(this.host);
      return root;
    }
    renderWidget(experience, definition, callbacks) {
      if (experience.widgetType === "anchored_card" || experience.widgetType === "hotspot") {
        const mount = (target2) => {
          const root = this.root(experience.id);
          const renderer = experience.widgetType === "hotspot" ? new HotspotRenderer() : new AnchoredCardRenderer();
          this.renderer = renderer;
          renderer.render(root, target2, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder, experience.widgetType ?? "anchored_card");
          requestAnimationFrame(callbacks.onVisible);
        };
        const target = findTarget(definition.target);
        if (target) mount(target);
        else this.cancelPendingTarget = waitForTarget(definition.target, (element) => {
          this.cancelPendingTarget = null;
          mount(element);
        }, () => {
          var _a;
          this.cancelPendingTarget = null;
          (_a = callbacks.onUnavailable) == null ? void 0 : _a.call(callbacks);
        });
      } else if (experience.widgetType === "toast") {
        const root = this.root(experience.id);
        const renderer = new ToastRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
      } else if (experience.widgetType === "cursor_follow") {
        const root = this.root(experience.id);
        const renderer = new CursorFollowRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
      } else if (experience.widgetType === "modal") {
        const root = this.root(experience.id);
        const renderer = new ModalRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
      } else if (experience.widgetType === "slideout") {
        const root = this.root(experience.id);
        const renderer = new SlideoutRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
      } else if (experience.widgetType === "banner") {
        const root = this.root(experience.id);
        const renderer = new BannerRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
      } else return false;
      if (experience.widgetType !== "anchored_card" && experience.widgetType !== "hotspot") requestAnimationFrame(callbacks.onVisible);
      return true;
    }
    renderGuide(experience, definition, callbacks) {
      const step = definition.steps[this.step];
      if (!step) return false;
      const mount = (target2) => {
        var _a;
        const root = this.root(experience.id);
        const renderer = new AnchoredCardRenderer();
        this.renderer = renderer;
        const behavior = { dismissible: step.behavior.dismissible ?? true, placement: step.behavior.placement, alignment: step.behavior.alignment, offset: step.behavior.offset };
        const card = renderer.render(root, target2, step.content, definition.design, behavior, {
          onDismiss: () => {
            callbacks.onDismiss();
            this.destroy();
          },
          onSecondary: () => {
            callbacks.onDismiss();
            this.destroy();
          },
          onPrimary: () => {
            const action = step.content.primaryAction;
            if (action) callbacks.onAction(action);
            if (this.step < definition.steps.length - 1) {
              this.clearSurface();
              this.step++;
              this.renderGuide(experience, definition, callbacks);
            } else {
              callbacks.onComplete();
              this.destroy();
            }
          }
        });
        if (this.step > 0) {
          const back = document.createElement("button");
          back.className = "secondary";
          back.textContent = "Back";
          back.addEventListener("click", () => {
            this.clearSurface();
            this.step--;
            this.renderGuide(experience, definition, callbacks);
          });
          (_a = card.querySelector("footer")) == null ? void 0 : _a.prepend(back);
        }
        requestAnimationFrame(callbacks.onVisible);
      };
      const target = findTarget(step.target);
      if (target) mount(target);
      else this.cancelPendingTarget = waitForTarget(step.target, (element) => {
        this.cancelPendingTarget = null;
        mount(element);
      }, () => {
        var _a;
        this.cancelPendingTarget = null;
        (_a = callbacks.onUnavailable) == null ? void 0 : _a.call(callbacks);
      });
      return true;
    }
    callbacks(content, callbacks) {
      return {
        onDismiss: () => {
          callbacks.onDismiss();
          this.destroy();
        },
        onSecondary: () => {
          callbacks.onDismiss();
          this.destroy();
        },
        onPrimary: () => {
          var _a;
          if (content.primaryAction) callbacks.onAction(content.primaryAction);
          if (((_a = content.primaryAction) == null ? void 0 : _a.type) === "dismiss") {
            callbacks.onDismiss();
            this.destroy();
          }
        }
      };
    }
    clearSurface() {
      var _a, _b, _c;
      (_a = this.cancelPendingTarget) == null ? void 0 : _a.call(this);
      this.cancelPendingTarget = null;
      (_b = this.renderer) == null ? void 0 : _b.destroy();
      this.renderer = null;
      (_c = this.host) == null ? void 0 : _c.remove();
      this.host = null;
    }
    destroy() {
      this.clearSurface();
      this.step = 0;
    }
  }
  const STYLES = `
  :host{all:initial}.card{pointer-events:auto;position:fixed;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);padding:18px;background:var(--loopz-bg);color:var(--loopz-fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.12)}
  .card[data-width=sm]{width:260px}.card[data-width=lg]{width:400px}.card[data-radius=sm]{border-radius:6px}.card[data-radius=md]{border-radius:12px}.card[data-radius=lg]{border-radius:20px}
  .builder-card{padding:0;background:transparent;border:0;box-shadow:none}.builder-content{box-sizing:border-box;width:100%;height:100%;max-width:100%}.builder-content>.loopz-widget{box-sizing:border-box;width:100%!important;min-width:0!important;max-width:100%!important;max-height:100%!important}.builder-card>.close{z-index:2}
  h2{font:600 17px/1.3 ui-sans-serif,system-ui,sans-serif;margin:0 24px 7px 0}p{margin:0;white-space:pre-wrap}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{border:0;border-radius:7px;padding:8px 12px;font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer}.primary{background:var(--loopz-primary);color:#fff}.secondary{background:transparent;color:inherit}.close{position:absolute;right:8px;top:7px;padding:3px 7px;background:transparent;color:inherit;font-size:20px}
  .toast{position:fixed!important}.toast[data-position=top-left]{top:16px;left:16px}.toast[data-position=top-right]{top:16px;right:16px}.toast[data-position=bottom-left]{bottom:16px;left:16px}.toast[data-position=bottom-right]{bottom:16px;right:16px}.cursor{will-change:left,top}@media(prefers-reduced-motion:reduce){.card{transition:none!important}}
  .backdrop{pointer-events:auto;position:fixed;inset:0;background:rgba(0,0,0,var(--loopz-backdrop-opacity,.45))}
  .modal{left:50%;top:50%;transform:translate(-50%,-50%)}.modal[data-layout=fullscreen],.modal[data-size-width=full]{inset:12px;width:auto!important;max-width:none!important;transform:none;display:flex;flex-direction:column;justify-content:center}.modal[data-layout=fullscreen] footer,.modal[data-size-width=full] footer{justify-content:center}
  .slideout[data-position=top-left]{top:16px;left:16px}.slideout[data-position=top-right]{top:16px;right:16px}.slideout[data-position=bottom-left]{bottom:16px;left:16px}.slideout[data-position=bottom-right]{bottom:16px;right:16px}.slideout[data-position=center-left]{left:16px;top:50%;transform:translateY(-50%)}.slideout[data-position=center-right]{right:16px;top:50%;transform:translateY(-50%)}
  .banner{left:0;right:0;width:auto!important;max-width:none;border-radius:0!important;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:center}.banner[data-position=top]{top:0}.banner[data-position=bottom]{bottom:0}.banner h2,.banner p{grid-column:1}.banner footer{grid-column:2;grid-row:1/span 2;margin:0;padding-right:24px}
  .hotspot{pointer-events:auto;position:fixed;width:18px;height:18px;padding:0;border:3px solid #fff;border-radius:50%;background:var(--loopz-hotspot);box-shadow:0 1px 5px rgba(0,0,0,.35);color:#fff;font:700 12px/12px ui-sans-serif,system-ui,sans-serif}.hotspot[data-style=pulse]::after{content:"";position:absolute;inset:-7px;border:2px solid var(--loopz-hotspot);border-radius:50%;animation:loopz-pulse 1.8s ease-out infinite}.hotspot[data-style=dot]{width:14px;height:14px}.hotspot[data-style=question]{width:22px;height:22px}@keyframes loopz-pulse{0%{transform:scale(.65);opacity:.85}100%{transform:scale(1.45);opacity:0}}@media(prefers-reduced-motion:reduce){.hotspot::after{animation:none}}
`;
  class EditorModeController {
    constructor(apiBase) {
      this.apiBase = apiBase;
      this.host = null;
      this.picker = new ElementPicker();
      this.expiryTimer = 0;
      this.validationTimer = 0;
      this.preview = new ExperienceRenderer();
    }
    async start(rawToken) {
      try {
        const response = await fetch(`${this.apiBase}/public/experience-editor/exchange`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ token: rawToken }) });
        if (!response.ok) return false;
        const session = await response.json();
        const clean2 = new URL(location.href);
        const requestedStep = Number(clean2.searchParams.get("loopz_editor_step") ?? "0");
        clean2.searchParams.delete("loopz_editor_token");
        clean2.searchParams.delete("loopz_editor_step");
        history.replaceState(history.state, "", clean2.toString());
        const bridge = new EditorBridge(this.apiBase, session.sessionId, session.accessToken);
        this.mount(await bridge.load(), bridge, requestedStep);
        this.expiryTimer = window.setTimeout(() => this.destroy(), Math.max(0, new Date(session.expiresAt).getTime() - Date.now()));
        return true;
      } catch {
        this.destroy();
        return false;
      }
    }
    mount(draft, bridge, requestedStep = 0) {
      var _a, _b, _c;
      this.host = document.createElement("div");
      this.host.dataset.loopzEditor = "";
      const root = this.host.attachShadow({ mode: "open" });
      const definition = draft.version.definition;
      const guide = isGuideDefinition(definition) ? definition : null;
      let stepIndex = guide ? Math.max(0, Math.min(requestedStep, guide.steps.length - 1)) : 0;
      const stepTabs = guide ? `<div class="steps"><b data-step-label>Editing step 1 of ${guide.steps.length}</b><div>${guide.steps.map((_, index) => `<button data-step="${index}" class="${index === 0 ? "active" : ""}">Step ${index + 1}</button>`).join("")}</div></div>` : "";
      root.innerHTML = `<style>${STYLE}</style><aside><header><b>Loopz visual editor</b><small>${escapeText(draft.experience.name)}</small></header><nav>${["Content", "Design", "Behavior", "Targeting", "Publish"].map((x, i) => `<button data-tab="${i}" class="${i === 0 ? "active" : ""}">${x}</button>`).join("")}</nav><main>${stepTabs}<section data-panel="0"><label>Heading<input data-heading></label><label>Body<textarea data-body></textarea></label></section><section data-panel="1" hidden><label>Width<select data-width><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label><label>Background<input data-background type="color"></label><label>Text color<input data-foreground type="color"></label><label>Primary color<input data-primary type="color"></label></section><section data-panel="2" hidden><div data-for="anchored"><label>Placement<select data-placement><option value="auto">Auto</option><option value="top">Top</option><option value="right">Right</option><option value="bottom">Bottom</option><option value="left">Left</option></select></label><label>Offset<input data-offset type="number" min="0" max="100"></label></div><div data-for="toast"><label>Toast position<select data-toast-position><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label><label>Auto-dismiss ms<input data-auto-dismiss type="number" min="500" placeholder="Disabled"></label></div><div data-for="cursor"><label>Horizontal offset<input data-cursor-x type="number"></label><label>Vertical offset<input data-cursor-y type="number"></label></div><div data-for="modal"><label>Layout<select data-modal-layout><option value="center">Centered</option><option value="fullscreen">Fullscreen</option></select></label></div><div data-for="slideout"><label>Edge position<select data-slideout-position><option value="top-left">Top left</option><option value="top-right">Top right</option><option value="center-left">Center left</option><option value="center-right">Center right</option><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option></select></label></div><div data-for="overlay"><label class="row"><input data-backdrop type="checkbox"> Backdrop</label><label>Backdrop opacity<input data-backdrop-opacity type="number" min="0" max="0.9" step="0.05"></label><label class="row"><input data-close-backdrop type="checkbox"> Dismiss on backdrop click</label></div><div data-for="hotspot"><label>Beacon style<select data-hotspot-style><option value="pulse">Pulse</option><option value="dot">Dot</option><option value="question">Question mark</option></select></label><label>Beacon color<input data-hotspot-color type="color"></label></div><label class="row"><input data-dismissible type="checkbox"> Dismissible</label><div data-for="target"><button data-pick>Reselect target</button><p data-reliability></p></div></section><section data-panel="3" hidden><label>Frequency<select data-frequency><option value="once">Once ever</option><option value="once_per_session">Once per session</option><option value="every_time">Every qualifying time</option></select></label><label>Priority<input data-priority type="number" min="-1000" max="1000"></label><p>Saved Page, Segment, and event targeting are configured securely in the Loopz dashboard.</p></section><section data-panel="4" hidden><p>Preview is live on this page. Save the draft here, then return to Loopz to publish or pause it.</p><button data-save>Save draft</button></section><p data-status>Draft autosaves as you edit.</p></main></aside>`;
      (_a = root.querySelector('[data-for="overlay"]')) == null ? void 0 : _a.insertAdjacentHTML("beforebegin", '<div data-for="banner"><label>Banner position<select data-banner-position><option value="top">Top</option><option value="bottom">Bottom</option></select></label></div>');
      document.documentElement.appendChild(this.host);
      const currentContent = () => guide ? guide.steps[stepIndex].content : definition.content;
      const currentBehavior = () => guide ? guide.steps[stepIndex].behavior : definition.behavior;
      const heading = root.querySelector("[data-heading]");
      const body = root.querySelector("[data-body]");
      const placement = root.querySelector("[data-placement]");
      const offset = root.querySelector("[data-offset]");
      const dismissible = root.querySelector("[data-dismissible]");
      const status = root.querySelector("[data-status]");
      const widgetType = draft.experience.widgetType;
      const activeGroups = new Set(guide || widgetType === "anchored_card" ? ["anchored", "target"] : widgetType === "hotspot" ? ["anchored", "hotspot", "target"] : widgetType === "modal" ? ["modal", "overlay"] : widgetType === "slideout" ? ["slideout", "overlay"] : widgetType === "banner" ? ["banner"] : widgetType === "toast" ? ["toast"] : ["cursor"]);
      root.querySelectorAll("[data-for]").forEach((group) => {
        group.hidden = !activeGroups.has(group.dataset.for);
      });
      const field = (selector) => root.querySelector(selector);
      const bannerPosition = field("[data-banner-position]");
      bannerPosition.value = currentBehavior().bannerPosition ?? "top";
      const syncStep = () => {
        var _a2, _b2, _c2;
        const content = currentContent(), behavior = currentBehavior();
        heading.value = content.heading;
        body.value = content.body;
        placement.value = behavior.placement ?? "auto";
        offset.value = String(behavior.offset ?? 8);
        dismissible.checked = behavior.dismissible ?? true;
        field("[data-toast-position]").value = behavior.toastPosition ?? "bottom-right";
        field("[data-auto-dismiss]").value = behavior.autoDismissMs ? String(behavior.autoDismissMs) : "";
        field("[data-cursor-x]").value = String(((_a2 = behavior.cursorOffset) == null ? void 0 : _a2.x) ?? 16);
        field("[data-cursor-y]").value = String(((_b2 = behavior.cursorOffset) == null ? void 0 : _b2.y) ?? 16);
        field("[data-modal-layout]").value = behavior.modalLayout ?? "center";
        field("[data-slideout-position]").value = behavior.slideoutPosition ?? "bottom-right";
        field("[data-backdrop]").checked = behavior.backdrop ?? widgetType === "modal";
        field("[data-backdrop-opacity]").value = String(behavior.backdropOpacity ?? (widgetType === "modal" ? 0.45 : 0.35));
        field("[data-close-backdrop]").checked = behavior.closeOnBackdrop ?? false;
        field("[data-hotspot-style]").value = behavior.hotspotStyle ?? "pulse";
        field("[data-hotspot-color]").value = behavior.hotspotColor ?? definition.design.theme.primary;
        (_c2 = root.querySelector("[data-step-label]")) == null ? void 0 : _c2.replaceChildren(`Editing step ${stepIndex + 1} of ${(guide == null ? void 0 : guide.steps.length) ?? 1}`);
        root.querySelectorAll("[data-step]").forEach((button) => button.classList.toggle("active", Number(button.dataset.step) === stepIndex));
      };
      let saveTimer = 0;
      const renderPreview = () => {
        const previewDefinition = guide ? { ...definition, steps: [guide.steps[stepIndex]] } : definition;
        return this.preview.render({ id: draft.experience.id, versionId: draft.version.id, kind: draft.experience.kind, widgetType: draft.experience.widgetType, priority: 0, definition: previewDefinition }, { onVisible: () => void 0, onDismiss: () => window.setTimeout(renderPreview, 0), onAction: () => void 0, onComplete: () => window.setTimeout(renderPreview, 0) });
      };
      const persist = async () => {
        status.textContent = "Saving…";
        try {
          await bridge.save(definition);
          status.textContent = "Draft saved.";
        } catch {
          status.textContent = "Editor session expired or was revoked.";
          this.destroy();
        }
      };
      const save = () => {
        renderPreview();
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(persist, 350);
      };
      syncStep();
      heading.addEventListener("input", () => {
        currentContent().heading = heading.value;
        save();
      });
      body.addEventListener("input", () => {
        currentContent().body = body.value;
        save();
      });
      placement.addEventListener("change", () => {
        currentBehavior().placement = placement.value;
        save();
      });
      offset.addEventListener("input", () => {
        currentBehavior().offset = Number(offset.value);
        save();
      });
      dismissible.addEventListener("change", () => {
        currentBehavior().dismissible = dismissible.checked;
        save();
      });
      field("[data-toast-position]").addEventListener("change", (event) => {
        currentBehavior().toastPosition = event.currentTarget.value;
        save();
      });
      field("[data-auto-dismiss]").addEventListener("input", (event) => {
        const value = event.currentTarget.value;
        currentBehavior().autoDismissMs = value ? Number(value) : null;
        save();
      });
      field("[data-cursor-x]").addEventListener("input", (event) => {
        var _a2;
        currentBehavior().cursorOffset = { x: Number(event.currentTarget.value), y: ((_a2 = currentBehavior().cursorOffset) == null ? void 0 : _a2.y) ?? 16 };
        save();
      });
      field("[data-cursor-y]").addEventListener("input", (event) => {
        var _a2;
        currentBehavior().cursorOffset = { x: ((_a2 = currentBehavior().cursorOffset) == null ? void 0 : _a2.x) ?? 16, y: Number(event.currentTarget.value) };
        save();
      });
      field("[data-modal-layout]").addEventListener("change", (event) => {
        currentBehavior().modalLayout = event.currentTarget.value;
        save();
      });
      field("[data-slideout-position]").addEventListener("change", (event) => {
        currentBehavior().slideoutPosition = event.currentTarget.value;
        save();
      });
      field("[data-backdrop]").addEventListener("change", (event) => {
        currentBehavior().backdrop = event.currentTarget.checked;
        save();
      });
      field("[data-backdrop-opacity]").addEventListener("input", (event) => {
        currentBehavior().backdropOpacity = Number(event.currentTarget.value);
        save();
      });
      field("[data-close-backdrop]").addEventListener("change", (event) => {
        currentBehavior().closeOnBackdrop = event.currentTarget.checked;
        save();
      });
      field("[data-hotspot-style]").addEventListener("change", (event) => {
        currentBehavior().hotspotStyle = event.currentTarget.value;
        save();
      });
      field("[data-hotspot-color]").addEventListener("input", (event) => {
        currentBehavior().hotspotColor = event.currentTarget.value;
        save();
      });
      bannerPosition.addEventListener("change", () => {
        currentBehavior().bannerPosition = bannerPosition.value;
        save();
      });
      const width = root.querySelector("[data-width]");
      width.value = definition.design.width;
      width.addEventListener("change", () => {
        definition.design.width = width.value;
        save();
      });
      for (const key of ["background", "foreground", "primary"]) {
        const input = root.querySelector(`[data-${key}]`);
        input.value = definition.design.theme[key];
        input.addEventListener("input", () => {
          definition.design.theme[key] = input.value;
          save();
        });
      }
      const targeting = definition.targeting;
      const frequency = root.querySelector("[data-frequency]");
      frequency.value = targeting.frequency.mode;
      frequency.addEventListener("change", () => {
        targeting.frequency.mode = frequency.value;
        save();
      });
      const priority = root.querySelector("[data-priority]");
      priority.value = String(targeting.priority);
      priority.addEventListener("input", () => {
        targeting.priority = Number(priority.value);
        save();
      });
      root.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => {
        stepIndex = Number(button.dataset.step);
        syncStep();
        renderPreview();
      }));
      (_b = root.querySelector("[data-pick]")) == null ? void 0 : _b.addEventListener("click", async () => {
        status.textContent = `Click the element step ${stepIndex + 1} should attach to.`;
        const target = await this.picker.pick();
        if (!target) {
          status.textContent = "Selection cancelled.";
          return;
        }
        this.setTarget(definition, target, stepIndex);
        root.querySelector("[data-reliability]").textContent = target.reliability === "fragile" ? "Warning: this selector is fragile and may change with the page layout." : `${target.reliability} selector`;
        save();
      });
      (_c = root.querySelector("[data-save]")) == null ? void 0 : _c.addEventListener("click", () => void persist());
      root.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
        root.querySelectorAll("[data-tab]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        root.querySelectorAll("[data-panel]").forEach((panel) => panel.hidden = panel.dataset.panel !== button.dataset.tab);
      }));
      renderPreview();
      this.validationTimer = window.setInterval(() => {
        void bridge.load().catch(() => this.destroy());
      }, 15e3);
    }
    setTarget(definition, target, stepIndex = 0) {
      if (isGuideDefinition(definition)) definition.steps[stepIndex].target = target;
      else definition.target = target;
    }
    destroy() {
      var _a;
      clearTimeout(this.expiryTimer);
      clearInterval(this.validationTimer);
      this.preview.destroy();
      this.picker.cancel();
      (_a = this.host) == null ? void 0 : _a.remove();
      this.host = null;
    }
  }
  function escapeText(value) {
    const span = document.createElement("span");
    span.textContent = value;
    return span.innerHTML;
  }
  const STYLE = `:host{all:initial}aside{position:fixed;right:16px;top:16px;width:340px;z-index:2147483647;background:#fff;color:#111827;border:1px solid #d1d5db;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.28);font:14px ui-sans-serif,system-ui,sans-serif}header{display:flex;flex-direction:column;padding:16px;border-bottom:1px solid #e5e7eb}small,p{color:#6b7280;margin:0;font-size:12px}nav,.steps>div{display:flex;overflow:auto;border-bottom:1px solid #e5e7eb}nav button,.steps button{border:0;background:transparent;padding:10px 8px;font-size:11px;cursor:pointer}nav button.active,.steps button.active{color:#2563eb;border-bottom:2px solid #2563eb}.steps{display:grid;gap:6px}.steps b{font-size:12px}main{display:grid;gap:12px;padding:16px}section{display:grid;gap:12px}label{display:grid;gap:5px;font-size:12px;font-weight:600}label.row{display:flex;align-items:center}label.row input{width:auto}input,textarea,select{box-sizing:border-box;width:100%;border:1px solid #d1d5db;border-radius:7px;padding:8px;font:14px inherit;background:#fff}textarea{min-height:88px;resize:vertical}main button{border:0;border-radius:7px;padding:9px;background:#111827;color:#fff;cursor:pointer}`;
  const runtime = {
    createController: (apiBase) => new EditorModeController(apiBase)
  };
  window.__movcuesEditorRuntime__ = runtime;
})();
//# sourceMappingURL=sdk-editor.js.map
