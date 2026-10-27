(function() {
  "use strict";
  const BUILDER_ALLOWED_TAGS = /* @__PURE__ */ new Set(["DIV", "SECTION", "HEADER", "H1", "H2", "H3", "H4", "P", "SPAN", "BR", "BUTTON", "IMG", "HR", "LABEL", "STRONG", "EM", "U", "A", "UL", "OL", "LI"]);
  const BUILDER_SURVEY_INPUT_TAGS = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA"]);
  const BUILDER_ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "id", "title", "role", "aria-label", "aria-live", "aria-hidden", "aria-pressed", "aria-required", "alt", "src", "href", "target", "rel", "width", "height", "type", "placeholder", "maxlength", "data-movcues-action-id", "data-movcues-content", "data-movcues-widget-type", "data-movcues-document-version", "data-movcues-node-id", "data-movcues-block-id", "data-movcues-sizing", "data-movcues-responsive-stack", "data-movcues-question-id", "data-movcues-question-type", "data-movcues-question-input", "data-movcues-option-id", "data-movcues-survey-action", "data-movcues-survey-controls", "data-movcues-survey-progress", "data-movcues-survey-progress-bar", "data-movcues-survey-step-id", "data-movcues-checklist-role", "data-movcues-checklist-item-id", "data-movcues-checklist-item-role", "data-movcues-checklist-view"]);
  const BUILDER_BLOCKED_TAGS = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|TEXTAREA|SELECT|VIDEO|AUDIO|SOURCE)$/i;
  const BUILDER_UNSAFE_CSS = /@import|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding/i;
  function builderImageUrlIsSafe(value) {
    return !value || !/[\u0000-\u0020\u007f]/.test(value) && /^(https?:\/\/|data:image\/(?:png|gif|jpeg|webp);base64,|\/)/i.test(value);
  }
  function builderLinkUrlIsSafe(value) {
    return !/[\u0000-\u001f\u007f]/.test(value) && /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i.test(value.trim());
  }
  function builderInputTypeIsSafe(value) {
    return ["text", "radio", "checkbox", "number"].includes(value.toLowerCase());
  }
  function safeScopedBuilderCss(input) {
    const css = input.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (BUILDER_UNSAFE_CSS.test(css)) return null;
    const rule = /([^{}]+)\{/g;
    let match;
    while ((match = rule.exec(css)) !== null) {
      const prelude = match[1].trim();
      if (!prelude || prelude.startsWith("@")) continue;
      if (prelude.split(",").some((selector) => !selector.trim().includes(".movcues-widget"))) return null;
    }
    return css;
  }
  function mountBuilderContent(root, card, builder, callbacks, allowSurveyInputs = false) {
    const html = sanitizeBuilderHtml(builder.html, allowSurveyInputs);
    const css = safeBuilderCss(builder.css);
    if (!html || css === null) return false;
    let style = root.querySelector("style[data-movcues-builder-style]");
    if (!style) {
      style = document.createElement("style");
      style.dataset.movcuesBuilderStyle = "";
      root.appendChild(style);
    }
    style.textContent = `${css}
${ISOLATION_CSS}`;
    const content = document.createElement("div");
    content.className = "builder-content";
    content.dataset.movcuesBuilderSurface = "";
    content.append(...html);
    card.appendChild(content);
    card.classList.add("builder-card");
    card.addEventListener("click", (event) => {
      var _a, _b;
      const target = event.target instanceof Element ? event.target.closest("[data-movcues-action-id]") : null;
      if (!target || !card.contains(target)) return;
      const actionId = target.dataset.movcuesActionId;
      if (actionId === "primary") callbacks.onPrimary();
      else if (actionId === "secondary") callbacks.onSecondary();
      else {
        const action = findOnsiteAction(builder, actionId ?? "");
        if (action) (_b = callbacks.onActionId) == null ? void 0 : _b.call(callbacks, action, ((_a = target.textContent) == null ? void 0 : _a.trim()) ?? "");
      }
    });
    return true;
  }
  const ISOLATION_CSS = `[data-movcues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movcues-builder-surface]>.movcues-widget{position:relative!important;inset:auto!important}`;
  function sanitizeBuilderHtml(input, allowSurveyInputs = false) {
    const template = document.createElement("template");
    template.innerHTML = input;
    for (const element of Array.from(template.content.querySelectorAll("*"))) {
      const allowedTag = BUILDER_ALLOWED_TAGS.has(element.tagName) || allowSurveyInputs && BUILDER_SURVEY_INPUT_TAGS.has(element.tagName);
      if (!allowedTag) {
        if (BUILDER_BLOCKED_TAGS.test(element.tagName)) element.remove();
        else element.replaceWith(...Array.from(element.childNodes));
        continue;
      }
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (!BUILDER_ALLOWED_ATTRIBUTES.has(name) || name.startsWith("on") || /javascript\s*:/i.test(attribute.value)) element.removeAttribute(attribute.name);
      }
      const action = element.getAttribute("data-movcues-action-id");
      if (action && action !== "primary" && action !== "secondary" && !/^[A-Za-z][A-Za-z0-9_-]{2,63}$/.test(action)) element.removeAttribute("data-movcues-action-id");
      const surveyAction = element.getAttribute("data-movcues-survey-action");
      if (surveyAction && surveyAction !== "back" && surveyAction !== "next" && surveyAction !== "submit") element.removeAttribute("data-movcues-survey-action");
      if (element.tagName === "IMG") {
        const source = element.getAttribute("src") ?? "";
        if (!builderImageUrlIsSafe(source)) element.removeAttribute("src");
      }
      if (element.hasAttribute("src") && element.tagName !== "IMG") element.removeAttribute("src");
      if (element.tagName === "A") {
        const href = element.getAttribute("href") ?? "";
        if (!builderLinkUrlIsSafe(href)) element.removeAttribute("href");
        const target = element.getAttribute("target");
        if (target && target !== "_blank" && target !== "_self") element.removeAttribute("target");
        if (target === "_blank") element.setAttribute("rel", "noopener noreferrer");
      } else {
        element.removeAttribute("href");
        element.removeAttribute("target");
        element.removeAttribute("rel");
      }
      if (element.tagName === "INPUT") {
        const type = (element.getAttribute("type") ?? "text").toLowerCase();
        if (!builderInputTypeIsSafe(type)) element.setAttribute("type", "text");
      }
    }
    const root = template.content.querySelector(".movcues-widget");
    if (!root) return null;
    for (const slot of ["primary", "secondary"]) {
      const actions = Array.from(template.content.querySelectorAll(`[data-movcues-action-id="${slot}"]`));
      actions.slice(1).forEach((action) => action.remove());
    }
    return Array.from(template.content.childNodes);
  }
  function findOnsiteAction(builder, id) {
    const movcues = builder.projectData.movcues;
    const bindings = movcues && typeof movcues === "object" ? movcues.actionBindings : null;
    const candidate = bindings && typeof bindings === "object" ? bindings[id] : null;
    if (!candidate || typeof candidate !== "object") return null;
    const action = candidate;
    if (action.id !== id || !["next_step", "previous_step", "dismiss", "open_url", "track_event"].includes(String(action.type))) return null;
    if (action.type === "open_url" && (typeof action.url !== "string" || !/^https?:\/\//i.test(action.url) || !builderLinkUrlIsSafe(action.url))) return null;
    if (action.type === "track_event" && (typeof action.eventName !== "string" || !action.eventName.trim() || action.eventName.length > 200)) return null;
    return action;
  }
  function safeBuilderCss(input) {
    return safeScopedBuilderCss(input);
  }
  class StackingContextResolver {
    resolve(element) {
      if (!element) return { element: null, zIndex: 0, chain: [] };
      const chain = [];
      let current = element;
      while (current && current !== document.documentElement) {
        const style = getComputedStyle(current);
        chain.push({ element: current, zIndex: numericZIndex(style.zIndex), createsStackingContext: createsStackingContext(style) });
        current = current.parentElement;
      }
      const outermost = [...chain].reverse().find((entry) => entry.createsStackingContext);
      return { element: (outermost == null ? void 0 : outermost.element) ?? null, zIndex: (outermost == null ? void 0 : outermost.zIndex) ?? 0, chain };
    }
  }
  function numericZIndex(value) {
    if (!value || value === "auto") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  function createsStackingContext(style) {
    const position = style.position;
    if ((position === "absolute" || position === "relative") && numericZIndex(style.zIndex) !== null || position === "fixed" || position === "sticky") return true;
    if (Number.parseFloat(style.opacity || "1") < 1) return true;
    if (property(style, "transform") !== "none" || property(style, "filter") !== "none" || property(style, "perspective") !== "none") return true;
    if (style.isolation === "isolate" || !!style.mixBlendMode && style.mixBlendMode !== "normal") return true;
    const contain = property(style, "contain");
    if (/(^|\s)(layout|paint|strict|content)(\s|$)/.test(contain)) return true;
    const willChange = property(style, "willChange").split(",").map((value) => value.trim());
    return willChange.some((value) => ["transform", "opacity", "filter", "perspective", "contain"].includes(value));
  }
  function property(style, name) {
    return (style[name] || "none").trim();
  }
  const ALWAYS_ON_TOP_Z_INDEX = 2147483e3;
  const SAFE_DEFAULT_Z_INDEX = 1;
  class LayerManager {
    constructor(resolver = new StackingContextResolver(), findTarget2 = findUniqueTarget) {
      this.resolver = resolver;
      this.findTarget = findTarget2;
    }
    resolve(options) {
      if (!options.layer) {
        if (options.legacyZIndex !== void 0) return { zIndex: options.legacyZIndex, mode: "legacy", context: null };
        return { zIndex: ALWAYS_ON_TOP_Z_INDEX, mode: "legacy", context: null };
      }
      const layer = options.layer;
      if (layer.mode === "always_on_top") return { zIndex: ALWAYS_ON_TOP_Z_INDEX, mode: layer.mode, context: null };
      if (layer.mode === "custom") return { zIndex: layer.zIndex, mode: layer.mode, context: null };
      if (layer.mode === "relative") {
        const reference = this.findTarget(layer.target);
        if (!reference) {
          const automatic = this.auto(options.targetElement);
          return { ...automatic, mode: layer.mode, fallback: "relative_target_missing" };
        }
        const context = this.resolver.resolve(reference);
        return { zIndex: bounded(context.zIndex + (layer.relation === "above" ? 1 : -1)), mode: layer.mode, context };
      }
      return this.auto(options.targetElement);
    }
    auto(targetElement) {
      const context = this.resolver.resolve(targetElement ?? null);
      return { zIndex: targetElement ? bounded(context.zIndex + 1) : SAFE_DEFAULT_Z_INDEX, mode: "auto", context };
    }
    apply(host, options) {
      let observers = [];
      let active = true;
      let frameId = null;
      let last;
      const disconnect = () => {
        observers.forEach((observer) => observer.disconnect());
        observers = [];
      };
      const refresh = () => {
        var _a, _b, _c;
        if (!active) return last;
        if (frameId !== null) {
          cancelAnimationFrame(frameId);
          frameId = null;
        }
        disconnect();
        const resolution = this.resolve(options);
        last = resolution;
        const zIndex = String(resolution.zIndex);
        if (host.style.zIndex !== zIndex) host.style.zIndex = zIndex;
        if (resolution.fallback) {
          if (host.dataset.movcuesLayerFallback !== resolution.fallback) host.dataset.movcuesLayerFallback = resolution.fallback;
        } else if (host.dataset.movcuesLayerFallback) delete host.dataset.movcuesLayerFallback;
        const dynamicLayer = ((_a = options.layer) == null ? void 0 : _a.mode) === "auto" || ((_b = options.layer) == null ? void 0 : _b.mode) === "relative";
        const watched = dynamicLayer ? ((_c = options.layer) == null ? void 0 : _c.mode) === "relative" ? this.findTarget(options.layer.target) : options.targetElement : null;
        if (watched && typeof MutationObserver !== "undefined") {
          const observer = new MutationObserver(() => scheduleRefresh());
          for (let element = watched; element; element = element.parentElement) {
            observer.observe(element, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
            if (element.parentElement) observer.observe(element.parentElement, { childList: true });
          }
          observers.push(observer);
        }
        return resolution;
      };
      const scheduleRefresh = () => {
        if (!active || frameId !== null) return;
        frameId = requestAnimationFrame(() => {
          frameId = null;
          refresh();
        });
      };
      refresh();
      return {
        refresh,
        destroy: () => {
          active = false;
          disconnect();
          if (frameId !== null) cancelAnimationFrame(frameId);
          frameId = null;
        }
      };
    }
  }
  function findUniqueTarget(target) {
    for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
      try {
        const matches2 = document.querySelectorAll(selector);
        if (matches2.length === 1) return matches2[0];
      } catch {
      }
    }
    return null;
  }
  function bounded(value) {
    return Math.max(-2147483648, Math.min(2147483647, value));
  }
  class ChecklistRenderer {
    constructor() {
      this.host = null;
    }
    render(checklist, callbacks, forceLauncher = false) {
      this.destroy();
      const nodes = sanitizeBuilderHtml(checklist.definition.builder.html);
      const css = safeBuilderCss(checklist.definition.builder.css);
      if (!nodes || css === null) return false;
      this.host = document.createElement("div");
      this.host.dataset.movcuesChecklist = checklist.id;
      const side = checklist.definition.behavior.position === "bottom-left" ? "left:16px" : "right:16px";
      this.host.style.cssText = `position:fixed;bottom:16px;${side};z-index:${ALWAYS_ON_TOP_Z_INDEX};pointer-events:auto`;
      const root = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `:host{all:initial}.surface{position:relative;pointer-events:auto}.surface>.movcues-widget{position:relative!important;inset:auto!important}${css}`;
      root.appendChild(style);
      const surface = document.createElement("div");
      surface.className = "surface";
      surface.append(...nodes);
      root.appendChild(surface);
      const authoredRoot = surface.querySelector('[data-movcues-checklist-role="root"]');
      if (!authoredRoot || surface.querySelectorAll('[data-movcues-checklist-role="root"]').length !== 1) {
        this.destroy();
        return false;
      }
      const design = checklist.definition.design, theme = design == null ? void 0 : design.theme.siteTheme;
      if (design) {
        authoredRoot.style.setProperty("--movcues-bg", design.theme.background);
        authoredRoot.style.setProperty("--movcues-fg", design.theme.foreground);
        authoredRoot.style.setProperty("--movcues-primary", design.theme.primary);
        if (design.theme.spacing !== void 0) authoredRoot.style.setProperty("--movcues-theme-spacing", `${design.theme.spacing}px`);
      }
      if (theme) {
        const shadow2 = theme.shadows.md;
        authoredRoot.style.setProperty("--movcues-surface", theme.colors.surface);
        authoredRoot.style.setProperty("--movcues-muted", theme.colors.mutedText);
        authoredRoot.style.setProperty("--movcues-border", theme.colors.border);
        authoredRoot.style.setProperty("--movcues-primary-fg", theme.colors.primaryForeground);
        authoredRoot.style.setProperty("--movcues-font-body", theme.typography.bodyFontFamily);
        authoredRoot.style.setProperty("--movcues-font-heading", theme.typography.headingFontFamily);
        authoredRoot.style.setProperty("--movcues-theme-radius", `${theme.radii.lg}px`);
        authoredRoot.style.setProperty("--movcues-button-radius", `${theme.radii.md}px`);
        authoredRoot.style.setProperty("--movcues-theme-shadow", `${shadow2.x}px ${shadow2.y}px ${shadow2.blur}px ${shadow2.spread}px ${shadow2.color}`);
      }
      const requiredRoles = ["title", "description", "progress", "items", "launcher-label", "remaining-count", "completion-title", "completion-description", "completion-acknowledge"];
      const requiredViews = ["expanded", "launcher", "completion"];
      if (requiredRoles.some((role) => authoredRoot.querySelectorAll(`[data-movcues-checklist-role="${role}"]`).length !== 1) || requiredViews.some((view2) => authoredRoot.querySelectorAll(`[data-movcues-checklist-view="${view2}"]`).length !== 1)) {
        this.destroy();
        return false;
      }
      const itemElements = /* @__PURE__ */ new Map();
      for (const element of Array.from(authoredRoot.querySelectorAll("[data-movcues-checklist-item-id]"))) {
        const id = element.dataset.movcuesChecklistItemId;
        if (!id || itemElements.has(id) || element.querySelectorAll('[data-movcues-checklist-item-role="state"]').length !== 1 || element.querySelectorAll('[data-movcues-checklist-item-role="title"]').length !== 1 || element.querySelectorAll('[data-movcues-checklist-item-role="description"]').length !== 1) {
          this.destroy();
          return false;
        }
        itemElements.set(id, element);
      }
      if (checklist.definition.items.some((item) => !itemElements.has(item.id)) || itemElements.size !== checklist.definition.items.length) {
        this.destroy();
        return false;
      }
      const cellDocument = authoredRoot.dataset.movcuesDocumentVersion === "4";
      setText(authoredRoot, "title", checklist.definition.title);
      setText(authoredRoot, "description", checklist.definition.description ?? "");
      if (!cellDocument) setText(authoredRoot, "launcher-label", checklist.definition.title);
      setText(authoredRoot, "completion-title", checklist.definition.completionMessage.title);
      setText(authoredRoot, "completion-description", checklist.definition.completionMessage.description ?? "");
      setText(authoredRoot, "completion-acknowledge", checklist.definition.completionMessage.acknowledgeLabel);
      authoredRoot.querySelectorAll('[data-movcues-checklist-role="dismiss"]').forEach((element) => {
        element.hidden = !checklist.definition.behavior.dismissible;
      });
      const completed = new Set(checklist.progress.completedItemIds);
      const remaining = checklist.definition.items.length - completed.size;
      authoredRoot.style.setProperty("--movcues-checklist-progress", `${checklist.definition.items.length ? completed.size / checklist.definition.items.length * 100 : 0}%`);
      setText(authoredRoot, "progress", `${completed.size} of ${checklist.definition.items.length} complete`);
      setText(authoredRoot, "remaining-count", checklist.definition.behavior.showRemainingCount ? String(remaining) : "");
      const container = authoredRoot.querySelector('[data-movcues-checklist-role="items"]');
      if (!container) {
        this.destroy();
        return false;
      }
      checklist.definition.items.forEach((item, index) => {
        var _a;
        const element = itemElements.get(item.id);
        if (!cellDocument) container.appendChild(element);
        const state = ((_a = checklist.progress.items[index]) == null ? void 0 : _a.state) ?? "locked";
        element.dataset.state = state;
        element.setAttribute("aria-disabled", state === "locked" ? "true" : "false");
        setText(element, "title", item.title, true);
        setText(element, "description", item.description ?? "", true);
      });
      const view = checklist.progress.complete ? "completion" : forceLauncher || checklist.progress.collapsed ? "launcher" : "expanded";
      authoredRoot.querySelectorAll("[data-movcues-checklist-view]").forEach((element) => element.classList.toggle("is-active", element.dataset.movcuesChecklistView === view));
      authoredRoot.addEventListener("click", (event) => {
        var _a;
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const item = target.closest("[data-movcues-checklist-item-id]");
        if (item && item.dataset.state !== "locked") {
          callbacks.onItemClick(item.dataset.movcuesChecklistItemId);
          return;
        }
        const role = (_a = target.closest("[data-movcues-checklist-role]")) == null ? void 0 : _a.dataset.movcuesChecklistRole;
        if (role === "launcher-label" || target.closest('[data-movcues-checklist-view="launcher"]')) callbacks.onOpen();
        else if (role === "collapse") callbacks.onCollapse();
        else if (role === "completion-acknowledge") callbacks.onAcknowledge();
        else if (role === "dismiss") callbacks.onDismiss();
      });
      document.documentElement.appendChild(this.host);
      return true;
    }
    destroy() {
      var _a;
      (_a = this.host) == null ? void 0 : _a.remove();
      this.host = null;
    }
  }
  function setText(root, role, value, itemRole = false) {
    const attribute = itemRole ? "data-movcues-checklist-item-role" : "data-movcues-checklist-role";
    const element = root.querySelector(`[${attribute}="${role}"]`);
    if (element) element.textContent = value;
  }
  const esc = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  class ChecklistEditor {
    constructor(root, definition, references, options) {
      var _a, _b, _c, _d;
      this.root = root;
      this.definition = definition;
      this.references = references;
      this.options = options;
      this.renderer = new ChecklistRenderer();
      this.step = document.createElement("div");
      this.task = document.createElement("div");
      this.tools = document.createElement("div");
      this.style = document.createElement("style");
      this.view = "expanded";
      this.preview = false;
      this.completed = /* @__PURE__ */ new Set();
      this.sample = /* @__PURE__ */ new Map();
      this.onChange = (event) => {
        var _a2, _b2, _c2, _d2;
        const input = event.target;
        if (!input.matches("[data-checklist-view]") && !this.options.canEdit()) return;
        if (input.matches("[data-checklist-view]")) {
          if (this.options.flush()) {
            this.view = input.value;
            this.closeMobileInspector();
            this.options.render();
          }
          return;
        }
        const c = this.options.composer();
        if (!c) return;
        const item = c.getSelectedTask();
        if (input.matches("[data-checklist-sample]") && item) {
          this.sample.set(item.id, input.value);
          (_a2 = this.options.composer()) == null ? void 0 : _a2.refreshChecklist();
          return;
        }
        if (input.matches("[data-checklist-view-width]")) {
          c.updateChecklistViewWidth(Number(input.value));
          return;
        }
        if (input.matches("[data-checklist-font]")) {
          c.updateBlock({ fontSize: Number(input.value) });
          return;
        }
        if (input.matches("[data-checklist-color]")) {
          c.updateBlock({ color: input.value });
          return;
        }
        if (input.matches("[data-checklist-indicator]")) {
          c.updateBlock({ indicator: input.value });
          return;
        }
        if (input.matches("[data-checklist-launcher-label]")) {
          c.updateBlock({ text: input.value });
          return;
        }
        if (this.step.contains(input)) {
          c.updateChecklist((next2) => {
            if (input.matches("[data-checklist-title]")) next2.title = input.value;
            if (input.matches("[data-checklist-description]")) next2.description = input.value;
            if (input.matches("[data-checklist-completion-title]")) next2.completionMessage.title = input.value;
            if (input.matches("[data-checklist-completion-description]")) next2.completionMessage.description = input.value;
            if (input.matches("[data-checklist-ack]")) next2.completionMessage.acknowledgeLabel = input.value;
            if (input.matches("[data-checklist-position]")) next2.behavior.position = input.value;
            if (input.matches("[data-checklist-order]")) next2.behavior.order = input.value;
            if (input.matches("[data-checklist-initial]")) next2.behavior.initialState = input.value;
            if (input.matches("[data-checklist-dismissible]")) next2.behavior.dismissible = input.checked;
            if (input.matches("[data-checklist-remaining]")) next2.behavior.showRemainingCount = input.checked;
          });
          return;
        }
        if (!item || !this.task.contains(input)) return;
        const next = structuredClone(item);
        if (input.matches("[data-checklist-task-title]")) next.title = input.value;
        if (input.matches("[data-checklist-task-description]")) next.description = input.value;
        if (input.matches("[data-checklist-action]")) next.action = input.value === "none" ? { type: "none" } : input.value === "launch_guide" ? { type: "launch_guide", experienceId: ((_b2 = this.references.guides[0]) == null ? void 0 : _b2.id) ?? "" } : { type: input.value, url: input.value === "navigate" ? "/" : location.origin };
        if (input.matches("[data-checklist-action-guide]")) next.action = { type: "launch_guide", experienceId: input.value };
        if (input.matches("[data-checklist-url]") && "url" in next.action) next.action.url = input.value;
        if (input.matches("[data-checklist-condition]")) next.completion = input.value === "item_clicked" ? { type: "item_clicked" } : input.value === "segment" ? { type: "segment", segmentId: ((_c2 = this.references.segments[0]) == null ? void 0 : _c2.id) ?? "" } : { type: "guide_completed", experienceId: ((_d2 = this.references.guides[0]) == null ? void 0 : _d2.id) ?? "" };
        if (input.matches("[data-checklist-segment]")) next.completion = { type: "segment", segmentId: input.value };
        if (input.matches("[data-checklist-completion-guide]")) next.completion = { type: "guide_completed", experienceId: input.value };
        if (next.action.type === "launch_guide" && !next.action.experienceId || next.completion.type === "segment" && !next.completion.segmentId || next.completion.type === "guide_completed" && !next.completion.experienceId) {
          this.options.error(["Select a Guide or Segment from this site."]);
          return;
        }
        c.updateChecklist((value) => {
          value.items = value.items.map((task) => task.id === next.id ? next : task);
        });
        this.sync();
      };
      this.onClick = (event) => {
        var _a2, _b2, _c2;
        const button = (_b2 = (_a2 = event.target) == null ? void 0 : _a2.closest) == null ? void 0 : _b2.call(_a2, "button");
        if (!button) return;
        if (button.matches("[data-checklist-reset]")) {
          this.completed.clear();
          this.sample.clear();
          this.view = "expanded";
          this.options.render();
          return;
        }
        if (!this.options.canEdit()) return;
        if (button.matches("[data-checklist-add]")) {
          this.view = "expanded";
          const c = this.options.composer();
          if (c == null ? void 0 : c.insertTask()) this.sync();
        }
        if (button.matches("[data-checklist-task-move]")) (_c2 = this.options.composer()) == null ? void 0 : _c2.move(Number(button.dataset.checklistTaskMove));
      };
      this.step.dataset.checklistInspector = "";
      this.step.innerHTML = '<label>View width<input type="number" data-checklist-view-width min="120" max="720"></label><small>Width for the selected visual state. It automatically fits small screens.</small><label>Checklist title<input data-checklist-title maxlength="160"></label><label>Description<textarea data-checklist-description rows="3" maxlength="2000"></textarea></label><label>Position<select data-checklist-position><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option></select></label><label>Task order<select data-checklist-order><option value="any">Any order</option><option value="sequential">In order</option></select></label><small>In order unlocks each task after the previous task is completed.</small><label>Start as<select data-checklist-initial><option value="expanded">Expanded</option><option value="collapsed">Collapsed</option></select></label><label class="check"><input type="checkbox" data-checklist-dismissible> Allow dismissal</label><label class="check"><input type="checkbox" data-checklist-remaining> Show remaining count</label><label>Completion title<input data-checklist-completion-title maxlength="160"></label><label>Completion message<textarea data-checklist-completion-description rows="3" maxlength="2000"></textarea></label><label>Done button<input data-checklist-ack maxlength="80"></label><button type="button" class="secondary-button" data-checklist-add>Add task</button>';
      this.task.dataset.block = "checklist_task,checklist_text,checklist_control,checklist_progress";
      this.task.innerHTML = '<div data-checklist-task-fields><label>Task title<input data-checklist-task-title maxlength="200"></label><label>Description<textarea data-checklist-task-description rows="3" maxlength="1000"></textarea></label><label>Action<select data-checklist-action><option value="none">No action</option><option value="launch_guide">Launch Guide</option><option value="navigate">Go to a page</option><option value="open_url">Open external URL</option></select></label><label data-checklist-guide-field>Guide<select data-checklist-action-guide></select></label><label data-checklist-url-field>Page URL<input data-checklist-url type="url" maxlength="2000" placeholder="/getting-started"></label><label>Complete when<select data-checklist-condition><option value="item_clicked">Task clicked</option><option value="segment">Matches saved Segment</option><option value="guide_completed">Guide completed</option></select></label><label data-checklist-segment-field>Segment<select data-checklist-segment></select></label><label data-checklist-completion-guide-field>Guide<select data-checklist-completion-guide></select></label><small data-checklist-action-note></small><label>Sample status<select data-checklist-sample><option value="available">Available</option><option value="completed">Completed</option><option value="locked">Locked</option></select></label><label>Status icon<select data-checklist-indicator><option value="check">Check</option><option value="star">Star</option><option value="rocket">Rocket</option><option value="heart">Heart</option><option value="info">Info</option><option value="warning">Warning</option><option value="sparkles">Sparkles</option><option value="arrow">Arrow</option></select></label><div class="history-row"><button type="button" class="secondary-button compact" data-checklist-task-move="-1">Move earlier</button><button type="button" class="secondary-button compact" data-checklist-task-move="1">Move later</button></div></div><label data-checklist-launcher-field>Launcher label<input data-checklist-launcher-label maxlength="200"></label><label>Font size<input type="number" data-checklist-font min="10" max="48"></label><label>Color<input type="color" data-checklist-color></label>';
      this.tools.dataset.checklistTools = "";
      this.tools.innerHTML = '<select aria-label="Checklist visual state" data-checklist-view><option value="expanded">Expanded</option><option value="launcher">Collapsed</option><option value="completion">Completed</option></select><button type="button" class="secondary-button compact" data-checklist-add aria-label="Add Checklist task">＋ Task</button><button type="button" class="secondary-button compact" data-checklist-reset>Reset simulation</button><span data-checklist-preview-note hidden>Simulated progress</span>';
      (_a = this.root.querySelector("[data-inspector=step]")) == null ? void 0 : _a.append(this.step);
      (_b = this.root.querySelector("[data-inspector=block]")) == null ? void 0 : _b.append(this.task);
      (_c = this.root.querySelector("[data-editor-toolbar]")) == null ? void 0 : _c.append(this.tools);
      const guideOptions = '<option value="">Select Guide</option>' + references.guides.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}${g.status === "published" ? "" : " (not published)"}</option>`).join("");
      this.task.querySelectorAll("[data-checklist-action-guide],[data-checklist-completion-guide]").forEach((select) => select.innerHTML = guideOptions);
      this.task.querySelector("[data-checklist-segment]").innerHTML = '<option value="">Select Segment</option>' + references.segments.map((segment) => `<option value="${esc(segment.id)}">${esc(segment.name)}</option>`).join("");
      this.style.textContent = "[data-checklist-inspector],[data-block^=checklist_task]{display:grid;gap:8px}[data-checklist-inspector] small,[data-checklist-action-note]{font-size:11px;color:#64748b}[data-checklist-inspector] textarea,[data-block^=checklist_task] textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid #d7dce3;border-radius:6px;font:12px ui-sans-serif,system-ui;padding:7px}[data-checklist-tools]{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0;max-width:100%;padding:0 6px 6px}[data-checklist-tools] select{width:auto;max-width:100%;font-size:11px}[data-checklist-tools] span{font-size:10px;color:#64748b}[data-checklist-task-fields]{display:grid;gap:8px}";
      this.root.append(this.style);
      root.addEventListener("change", this.onChange);
      root.addEventListener("click", this.onClick);
      if (innerWidth <= 480) this.closeMobileInspector();
      else (_d = this.root.querySelector("aside")) == null ? void 0 : _d.classList.toggle("left-side", definition.behavior.position === "bottom-right");
    }
    sync() {
      var _a, _b, _c;
      const c = this.options.composer(), task = c == null ? void 0 : c.getSelectedTask(), block = c == null ? void 0 : c.getSelectedBlock();
      this.task.querySelector("[data-checklist-task-fields]").hidden = !task;
      this.value("[data-checklist-view]", this.view);
      this.root.querySelector("[data-checklist-preview-note]").hidden = !this.preview;
      this.root.querySelectorAll("[data-checklist-add]").forEach((button) => {
        button.disabled = !this.options.canEdit() || this.definition.items.length >= 20;
      });
      const d = this.definition;
      this.value("[data-checklist-view-width]", String(((_b = (_a = c == null ? void 0 : c.getDocument().root.children) == null ? void 0 : _a.find((cell) => cell.checklistRole === this.view)) == null ? void 0 : _b.checklistWidth) ?? (this.view === "launcher" ? 220 : 360)));
      this.value("[data-checklist-title]", d.title);
      this.value("[data-checklist-description]", d.description ?? "");
      this.value("[data-checklist-position]", d.behavior.position);
      this.value("[data-checklist-order]", d.behavior.order);
      this.value("[data-checklist-initial]", d.behavior.initialState);
      this.check("[data-checklist-dismissible]", d.behavior.dismissible);
      this.check("[data-checklist-remaining]", d.behavior.showRemainingCount);
      this.value("[data-checklist-completion-title]", d.completionMessage.title);
      this.value("[data-checklist-completion-description]", d.completionMessage.description ?? "");
      this.value("[data-checklist-ack]", d.completionMessage.acknowledgeLabel);
      if (task) {
        this.value("[data-checklist-task-title]", task.title);
        this.value("[data-checklist-task-description]", task.description ?? "");
        this.value("[data-checklist-action]", task.action.type);
        this.value("[data-checklist-action-guide]", task.action.type === "launch_guide" ? task.action.experienceId : "");
        this.value("[data-checklist-url]", "url" in task.action ? task.action.url : "");
        this.value("[data-checklist-condition]", task.completion.type);
        this.value("[data-checklist-segment]", task.completion.type === "segment" ? task.completion.segmentId : "");
        this.value("[data-checklist-completion-guide]", task.completion.type === "guide_completed" ? task.completion.experienceId : "");
        this.value("[data-checklist-sample]", this.sample.get(task.id) ?? "available");
        this.hide("[data-checklist-guide-field]", task.action.type !== "launch_guide");
        this.hide("[data-checklist-url-field]", !["navigate", "open_url"].includes(task.action.type));
        this.hide("[data-checklist-segment-field]", task.completion.type !== "segment");
        this.hide("[data-checklist-completion-guide-field]", task.completion.type !== "guide_completed");
        const note = this.task.querySelector("[data-checklist-action-note]");
        note.textContent = task.action.type === "launch_guide" && ((_c = this.references.guides.find((g) => g.id === ("experienceId" in task.action ? task.action.experienceId : ""))) == null ? void 0 : _c.status) !== "published" ? "Publish the selected Guide before publishing this Checklist." : "Completion is verified by the server. Sample status changes only this editor.";
      }
      this.hide("[data-checklist-launcher-field]", (block == null ? void 0 : block.type) !== "checklist_text" || block.role !== "launcher-label");
      if (block == null ? void 0 : block.type.startsWith("checklist_")) {
        const visual = block;
        this.value("[data-checklist-font]", String(visual.fontSize));
        this.value("[data-checklist-color]", visual.color ?? "#111827");
        if (block.type === "checklist_task") this.value("[data-checklist-indicator]", block.indicator);
        if (block.type === "checklist_text" && block.role === "launcher-label") this.value("[data-checklist-launcher-label]", block.text ?? d.title);
      }
    }
    render(id, versionId, preview) {
      var _a, _b;
      this.preview = preview;
      const completed = this.view === "completion" ? this.definition.items.map((item) => item.id) : this.definition.items.filter((item) => this.completed.has(item.id)).map((item) => item.id);
      const ids = new Set(completed);
      let unlocked = true;
      const progress = { stateId: "editor-only", collapsed: this.view === "launcher", dismissed: false, complete: this.view === "completion", completionAcknowledged: false, completedItemIds: completed, items: this.definition.items.map((item) => {
        const state = ids.has(item.id) ? "completed" : this.definition.behavior.order === "sequential" && !unlocked ? "locked" : "available";
        if (!ids.has(item.id)) unlocked = false;
        return { id: item.id, state };
      }) };
      const mounted = this.renderer.render({ id, versionId, kind: "checklist", priority: 0, definition: this.definition, progress }, { onOpen: () => this.transition("expanded"), onCollapse: () => this.transition("launcher"), onDismiss: () => this.renderer.destroy(), onAcknowledge: () => this.renderer.destroy(), onItemClick: (itemId) => {
        this.completed.add(itemId);
        if (this.definition.items.every((item) => this.completed.has(item.id))) this.view = "completion";
        this.options.render();
      } });
      const host = this.host(id);
      if (host && document.body && !document.body.contains(host)) document.body.append(host);
      const surface = (_a = host == null ? void 0 : host.shadowRoot) == null ? void 0 : _a.querySelector(".surface"), style = (_b = host == null ? void 0 : host.shadowRoot) == null ? void 0 : _b.querySelector("style");
      if (surface) surface.dataset.movcuesBuilderSurface = "";
      if (style) style.dataset.movcuesBuilderStyle = "";
      this.sync();
      return mounted;
    }
    applyDesign(id) {
      var _a;
      const host = this.host(id), root = host == null ? void 0 : host.shadowRoot;
      if (!host || !root) return;
      host.style.left = this.definition.behavior.position === "bottom-left" ? "16px" : "auto";
      host.style.right = this.definition.behavior.position === "bottom-right" ? "16px" : "auto";
      root.querySelectorAll("[data-movcues-checklist-view]").forEach((view) => view.classList.toggle("is-active", view.dataset.movcuesChecklistView === this.view));
      let available = true;
      root.querySelectorAll("[data-movcues-checklist-item-id]").forEach((node) => {
        const explicit = this.sample.get(node.dataset.movcuesChecklistItemId);
        node.dataset.state = explicit ?? (this.definition.behavior.order === "sequential" && !available ? "locked" : "available");
        if (node.dataset.state !== "completed") available = false;
      });
      root.querySelector("[data-movcues-checklist-role=progress]").textContent = `${this.definition.items.filter((item) => this.sample.get(item.id) === "completed").length} of ${this.definition.items.length} complete`;
      root.querySelectorAll("[data-movcues-checklist-role=dismiss]").forEach((node) => node.hidden = !this.definition.behavior.dismissible);
      const count = root.querySelector("[data-movcues-checklist-role=remaining-count]");
      if (count) count.textContent = this.definition.behavior.showRemainingCount ? String(this.definition.items.length) : "";
      (_a = this.options.composer()) == null ? void 0 : _a.setChecklistView(this.view);
    }
    host(id) {
      return Array.from(document.querySelectorAll("[data-movcues-checklist]")).find((host) => host.dataset.movcuesChecklist === id) ?? null;
    }
    closeMobileInspector() {
      var _a, _b;
      if (innerWidth > 480) return;
      (_a = this.root.querySelector("aside")) == null ? void 0 : _a.classList.add("minimized");
      (_b = this.root.querySelector("[data-minimize]")) == null ? void 0 : _b.setAttribute("aria-expanded", "false");
    }
    transition(view) {
      this.view = view;
      this.options.render();
    }
    value(selector, value) {
      const input = this.root.querySelector(selector);
      if (input && this.root.activeElement !== input) input.value = value;
    }
    check(selector, value) {
      const input = this.root.querySelector(selector);
      if (input) input.checked = value;
    }
    hide(selector, value) {
      const element = this.task.querySelector(selector);
      if (element) element.hidden = value;
    }
    destroyView() {
      this.renderer.destroy();
    }
    destroy() {
      this.renderer.destroy();
      this.root.removeEventListener("change", this.onChange);
      this.root.removeEventListener("click", this.onClick);
      this.step.remove();
      this.task.remove();
      this.tools.remove();
      this.style.remove();
    }
  }
  function getGuideStepPattern(step) {
    return step.pattern ?? "anchored_card";
  }
  function guideStepRequiresTarget(step) {
    return getGuideStepPattern(step) === "anchored_card";
  }
  function isGuideDefinition(value) {
    return "steps" in value;
  }
  function isChecklistDefinition(value) {
    return "items" in value;
  }
  const checklistCopy = (value) => ({ title: value.title, description: value.description ?? "", "launcher-label": value.title, "remaining-count": "", "completion-title": value.completionMessage.title, "completion-description": value.completionMessage.description ?? "" });
  const escapeChecklist = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const CHECKLIST_CELL_CSS = '.movcues-widget--checklist{width:360px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow:auto;background:var(--movcues-bg,#fff);color:var(--movcues-fg,#111827);border:1px solid var(--movcues-border,#e2e8f0);border-radius:var(--movcues-theme-radius,12px);box-shadow:var(--movcues-theme-shadow,0 12px 40px #0f172a24);font:14px/1.4 var(--movcues-font-body,ui-sans-serif,system-ui)}.movcues-widget [data-movcues-checklist-view]:not(.is-active){display:none!important}.movcues-widget--checklist:has([data-movcues-checklist-view="launcher"].is-active){width:220px}.movcues-widget .movcues-checklist__item{display:flex;align-items:flex-start;gap:10px;width:100%;padding:10px;border:1px solid var(--movcues-border,#e2e8f0);border-radius:var(--movcues-button-radius,8px);background:var(--movcues-surface,#f8fafc);color:inherit;text-align:left;cursor:pointer;font:inherit}.movcues-widget .movcues-checklist__copy{display:grid;gap:3px}.movcues-widget [data-movcues-checklist-item-role="title"]{font-weight:600}.movcues-widget [data-movcues-checklist-item-role="description"]{font-size:.9em;color:var(--movcues-muted,#64748b)}.movcues-widget [data-movcues-checklist-item-role="state"]{display:grid;place-items:center;flex:none;width:22px;height:22px;border:1px solid #94a3b8;border-radius:50%;color:transparent}.movcues-widget [data-state="completed"] [data-movcues-checklist-item-role="state"]{background:#16a34a;border-color:#16a34a;color:#fff}.movcues-widget [data-state="locked"]{opacity:.5;cursor:not-allowed}.movcues-widget .movcues-checklist-progress-track{height:4px;border-radius:4px;background:#e2e8f0;overflow:hidden}.movcues-widget .movcues-checklist-progress-fill{display:block;height:100%;width:var(--movcues-checklist-progress,0%);background:var(--movcues-primary,#2563eb)}.movcues-widget .movcues-checklist-control{border:1px solid var(--movcues-border,#cbd5e1);border-radius:var(--movcues-button-radius,6px);padding:6px 10px;background:var(--movcues-surface,#fff);color:inherit;cursor:pointer;font:inherit}.movcues-widget [data-movcues-checklist-role="completion-acknowledge"]{background:var(--movcues-primary,#2563eb);border-color:var(--movcues-primary,#2563eb);color:var(--movcues-primary-fg,#fff)}.movcues-widget [data-movcues-checklist-view="launcher"]{cursor:pointer}.movcues-widget [hidden]{display:none!important}';
  const QUESTION_TYPES = ["single_choice", "multiple_choice", "short_text", "long_text", "rating", "nps"];
  function surveyQuestionMarkup(question, blockId) {
    const label = escape$1(question.label);
    let controls;
    if (question.type === "short_text" || question.type === "long_text") {
      const attrs = `class="movcues-survey-input" data-movcues-question-input aria-label="${label}" placeholder="${escape$1(question.placeholder ?? "")}" maxlength="${question.maxLength ?? 1e4}"${question.required ? ' aria-required="true"' : ""}`;
      controls = question.type === "short_text" ? `<input type="text" ${attrs}>` : `<textarea ${attrs}></textarea>`;
    } else {
      const options = question.type === "rating" || question.type === "nps" ? Array.from({ length: question.type === "nps" ? 11 : question.max - question.min + 1 }, (_, index) => {
        const value = String(index + (question.type === "nps" ? 0 : question.min));
        return { id: value, label: value };
      }) : question.options;
      controls = `<div class="movcues-survey-options">${options.map((option) => `<button type="button" class="movcues-survey-option" data-movcues-option-id="${escape$1(option.id)}" aria-pressed="false">${escape$1(option.label)}</button>`).join("")}</div>`;
    }
    return `<div class="movcues-block movcues-survey-question" data-movcues-block-id="${escape$1(blockId)}" data-movcues-question-id="${escape$1(question.id)}" data-movcues-question-type="${question.type}"><p class="movcues-survey-question__label">${label}${question.required ? " *" : ""}</p>${controls}</div>`;
  }
  function surveyControlsMarkup(blockId, label) {
    return `<div class="movcues-block movcues-survey-footer" data-movcues-block-id="${escape$1(blockId)}" data-movcues-survey-controls="onsite"><div data-movcues-survey-progress><span>Progress</span><span data-movcues-survey-progress-bar></span></div><p class="movcues-survey-validation" role="alert"></p><div class="movcues-survey-actions"><button type="button" data-movcues-survey-action="back">Back</button><button type="button" data-movcues-survey-action="next">Next</button><button type="button" data-movcues-survey-action="submit">${escape$1(label)}</button></div></div>`;
  }
  const SURVEY_CELL_CSS = ".movcues-widget .movcues-survey-question__label{margin:0 0 8px;font-weight:600}.movcues-widget .movcues-survey-options{display:flex;flex-wrap:wrap;gap:6px}.movcues-widget .movcues-survey-option,.movcues-widget [data-movcues-survey-action]{min-height:36px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:inherit;padding:8px 12px;font:inherit;cursor:pointer}.movcues-widget .movcues-survey-option.is-selected{border-color:var(--movcues-primary);background:color-mix(in srgb,var(--movcues-primary) 12%,white)}.movcues-widget .movcues-survey-input{box-sizing:border-box;width:100%;min-width:0;min-height:36px;border:1px solid #cbd5e1;border-radius:6px;padding:8px;font:inherit}.movcues-widget textarea.movcues-survey-input{min-height:84px;resize:vertical}.movcues-widget .movcues-survey-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.movcues-widget .movcues-survey-footer{width:100%}.movcues-widget [data-movcues-survey-progress]{font-size:12px;margin-bottom:8px}.movcues-widget [data-movcues-survey-progress-bar]{display:block;height:3px;background:var(--movcues-primary);margin-top:5px}.movcues-widget .movcues-survey-validation{color:#b91c1c;font-size:12px}.movcues-widget .movcues-survey-question.has-error{outline:2px solid #dc2626;outline-offset:4px}";
  function surveyQuestionErrors(questions) {
    var _a, _b, _c;
    if (!Array.isArray(questions) || questions.length > 20) return ["A Survey step supports at most 20 questions."];
    const errors = [], ids = /* @__PURE__ */ new Set();
    for (const question of questions) {
      if (!question || !QUESTION_TYPES.includes(question.type)) {
        errors.push("Unsupported Survey question type.");
        continue;
      }
      if (!question.id || question.id.length > 64 || ids.has(question.id)) errors.push("Question IDs must be unique and contain 1–64 characters.");
      ids.add(question.id);
      if (!((_a = question.label) == null ? void 0 : _a.trim()) || question.label.length > 500) errors.push("Question labels must contain 1–500 characters.");
      if (question.required !== void 0 && typeof question.required !== "boolean") errors.push("Required must be a boolean.");
      if (question.type === "single_choice" || question.type === "multiple_choice") {
        if (!Array.isArray(question.options) || !question.options.length || question.options.length > 20) errors.push("Choice questions need 1–20 options.");
        else {
          const optionIds = /* @__PURE__ */ new Set();
          for (const option of question.options) {
            if (!option.id || option.id.length > 64 || optionIds.has(option.id) || !((_b = option.label) == null ? void 0 : _b.trim()) || option.label.length > 200) errors.push("Options need unique IDs and nonempty labels (up to 200 characters).");
            optionIds.add(option.id);
          }
        }
      } else if (question.type === "rating" && (!Number.isInteger(question.min) || !Number.isInteger(question.max) || question.min < 0 || question.max > 100 || question.max <= question.min || question.max - question.min > 20)) errors.push("Rating needs an ascending range of at most 21 values between 0 and 100.");
      else if ((question.type === "short_text" || question.type === "long_text") && (question.maxLength !== void 0 && (!Number.isInteger(question.maxLength) || question.maxLength < 1 || question.maxLength > 1e4) || (((_c = question.placeholder) == null ? void 0 : _c.length) ?? 0) > 500)) errors.push("Text limit must be 1–10,000 and placeholder at most 500 characters.");
    }
    return errors;
  }
  function escape$1(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  const ONSITE_LIMITS = {
    maxDepth: 8,
    maxNodes: 120,
    maxRichText: 1e4,
    maxImageUrl: 2e3,
    maxInlineImage: 65536,
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
    if (type.startsWith("checklist_")) throw new Error("Insert a structured Checklist component.");
    if (type === "question") throw new Error("Insert a canonical Survey question first.");
    if (type === "survey_controls") return { id, type };
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
    const text2 = emptyCell(createBlock("text", guide));
    const button = emptyCell(createBlock("button", guide));
    return { schemaVersion: 2, id: onsiteId("document"), root: { ...emptyCell(), direction: "column", gap: 12, padding: { top: 20, right: 20, bottom: 20, left: 20 }, children: [heading, text2, button] } };
  }
  function createOnsiteSurveyDocument(questions, content) {
    const document2 = createOnsiteDocument();
    document2.schemaVersion = 3;
    const heading = document2.root.children[0].block;
    if (heading.type === "heading" && content) heading.html = escapeText$2(content.heading);
    const body = document2.root.children[1].block;
    if (body.type === "text" && content) body.html = escapeText$2(content.body);
    document2.root.children = [...document2.root.children.slice(0, 2), ...questions.map((question) => emptyCell({ id: onsiteId("block"), type: "question", questionId: question.id, fontSize: 14 })), emptyCell(createBlock("survey_controls"))];
    document2.root.children.forEach((cell) => {
      cell.sizing = { mode: "hug" };
    });
    return document2;
  }
  function validateOnsiteSurveyDocument(document2, context) {
    const errors = surveyQuestionErrors(context.questions), counts = /* @__PURE__ */ new Map();
    const known = new Set(context.questions.map((question) => question.id));
    const blocks = listBlocks(document2.root);
    for (const block of blocks) if (block.type === "question") {
      counts.set(block.questionId, (counts.get(block.questionId) ?? 0) + 1);
      if (!known.has(block.questionId)) errors.push(`Orphaned question reference: ${block.questionId}.`);
    }
    for (const question of context.questions) if (counts.get(question.id) !== 1) errors.push(`Question ${question.id} must be referenced exactly once.`);
    if (blocks.filter((block) => block.type === "survey_controls").length !== 1) errors.push("Survey cells need exactly one navigation/progress block.");
    return errors;
  }
  function duplicateSurveyCell(document2, questions, id) {
    const candidate = cloneOnsite(document2), nextQuestions = cloneOnsite(questions);
    const cellId = duplicateCell(candidate, id);
    if (!cellId) return null;
    for (const block of listBlocks(findCell(candidate, cellId))) if (block.type === "question") {
      const source = questions.find((question) => question.id === block.questionId);
      if (!source) return null;
      const copy = cloneOnsite(source);
      copy.id = onsiteId("question");
      if (copy.type === "single_choice" || copy.type === "multiple_choice") copy.options.forEach((option) => {
        option.id = onsiteId("option");
      });
      block.questionId = copy.id;
      nextQuestions.push(copy);
    }
    if (!validateOnsiteDocument(candidate).valid || validateOnsiteSurveyDocument(candidate, { questions: nextQuestions }).length) return null;
    return { document: candidate, questions: nextQuestions, cellId };
  }
  function validateOnsiteChecklistDocument(document2, context) {
    const errors = [];
    const views = document2.root.children ?? [];
    if (document2.schemaVersion !== 4 || document2.root.checklistRole || document2.root.block || views.length !== 3 || !["expanded", "launcher", "completion"].every((role) => views.filter((cell) => cell.checklistRole === role).length === 1)) errors.push("Checklist document needs exactly one Expanded, Collapsed and Completed view.");
    const expected = { title: "expanded", description: "expanded", progress: "expanded", collapse: "expanded", dismiss: "expanded", "launcher-label": "launcher", "remaining-count": "launcher", "completion-title": "completion", "completion-description": "completion", "completion-acknowledge": "completion" };
    const counts = /* @__PURE__ */ new Map(), itemCounts = /* @__PURE__ */ new Map(), ids = /* @__PURE__ */ new Set();
    let containers = 0;
    if (!context.items.length || context.items.length > 20) errors.push("A Checklist needs 1–20 tasks.");
    for (const item of context.items) {
      if (ids.has(item.id)) errors.push("Checklist item IDs must be unique.");
      ids.add(item.id);
      if (!item.title.trim()) errors.push("Task title cannot be empty.");
    }
    const visit = (cell, view, inItems = false) => {
      var _a;
      if (cell.checklistRole === "items") {
        containers++;
        if (view !== "expanded" || inItems) errors.push("Task container belongs in the Expanded view.");
        inItems = true;
      }
      if (cell.checklistRole && cell.checklistRole !== "items" && cell !== views.find((value) => value.id === cell.id)) errors.push("Checklist views cannot be nested.");
      const block = cell.block;
      if ((block == null ? void 0 : block.type) === "checklist_task") {
        itemCounts.set(block.itemId, (itemCounts.get(block.itemId) ?? 0) + 1);
        if (!ids.has(block.itemId) || !inItems || view !== "expanded") errors.push("Orphaned task reference or task outside the Expanded task container.");
      } else if ((block == null ? void 0 : block.type) === "checklist_text" || (block == null ? void 0 : block.type) === "checklist_control" || (block == null ? void 0 : block.type) === "checklist_progress") {
        const role = block.type === "checklist_progress" ? "progress" : block.role;
        counts.set(role, (counts.get(role) ?? 0) + 1);
        if (expected[role] !== view || inItems) errors.push("Checklist structural component is in the wrong view.");
      } else if (block && ["question", "survey_controls", "button"].includes(block.type)) errors.push("Use Checklist controls and tasks in a Checklist document.");
      (_a = cell.children) == null ? void 0 : _a.forEach((child) => visit(child, view, inItems));
    };
    views.forEach((view) => visit(view, view.checklistRole ?? ""));
    if (containers !== 1) errors.push("Checklist needs exactly one task container.");
    for (const role of Object.keys(expected)) if (counts.get(role) !== 1) errors.push(`Checklist role ${role} must appear exactly once.`);
    for (const item of context.items) if (itemCounts.get(item.id) !== 1) errors.push(`Task ${item.id} must be referenced exactly once.`);
    const order = listBlocks(document2.root).filter((block) => block.type === "checklist_task").map((block) => block.itemId);
    if (JSON.stringify(order) !== JSON.stringify(context.items.map((item) => item.id))) errors.push("Task layout order must match the canonical item order.");
    return errors;
  }
  function duplicateChecklistCell(document2, context, cellId) {
    const candidate = cloneOnsite(document2), items = cloneOnsite(context.items), id = duplicateCell(candidate, cellId);
    if (!id) return null;
    for (const block of listBlocks(findCell(candidate, id))) if (block.type === "checklist_task") {
      const source = items.find((item) => item.id === block.itemId);
      if (!source) return null;
      const copy = { ...cloneOnsite(source), id: onsiteId("item") };
      block.itemId = copy.id;
      items.push(copy);
    }
    const ordered = listBlocks(candidate.root).filter((block) => block.type === "checklist_task").map((block) => items.find((item) => item.id === block.itemId));
    if (validateOnsiteChecklistDocument(candidate, { ...context, items: ordered }).length || !validateOnsiteDocument(candidate).valid) return null;
    return { document: candidate, items: ordered, cellId: id };
  }
  function onsiteDocumentFromBuilder(builder) {
    var _a;
    const movcues = (_a = builder == null ? void 0 : builder.projectData) == null ? void 0 : _a.movcues;
    if (!movcues || typeof movcues !== "object") return null;
    const document2 = movcues.onsiteDocument;
    return isOnsiteDocument(document2) ? document2 : null;
  }
  function applyOnsiteDocument(builder, document2, widgetType, survey, checklist) {
    const compiled = compileOnsiteDocument(document2, widgetType, survey, checklist);
    builder.version = 1;
    builder.projectData = { ...builder.projectData, movcues: { ...asRecord(builder.projectData.movcues), authoringSurface: "onsite", schemaVersion: document2.schemaVersion, onsiteDocument: document2, actionBindings: compiled.actionBindings } };
    builder.html = compiled.html;
    builder.css = compiled.css;
    return compiled;
  }
  function compileOnsiteDocument(document2, widgetType, survey, checklist) {
    var _a;
    const validation = validateOnsiteDocument(document2);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    if (document2.schemaVersion === 4) {
      if (widgetType !== "checklist" || !checklist || survey) throw new Error("Version 4 requires a Checklist context.");
      const errors = validateOnsiteChecklistDocument(document2, checklist);
      if (errors.length) throw new Error(errors.join(" "));
    } else if (checklist) throw new Error("Checklist cells require document version 4.");
    if (document2.schemaVersion === 3) {
      if (widgetType !== "survey" || !survey) throw new Error("Version 3 requires a Survey question context.");
      const errors = validateOnsiteSurveyDocument(document2, survey);
      if (errors.length) throw new Error(errors.join(" "));
    } else if (survey) throw new Error("Survey cells require document version 3.");
    const css = [
      ".movcues-widget{box-sizing:border-box;width:100%;max-width:100%;min-width:0;overflow-wrap:anywhere;padding:var(--movcues-theme-spacing,0);background:var(--movcues-bg);color:var(--movcues-fg);border-color:var(--movcues-border,transparent);border-radius:var(--movcues-theme-radius,inherit);font-family:var(--movcues-font-body,ui-sans-serif,system-ui,sans-serif);font-size:var(--movcues-font-body-size,15px);box-shadow:var(--movcues-theme-shadow,none)}",
      ".movcues-widget *{box-sizing:border-box}",
      ".movcues-widget .movcues-cell{display:flex;min-width:0;max-width:100%}",
      ".movcues-widget .movcues-block{min-width:0;max-width:100%;margin:0}",
      ".movcues-widget .movcues-block img{display:block;max-width:100%}",
      ".movcues-widget .movcues-heading{font-family:var(--movcues-font-heading,var(--movcues-font-body));font-size:var(--movcues-font-heading-size,inherit)}",
      ".movcues-widget .movcues-button{min-height:40px;border:0;border-radius:var(--movcues-button-radius,8px);font:600 14px/1.2 var(--movcues-font-body,ui-sans-serif,system-ui,sans-serif);cursor:pointer}",
      ".movcues-widget .movcues-button--primary{background:var(--movcues-primary);color:var(--movcues-primary-fg,#fff)}",
      ".movcues-widget .movcues-button--secondary{background:transparent;color:inherit}",
      ".movcues-widget .movcues-button--outline{background:transparent;color:inherit;border:1px solid currentColor}",
      ".movcues-widget .movcues-block--full{width:100%}"
    ];
    if (document2.schemaVersion === 3) css.push(SURVEY_CELL_CSS);
    if (document2.schemaVersion === 4) css.push(CHECKLIST_CELL_CSS);
    const html = renderCell(document2.root, css, 0, survey, checklist);
    css.push('@media(max-width:480px){.movcues-widget [data-movcues-responsive-stack="true"]{flex-direction:column!important}.movcues-widget [data-movcues-sizing="fixed"]{max-width:100%!important}.movcues-widget .movcues-button{min-height:40px}.movcues-widget img{height:auto!important}}');
    const blocks = listBlocks(document2.root);
    const firstHeading = blocks.find((block) => block.type === "heading");
    const text2 = blocks.filter((block) => block.type === "text").map((block) => richTextToPlain(block.html)).join("\n").slice(0, 2e3);
    const actions = blocks.filter((block) => block.type === "button");
    const actionBindings = Object.fromEntries(actions.map((block) => [block.action.id, block.action]));
    const legacy = actions.slice(0, 2).map((block) => ({ label: block.label, type: block.action.type === "previous_step" ? "dismiss" : block.action.type, ..."url" in block.action ? { url: block.action.url } : {}, ..."eventName" in block.action ? { eventName: block.action.eventName } : {} }));
    const content = {
      heading: checklist ? checklist.title : firstHeading ? richTextToPlain(firstHeading.html).slice(0, 160) : "",
      body: checklist ? checklist.description ?? "" : text2,
      ...legacy[0] ? { primaryAction: legacy[0] } : {},
      ...((_a = legacy[1]) == null ? void 0 : _a.type) === "dismiss" ? { secondaryAction: { label: legacy[1].label, type: "dismiss" } } : {}
    };
    return { html: `<section class="movcues-widget movcues-widget--${escapeAttribute(widgetType)}" data-movcues-widget-type="${escapeAttribute(widgetType)}" data-movcues-document-version="${document2.schemaVersion}"${checklist ? ' data-movcues-checklist-role="root"' : ""}>${html}</section>`, css: css.join(""), content, actionBindings };
  }
  function renderCell(cell, css, depth, survey, checklist) {
    var _a;
    const selector = `.movcues-widget [data-movcues-node-id="${cell.id}"]`;
    const sizing = cell.sizing.mode === "flexible" ? `flex:${round(cell.sizing.weight)} 1 0` : cell.sizing.mode === "hug" ? "flex:0 0 auto" : `flex:0 1 ${cell.sizing.value}px`;
    const style = cell.style ?? {};
    css.push(`${selector}{${sizing};flex-direction:${cell.direction};align-items:${cell.align};justify-content:${cell.justify};gap:${cell.gap}px;padding:${cell.padding.top}px ${cell.padding.right}px ${cell.padding.bottom}px ${cell.padding.left}px;${style.background ? `background:${style.background};` : ""}${style.borderWidth ? `border:${style.borderWidth}px solid ${style.borderColor ?? "#dbe2ea"};` : ""}${style.borderRadius ? `border-radius:${style.borderRadius}px;` : ""}}`);
    if (cell.checklistWidth !== void 0) css.push(`.movcues-widget--checklist:has([data-movcues-node-id="${cell.id}"].is-active){width:${cell.checklistWidth}px}`);
    const children = ((_a = cell.children) == null ? void 0 : _a.map((child) => renderCell(child, css, depth + 1, survey, checklist)).join("")) ?? (cell.block ? renderBlock(cell.block, css, survey, checklist) : "");
    return `<div class="movcues-cell" data-movcues-node-id="${cell.id}"${cell.checklistRole ? cell.checklistRole === "items" ? ' data-movcues-checklist-role="items"' : ` data-movcues-checklist-view="${cell.checklistRole}"` : ""} data-movcues-sizing="${cell.sizing.mode}"${cell.responsiveStack ? ' data-movcues-responsive-stack="true"' : ""}>${children}</div>`;
  }
  function renderBlock(block, css, survey, checklist) {
    const selector = `.movcues-widget [data-movcues-block-id="${block.id}"]`;
    const align = block.align ?? "left";
    if (block.type === "checklist_task" || block.type === "checklist_text" || block.type === "checklist_control" || block.type === "checklist_progress") {
      if (!checklist) throw new Error("Checklist component needs canonical context.");
      const item = block;
      css.push(`${selector}{font-size:${item.fontSize}px;text-align:${align};${item.color ? `color:${item.color};` : ""}}`);
      const attrs = `class="movcues-block" data-movcues-block-id="${block.id}"`;
      if (item.type === "checklist_task") {
        const task = checklist.items.find((value) => value.id === item.itemId);
        return `<button type="button" class="movcues-block movcues-checklist__item" data-movcues-block-id="${item.id}" data-movcues-checklist-role="item" data-movcues-checklist-item-id="${escapeChecklist(task.id)}"><span data-movcues-checklist-item-role="state">${ICONS[item.indicator]}</span><span class="movcues-checklist__copy"><span data-movcues-checklist-item-role="title">${escapeChecklist(task.title)}</span><span data-movcues-checklist-item-role="description">${escapeChecklist(task.description ?? "")}</span></span></button>`;
      }
      if (item.type === "checklist_text") return `<div ${attrs} data-movcues-checklist-role="${item.role}">${escapeChecklist(item.role === "launcher-label" && item.text !== void 0 ? item.text : checklistCopy(checklist)[item.role])}</div>`;
      if (item.type === "checklist_control") return `<button type="button" class="movcues-block movcues-checklist-control" data-movcues-block-id="${item.id}" data-movcues-checklist-role="${item.role}" aria-label="${item.role === "collapse" ? "Collapse checklist" : item.role === "dismiss" ? "Dismiss checklist" : "Acknowledge completion"}">${escapeChecklist(item.role === "collapse" ? "−" : item.role === "dismiss" ? "×" : checklist.completionMessage.acknowledgeLabel)}</button>`;
      return `<div ${attrs}><div data-movcues-checklist-role="progress"></div><div class="movcues-checklist-progress-track"><span class="movcues-checklist-progress-fill"></span></div></div>`;
    }
    if (block.type === "question") {
      css.push(`${selector}{font:${block.fontSize}px/1.5 var(--movcues-font-body,ui-sans-serif,system-ui,sans-serif);text-align:${align};${block.color ? `color:${block.color};` : ""}}`);
      return surveyQuestionMarkup(survey.questions.find((question) => question.id === block.questionId), block.id);
    }
    if (block.type === "survey_controls") return surveyControlsMarkup(block.id, (survey == null ? void 0 : survey.submitLabel) ?? "Submit");
    if (block.type === "heading") {
      css.push(`${selector}{font:${block.weight} ${block.fontSize}px/${block.lineHeight ?? 1.25} var(--movcues-font-heading,ui-sans-serif,system-ui,sans-serif);text-align:${align};${block.color ? `color:${block.color};` : ""}}`);
      return `<h${block.level} class="movcues-block movcues-heading" data-movcues-block-id="${block.id}" data-movcues-content="heading">${sanitizeRichText(block.html)}</h${block.level}>`;
    }
    if (block.type === "text") {
      css.push(`${selector}{font:${block.weight} ${block.fontSize}px/${block.lineHeight ?? 1.5} var(--movcues-font-body,ui-sans-serif,system-ui,sans-serif);text-align:${align};white-space:pre-wrap;${block.color ? `color:${block.color};` : ""}}`);
      return `<div class="movcues-block movcues-text" data-movcues-block-id="${block.id}" data-movcues-content="body">${sanitizeRichText(block.html)}</div>`;
    }
    if (block.type === "button") {
      css.push(`${selector}{align-self:${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"};padding:${block.paddingY}px ${block.paddingX}px;border-radius:${block.radius}px;${block.width === "full" ? "width:100%;" : ""}${block.background ? `background:${block.background};` : ""}${block.color ? `color:${block.color};` : ""}}`);
      return `<button type="button" class="movcues-block movcues-button movcues-button--${block.variant}${block.width === "full" ? " movcues-block--full" : ""}" data-movcues-block-id="${block.id}" data-movcues-action-id="${block.action.id}">${escapeText$2(block.label)}</button>`;
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
    if (!isOnsiteDocumentShape(value)) return { valid: false, errors: ["On-site document must use schemaVersion 2, 3 or 4 and contain one root cell."] };
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
      var _a, _b, _c, _d, _e;
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
      unexpectedKeys(cell, ["type", "id", "checklistRole", "checklistWidth", "direction", "sizing", "align", "justify", "gap", "padding", "responsiveStack", "style", "children", "block"], path, errors);
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
      if (cell.checklistWidth !== void 0 && (value.schemaVersion !== 4 || !["expanded", "launcher", "completion"].includes(cell.checklistRole ?? "") || !Number.isInteger(cell.checklistWidth) || cell.checklistWidth < 120 || cell.checklistWidth > 720)) errors.push(`${path} view width must be 120–720 pixels.`);
      if (cell.checklistRole !== void 0 && (value.schemaVersion !== 4 || !["expanded", "launcher", "completion", "items"].includes(cell.checklistRole))) errors.push(`${path} has an invalid Checklist container.`);
      if (((_e = cell.block) == null ? void 0 : _e.type.startsWith("checklist_")) && value.schemaVersion !== 4) errors.push("Checklist blocks require schemaVersion 4.");
      if (cell.block && value.schemaVersion === 2 && ["question", "survey_controls"].includes(cell.block.type)) errors.push("Survey blocks require schemaVersion 3.");
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
    const keys = { checklist_task: [...base, "itemId", "fontSize", "color", "indicator"], checklist_text: [...base, "role", "fontSize", "color", "text"], checklist_control: [...base, "role", "fontSize", "color"], checklist_progress: [...base, "fontSize", "color"], question: [...base, "questionId", "fontSize", "color"], survey_controls: base, heading: [...base, "html", "level", "fontSize", "weight", "color", "lineHeight"], text: [...base, "html", "fontSize", "weight", "color", "lineHeight"], button: [...base, "label", "action", "variant", "background", "color", "radius", "paddingX", "paddingY", "width"], image: [...base, "src", "alt", "fit", "width", "height", "radius"], divider: [...base, "orientation", "thickness", "color"], spacer: [...base, "size"], icon: [...base, "icon", "size", "color"] };
    if (!Object.prototype.hasOwnProperty.call(keys, block.type)) {
      errors.push(`${path} has an unsupported block type.`);
      return;
    }
    unexpectedKeys(block, keys[block.type], path, errors);
    if (block.align !== void 0 && !["left", "center", "right"].includes(block.align)) errors.push(`${path} has an invalid alignment.`);
    if (block.type === "checklist_task" || block.type === "checklist_text" || block.type === "checklist_control" || block.type === "checklist_progress") {
      const item = block;
      number(item.fontSize, 10, 48, `${path} font size`);
      if (item.type === "checklist_task" && (typeof item.itemId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(item.itemId) || !(item.indicator in ICONS))) errors.push(`${path} has an invalid task reference or indicator.`);
      if (item.type === "checklist_text" && (!["title", "description", "launcher-label", "remaining-count", "completion-title", "completion-description"].includes(item.role) || item.text !== void 0 && (item.role !== "launcher-label" || typeof item.text !== "string" || !item.text.trim() || item.text.length > 200))) errors.push(`${path} has an invalid Checklist text role.`);
      if (item.type === "checklist_control" && !["collapse", "dismiss", "completion-acknowledge"].includes(item.role)) errors.push(`${path} has an invalid Checklist control.`);
    } else if (block.type === "question") {
      if (typeof block.questionId !== "string" || !block.questionId.trim() || block.questionId.length > 64) errors.push(`${path} must reference a stable question ID.`);
      number(block.fontSize, 10, 36, `${path} font size`);
    } else if (block.type === "heading" || block.type === "text") {
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
      if (!onsiteImageSourceIsSafe(block.src)) errors.push(`${path} image must use a safe URL (up to 2,000 characters) or a small PNG, JPEG, WebP or GIF image (up to 64 KB encoded).`);
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
  function onsiteImageSourceIsSafe(src) {
    if (typeof src !== "string") return false;
    if (!/^data:/i.test(src)) return src.length <= ONSITE_LIMITS.maxImageUrl && builderImageUrlIsSafe(src);
    if (src.length > ONSITE_LIMITS.maxInlineImage) return false;
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(src);
    if (!match || match[2].length % 4 !== 0) return false;
    try {
      const bytes = atob(match[2]);
      switch (match[1].toLowerCase()) {
        case "png":
          return bytes.startsWith("PNG\r\n\n");
        case "jpeg":
          return bytes.startsWith("ÿØÿ");
        case "webp":
          return bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
        case "gif":
          return bytes.startsWith("GIF87a") || bytes.startsWith("GIF89a");
      }
    } catch {
    }
    return false;
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
    const bounded2 = Math.max(0.1, Math.min(1.9, Math.round(firstWeight * 20) / 20));
    a.sizing = { mode: "flexible", weight: bounded2 };
    b.sizing = { mode: "flexible", weight: 2 - bounded2 };
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
    if (cell.checklistRole) return;
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
    return !!value && typeof value === "object" && [2, 3, 4].includes(value.schemaVersion) && !!value.root && value.root.type === "cell";
  }
  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function escapeText$2(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttribute(value) {
    return escapeText$2(value).replace(/"/g, "&quot;");
  }
  function round(value) {
    return String(Math.round(value * 100) / 100);
  }
  function nextSurveyStep(survey, index, answers) {
    var _a, _b;
    const step = survey.steps[index];
    if (!step) return null;
    const rule = (_a = step.branching) == null ? void 0 : _a.rules.find((rule2) => matches(rule2, answers[rule2.questionId]));
    const destination = (rule == null ? void 0 : rule.nextStepId) ?? ((_b = step.branching) == null ? void 0 : _b.defaultNextStepId);
    if (destination === "submit") return null;
    const next = destination ? survey.steps.findIndex((step2) => step2.id === destination) : index + 1;
    return next > index && next < survey.steps.length ? next : null;
  }
  function surveyPath(survey, answers) {
    const path = [];
    let index = survey.steps.length ? 0 : null;
    while (index !== null && path.length < survey.steps.length) {
      path.push(index);
      index = nextSurveyStep(survey, index, answers);
    }
    return path;
  }
  function answersOnSurveyPath(survey, answers) {
    const ids = new Set(surveyPath(survey, answers).flatMap((index) => survey.steps[index].questions.map((question) => question.id)));
    return Object.fromEntries(Object.entries(answers).filter(([id]) => ids.has(id)));
  }
  function surveyBranchErrors(survey) {
    const errors = [];
    survey.steps.forEach((step, index) => {
      if (!step.branching) return;
      const forward = (id) => id === void 0 || id === "submit" || survey.steps.findIndex((step2) => step2.id === id) > index;
      if (!forward(step.branching.defaultNextStepId)) errors.push("Survey navigation must target a later step or Submit.");
      if (!Array.isArray(step.branching.rules) || step.branching.rules.length > 10) {
        errors.push("A Survey step supports at most 10 branch rules.");
        return;
      }
      for (const rule of step.branching.rules) {
        const question = step.questions.find((question2) => question2.id === rule.questionId);
        if (!question || !forward(rule.nextStepId) || !rule.nextStepId) {
          errors.push("A branch must use a question on its own step and a forward destination.");
          continue;
        }
        if (rule.operator === "answered") {
          if (rule.value !== void 0) errors.push("Answered conditions do not use a comparison value.");
          continue;
        }
        const choice = question.type === "single_choice" || question.type === "multiple_choice";
        const numeric = question.type === "rating" || question.type === "nps";
        if (rule.operator === "includes") {
          if (question.type !== "multiple_choice" || typeof rule.value !== "string" || !question.options.some((option) => option.id === rule.value)) errors.push("Includes needs an existing multiple-choice option.");
        } else if (rule.operator === "gte" || rule.operator === "lte") {
          if (!numeric || typeof rule.value !== "number" || !Number.isInteger(rule.value) || rule.value < (question.type === "nps" ? 0 : question.min) || rule.value > (question.type === "nps" ? 10 : question.max)) errors.push("Numeric conditions need a value in the question range.");
        } else if (rule.operator === "equals" || rule.operator === "not_equals") {
          if (question.type === "multiple_choice" || (numeric ? typeof rule.value !== "number" || !Number.isInteger(rule.value) || rule.value < (question.type === "nps" ? 0 : question.min) || rule.value > (question.type === "nps" ? 10 : question.max) : typeof rule.value !== "string") || choice && !question.options.some((option) => option.id === rule.value)) errors.push("Comparison value must match the question type and options.");
        } else errors.push("Unsupported Survey branch operator.");
      }
    });
    return errors;
  }
  function matches(rule, answer) {
    if (rule.operator === "answered") return answer !== void 0 && answer !== "" && (!Array.isArray(answer) || answer.length > 0);
    if (rule.operator === "equals") return answer === rule.value;
    if (rule.operator === "not_equals") return answer !== void 0 && answer !== rule.value;
    if (rule.operator === "includes") return Array.isArray(answer) && typeof rule.value === "string" && answer.includes(rule.value);
    if (rule.operator === "gte") return typeof answer === "number" && typeof rule.value === "number" && answer >= rule.value;
    if (rule.operator === "lte") return typeof answer === "number" && typeof rule.value === "number" && answer <= rule.value;
    return false;
  }
  function newSurveyQuestion(type) {
    const base = { id: onsiteId("question"), label: "Your question", required: false };
    if (type === "single_choice" || type === "multiple_choice") return { ...base, type, options: [{ id: onsiteId("option"), label: "Yes" }, { id: onsiteId("option"), label: "No" }] };
    if (type === "short_text" || type === "long_text") return { ...base, type, placeholder: "", maxLength: type === "short_text" ? 200 : 2e3 };
    if (type === "rating") return { ...base, type, min: 1, max: 5 };
    return { ...base, type: "nps" };
  }
  function newSurveyStep(submitLabel) {
    const step = { id: onsiteId("step"), content: { heading: "New Survey step", body: "" }, questions: [], builder: { version: 1, html: "", css: "", projectData: {} } };
    step.content = applyOnsiteDocument(step.builder, createOnsiteSurveyDocument(step.questions, step.content), "survey", { questions: step.questions, submitLabel }).content;
    return step;
  }
  function duplicateSurveyStep(source, submitLabel) {
    var _a;
    const copy = cloneOnsite(source);
    copy.id = onsiteId("step");
    const questions = /* @__PURE__ */ new Map(), options = /* @__PURE__ */ new Map();
    copy.questions.forEach((question) => {
      const old = question.id;
      question.id = onsiteId("question");
      questions.set(old, question.id);
      if ("options" in question) question.options.forEach((option) => {
        const old2 = option.id;
        option.id = onsiteId("option");
        options.set(`${question.id}:${old2}`, option.id);
      });
    });
    (_a = copy.branching) == null ? void 0 : _a.rules.forEach((rule) => {
      rule.questionId = questions.get(rule.questionId);
      const key = `${rule.questionId}:${rule.value}`;
      if (typeof rule.value === "string" && options.has(key)) rule.value = options.get(key);
    });
    const document2 = onsiteDocumentFromBuilder(copy.builder);
    if (!document2 || !copy.builder) throw new Error("This Survey step is not an on-site document.");
    const duplicated = duplicateDocument(document2);
    listBlocks(duplicated.root).forEach((block) => {
      if (block.type === "question") block.questionId = questions.get(block.questionId);
    });
    copy.content = applyOnsiteDocument(copy.builder, duplicated, "survey", { questions: copy.questions, submitLabel }).content;
    return copy;
  }
  const LABELS = { single_choice: "Single choice", multiple_choice: "Multiple choice", short_text: "Short text", long_text: "Long text", rating: "Rating", nps: "NPS" };
  class SurveyEditor {
    constructor(root, survey, options) {
      var _a, _b, _c;
      this.root = root;
      this.survey = survey;
      this.options = options;
      this.questionHost = document.createElement("div");
      this.stepHost = document.createElement("div");
      this.dock = document.createElement("div");
      this.style = document.createElement("style");
      this.onChange = (event) => {
        const input = event.target;
        if (!input.dataset || !this.options.canEdit()) return;
        const composer = this.options.composer(), step = this.survey.steps[this.options.index()], question = composer == null ? void 0 : composer.getSelectedQuestion();
        if (input.matches("[data-survey-default-next],[data-rule-question],[data-rule-operator],[data-rule-value],[data-rule-next]")) {
          const branching = cloneOnsite(step.branching ?? { rules: [] });
          if (input.matches("[data-survey-default-next]")) branching.defaultNextStepId = input.value || void 0;
          else {
            const index = Number(input.closest("[data-survey-rule]").dataset.surveyRule), rule = branching.rules[index];
            if (input.matches("[data-rule-question]")) Object.assign(rule, this.defaultRule(step.questions.find((question2) => question2.id === input.value)));
            if (input.matches("[data-rule-operator]")) {
              rule.operator = input.value;
              if (rule.operator === "answered") delete rule.value;
              else if (rule.value === void 0) rule.value = this.defaultRule(step.questions.find((question2) => question2.id === rule.questionId)).value;
            }
            if (input.matches("[data-rule-next]")) rule.nextStepId = input.value;
            if (input.matches("[data-rule-value]")) {
              const question2 = step.questions.find((question3) => question3.id === rule.questionId);
              rule.value = question2.type === "rating" || question2.type === "nps" ? Number(input.value) : input.value;
            }
          }
          composer == null ? void 0 : composer.updateBranching(branching);
          this.sync();
          return;
        }
        if (input.matches("[data-survey-allow-back],[data-survey-show-progress],[data-survey-submit-label]")) {
          if (!this.options.flush()) return;
          if (input.matches("[data-survey-submit-label]") && !input.value.trim()) {
            this.options.error(["Submit label cannot be empty."]);
            return;
          }
          this.survey.allowBack = this.root.querySelector("[data-survey-allow-back]").checked;
          this.survey.showProgress = this.root.querySelector("[data-survey-show-progress]").checked;
          this.survey.submitLabel = this.root.querySelector("[data-survey-submit-label]").value.trim();
          this.recompile();
          composer == null ? void 0 : composer.refreshSurvey();
          this.options.changed();
          return;
        }
        if (input.matches("[data-survey-step-heading]")) {
          composer == null ? void 0 : composer.updateStepHeading(input.value);
          this.sync();
          return;
        }
        if (!question || !composer || !this.questionHost.contains(input)) return;
        if (input.matches("[data-survey-font-size]")) {
          composer.updateBlock({ fontSize: Number(input.value) });
          return;
        }
        if (input.matches("[data-survey-question-color]")) {
          composer.updateBlock({ color: input.value });
          return;
        }
        const next = cloneOnsite(question);
        const value = input.matches("[data-survey-question-type]") ? { ...newSurveyQuestion(input.value), id: question.id, label: question.label, required: question.required } : next;
        if (input.matches("[data-survey-question-label]")) value.label = input.value;
        if (input.matches("[data-survey-question-required]")) value.required = input.checked;
        if ("options" in value && input.matches("[data-survey-options]")) {
          const existing = value.options;
          value.options = input.value.split("\n").map((label, index) => {
            var _a2;
            return { id: ((_a2 = existing[index]) == null ? void 0 : _a2.id) ?? onsiteId("option"), label };
          });
        }
        if (value.type === "short_text" || value.type === "long_text") {
          if (input.matches("[data-survey-placeholder]")) value.placeholder = input.value;
          if (input.matches("[data-survey-max-length]")) value.maxLength = Number(input.value);
        }
        if (value.type === "rating") {
          if (input.matches("[data-survey-rating-min]")) value.min = Number(input.value);
          if (input.matches("[data-survey-rating-max]")) value.max = Number(input.value);
        }
        composer.updateQuestion(value);
        this.sync();
      };
      this.onClick = (event) => {
        var _a2;
        const target = event.target instanceof Element ? event.target.closest("button") : null;
        if (!target || !this.options.canEdit()) return;
        const step = this.survey.steps[this.options.index()], composer = this.options.composer();
        if (target.matches("[data-survey-add-rule]")) {
          if (!step.questions.length) return;
          composer == null ? void 0 : composer.updateBranching({ ...step.branching, rules: [...((_a2 = step.branching) == null ? void 0 : _a2.rules) ?? [], this.defaultRule(step.questions[0])] });
          this.sync();
          return;
        }
        if (target.matches("[data-survey-remove-rule]")) {
          composer == null ? void 0 : composer.updateBranching({ ...step.branching, rules: step.branching.rules.filter((_, index2) => index2 !== Number(target.dataset.surveyRemoveRule)) });
          this.sync();
          return;
        }
        if (!this.dock.contains(target) || !this.options.flush()) return;
        let index = this.options.index();
        const steps = cloneOnsite(this.survey.steps);
        if (target.matches("[data-survey-add-step]")) {
          if (steps.length >= 20) return;
          steps.push(newSurveyStep(this.survey.submitLabel));
          index = steps.length - 1;
        }
        if (target.matches("[data-survey-duplicate-step]")) {
          if (steps.length >= 20) return;
          steps.splice(index + 1, 0, duplicateSurveyStep(steps[index], this.survey.submitLabel));
          index++;
        }
        if (target.matches("[data-survey-move]")) {
          const next = index + Number(target.dataset.surveyMove);
          if (next < 0 || next >= steps.length) return;
          [steps[index], steps[next]] = [steps[next], steps[index]];
          index = next;
        }
        if (target.matches("[data-survey-delete-step]")) {
          if (steps.length === 1) return;
          const removed = steps.splice(index, 1)[0].id;
          index = Math.min(index, steps.length - 1);
          steps.forEach((step2) => {
            if (step2.branching) {
              step2.branching.rules = step2.branching.rules.filter((rule) => rule.nextStepId !== removed);
              if (step2.branching.defaultNextStepId === removed) delete step2.branching.defaultNextStepId;
            }
          });
        }
        const errors = surveyBranchErrors({ ...this.survey, steps });
        if (errors.length) {
          this.options.error(errors);
          return;
        }
        this.survey.steps = steps;
        this.dock.querySelector("details").open = false;
        this.options.stepsChanged(index);
      };
      this.questionHost.dataset.block = "question";
      this.questionHost.hidden = true;
      this.questionHost.innerHTML = `<label>Question type<select data-survey-question-type>${QUESTION_TYPES.map((type) => `<option value="${type}">${LABELS[type]}</option>`).join("")}</select></label><label>Question label<input data-survey-question-label aria-label="Question label" maxlength="500"></label><label class="check"><input type="checkbox" data-survey-question-required> Required</label><label data-question-options>Choices (one per line)<textarea data-survey-options rows="4" maxlength="4000"></textarea></label><div data-question-text><label>Placeholder<input data-survey-placeholder maxlength="500"></label><label>Answer length limit<input type="number" data-survey-max-length min="1" max="10000"></label></div><div data-question-rating><label>Minimum<input type="number" data-survey-rating-min min="0" max="99"></label><label>Maximum<input type="number" data-survey-rating-max min="1" max="100"></label></div><label>Question font size<input data-survey-font-size type="number" min="10" max="36"></label><label>Question color<input data-survey-question-color type="color"></label>`;
      this.stepHost.dataset.surveyStepInspector = "";
      this.stepHost.innerHTML = '<label>Survey step heading<input data-survey-step-heading maxlength="160"></label><label class="check"><input type="checkbox" data-survey-allow-back> Allow Back</label><label class="check"><input type="checkbox" data-survey-show-progress> Show progress</label><label>Submit label<input data-survey-submit-label maxlength="80"></label><details data-survey-branch-section><summary>After this step</summary><label>Default next step<select data-survey-default-next></select></label><div data-survey-rules></div><button type="button" class="secondary-button" data-survey-add-rule>Add answer rule</button><small>First matching rule wins. Destinations can only move forward.</small></details>';
      this.dock.dataset.surveyDock = "";
      this.dock.innerHTML = '<button type="button" class="secondary-button compact" data-survey-add-step aria-label="Add Survey step">＋</button><details><summary aria-label="Survey step actions">⋯</summary><div><button type="button" data-survey-duplicate-step>Duplicate step</button><button type="button" data-survey-move="-1">Move step earlier</button><button type="button" data-survey-move="1">Move step later</button><button type="button" data-survey-delete-step>Delete step</button></div></details>';
      this.style.textContent = "[data-survey-step-inspector],[data-block=question]{display:grid;gap:8px}[data-survey-options]{box-sizing:border-box;width:100%;border:1px solid #d7dce3;border-radius:6px;padding:7px;font:12px/1.5 ui-sans-serif,system-ui}[data-survey-branch-section]>summary{cursor:pointer;font-weight:600;margin:4px 0 8px}[data-survey-rule]{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;padding:8px 0;border-top:1px solid #e5e7eb}[data-survey-step-inspector] small{display:block;color:#64748b;font-size:11px;margin-top:6px}.step-navigator>[data-survey-dock]{display:flex;flex:none;gap:4px;align-items:center}[data-survey-dock][hidden]{display:none!important}[data-survey-dock] details>summary{list-style:none;cursor:pointer;border:1px solid #d7dce3;border-radius:6px;padding:3px 7px}[data-survey-dock] details>div{position:absolute;bottom:calc(100% + 6px);right:4px;display:grid;gap:4px;min-width:150px;padding:6px;background:#fff;border:1px solid #d7dce3;border-radius:8px;box-shadow:0 4px 18px #0f172a20}[data-survey-dock] details button{border:0;background:#fff;padding:7px;text-align:left;font:12px ui-sans-serif,system-ui;cursor:pointer}";
      (_a = root.querySelector("[data-inspector=block]")) == null ? void 0 : _a.append(this.questionHost);
      (_b = root.querySelector("[data-inspector=step]")) == null ? void 0 : _b.append(this.stepHost);
      (_c = root.querySelector("[data-guide]")) == null ? void 0 : _c.append(this.dock);
      root.append(this.style);
      root.addEventListener("change", this.onChange);
      root.addEventListener("click", this.onClick);
    }
    sync() {
      var _a, _b, _c;
      const step = this.survey.steps[this.options.index()], composer = this.options.composer();
      if (!step) return;
      this.dock.hidden = !this.options.canEdit();
      this.value("[data-survey-step-heading]", step.content.heading);
      this.check("[data-survey-allow-back]", this.survey.allowBack);
      this.check("[data-survey-show-progress]", this.survey.showProgress);
      this.value("[data-survey-submit-label]", this.survey.submitLabel);
      this.root.querySelectorAll("[data-step] small").forEach((label, index) => {
        if (this.survey.steps[index]) label.textContent = this.survey.steps[index].content.heading || `Step ${index + 1}`;
      });
      const question = composer == null ? void 0 : composer.getSelectedQuestion();
      this.questionHost.hidden = !question;
      if (question) {
        this.value("[data-survey-question-type]", question.type);
        this.value("[data-survey-question-label]", question.label);
        this.check("[data-survey-question-required]", Boolean(question.required));
        this.questionHost.querySelector("[data-question-options]").hidden = !("options" in question);
        this.questionHost.querySelector("[data-question-text]").hidden = !["short_text", "long_text"].includes(question.type);
        this.questionHost.querySelector("[data-question-rating]").hidden = question.type !== "rating";
        if ("options" in question) this.value("[data-survey-options]", question.options.map((option) => option.label).join("\n"));
        if (question.type === "short_text" || question.type === "long_text") {
          this.value("[data-survey-placeholder]", question.placeholder ?? "");
          this.value("[data-survey-max-length]", String(question.maxLength ?? 1e4));
        }
        if (question.type === "rating") {
          this.value("[data-survey-rating-min]", String(question.min));
          this.value("[data-survey-rating-max]", String(question.max));
        }
        const block = composer == null ? void 0 : composer.getSelectedBlock();
        if ((block == null ? void 0 : block.type) === "question") {
          this.value("[data-survey-font-size]", String(block.fontSize));
          this.value("[data-survey-question-color]", block.color ?? "#111827");
        }
      }
      const select = this.root.querySelector("[data-survey-default-next]");
      const choices = this.destinations();
      const markup = '<option value="">Next in order</option>' + choices;
      if (select.innerHTML !== markup) select.innerHTML = markup;
      this.value("[data-survey-default-next]", ((_a = step.branching) == null ? void 0 : _a.defaultNextStepId) ?? "");
      const rules = this.root.querySelector("[data-survey-rules]");
      const signature = JSON.stringify([step.id, step.questions, step.branching, this.survey.steps.map((step2) => [step2.id, step2.content.heading])]);
      if (rules.dataset.signature !== signature) {
        rules.dataset.signature = signature;
        rules.innerHTML = (((_b = step.branching) == null ? void 0 : _b.rules) ?? []).map((rule, index) => this.ruleMarkup(rule, index)).join("");
      }
      this.root.querySelector("[data-survey-add-rule]").disabled = !step.questions.length || (((_c = step.branching) == null ? void 0 : _c.rules.length) ?? 0) >= 10;
    }
    destinations() {
      return this.survey.steps.slice(this.options.index() + 1).map((step, offset) => `<option value="${escape(step.id)}">${this.options.index() + offset + 2}. ${escape(step.content.heading || "Survey step")}</option>`).join("") + '<option value="submit">Submit Survey</option>';
    }
    ruleMarkup(rule, index) {
      const questions = this.survey.steps[this.options.index()].questions, question = questions.find((question2) => question2.id === rule.questionId);
      const operators = (question == null ? void 0 : question.type) === "multiple_choice" ? [["includes", "includes"], ["answered", "has an answer"]] : (question == null ? void 0 : question.type) === "rating" || (question == null ? void 0 : question.type) === "nps" ? [["equals", "equals"], ["not_equals", "does not equal"], ["gte", "is at least"], ["lte", "is at most"], ["answered", "has an answer"]] : [["equals", "equals"], ["not_equals", "does not equal"], ["answered", "has an answer"]];
      const value = rule.operator === "answered" ? "" : question && "options" in question ? `<label>Answer<select data-rule-value>${question.options.map((option) => `<option value="${escape(option.id)}"${rule.value === option.id ? " selected" : ""}>${escape(option.label)}</option>`).join("")}</select></label>` : `<label>Answer<input data-rule-value value="${escape(String(rule.value ?? ""))}"${(question == null ? void 0 : question.type) === "rating" || (question == null ? void 0 : question.type) === "nps" ? ' type="number"' : ""}></label>`;
      return `<div data-survey-rule="${index}"><label>Question<select data-rule-question>${questions.map((question2) => `<option value="${escape(question2.id)}"${question2.id === rule.questionId ? " selected" : ""}>${escape(question2.label)}</option>`).join("")}</select></label><label>Condition<select data-rule-operator>${operators.map(([key, label]) => `<option value="${key}"${key === rule.operator ? " selected" : ""}>${label}</option>`).join("")}</select></label>${value}<label>Go to<select data-rule-next>${this.destinations().replace(`value="${escape(rule.nextStepId)}"`, `value="${escape(rule.nextStepId)}" selected`)}</select></label><button class="secondary-button compact" type="button" data-survey-remove-rule="${index}">Remove rule</button></div>`;
    }
    defaultRule(question) {
      var _a;
      return { questionId: question.id, operator: question.type === "multiple_choice" ? "includes" : "equals", value: "options" in question ? question.options[0].id : question.type === "rating" ? question.min : question.type === "nps" ? 0 : "", nextStepId: ((_a = this.survey.steps[this.options.index() + 1]) == null ? void 0 : _a.id) ?? "submit" };
    }
    recompile() {
      this.survey.steps.forEach((step) => {
        const doc = onsiteDocumentFromBuilder(step.builder);
        if (doc && step.builder) Object.assign(step.content, applyOnsiteDocument(step.builder, doc, "survey", { questions: step.questions, submitLabel: this.survey.submitLabel }).content);
      });
    }
    value(selector, value) {
      const input = this.root.querySelector(selector);
      if (input && this.root.activeElement !== input) input.value = value;
    }
    check(selector, value) {
      const input = this.root.querySelector(selector);
      if (input) input.checked = value;
    }
    destroy() {
      this.root.removeEventListener("change", this.onChange);
      this.root.removeEventListener("click", this.onClick);
      this.questionHost.remove();
      this.stepHost.remove();
      this.dock.remove();
      this.style.remove();
    }
  }
  function escape(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  const EDITOR_CONTINUATION_KEY = "__movcues_experience_editor_session__";
  function storeEditorContinuation(continuation) {
    try {
      sessionStorage.setItem(EDITOR_CONTINUATION_KEY, JSON.stringify(continuation));
    } catch {
    }
  }
  function clearEditorContinuation() {
    try {
      sessionStorage.removeItem(EDITOR_CONTINUATION_KEY);
    } catch {
    }
  }
  class RouteObserver {
    constructor() {
      this.listeners = /* @__PURE__ */ new Set();
      this.lastUrl = location.href;
      this.installed = false;
      this.originalPushState = history.pushState;
      this.originalReplaceState = history.replaceState;
      this.onPopState = () => this.checkForChange();
      this.onHashChange = () => this.checkForChange();
    }
    start() {
      if (this.installed) return;
      this.installed = true;
      const self = this;
      history.pushState = function(...args) {
        const result = self.originalPushState.apply(this, args);
        self.checkForChange();
        return result;
      };
      history.replaceState = function(...args) {
        const result = self.originalReplaceState.apply(this, args);
        self.checkForChange();
        return result;
      };
      window.addEventListener("popstate", this.onPopState);
      window.addEventListener("hashchange", this.onHashChange);
    }
    stop() {
      if (!this.installed) return;
      this.installed = false;
      history.pushState = this.originalPushState;
      history.replaceState = this.originalReplaceState;
      window.removeEventListener("popstate", this.onPopState);
      window.removeEventListener("hashchange", this.onHashChange);
    }
    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    checkForChange() {
      setTimeout(() => {
        const url = location.href;
        if (url !== this.lastUrl) {
          this.lastUrl = url;
          for (const fn of this.listeners) {
            try {
              fn(url);
            } catch {
            }
          }
        }
      }, 0);
    }
  }
  const WIDGET_SIZE_CONSTRAINTS = {
    anchored_card: { width: { default: 320, min: 240, max: 480 }, height: { allowFixed: true, min: 120, max: 700 }, viewportGutter: 24 },
    toast: { width: { default: 380, min: 280, max: 520 }, height: {}, viewportGutter: 24 },
    cursor_follow: { width: { default: 280, min: 200, max: 360 }, height: {}, viewportGutter: 24 },
    modal: { width: { default: 600, min: 320, max: 960, allowFull: true }, height: { allowFixed: true, allowViewport: true, min: 200, max: 900 }, viewportGutter: 24 },
    slideout: { width: { default: 400, min: 320, max: 640 }, height: { allowFixed: true, allowViewport: true, min: 240, max: 900 }, viewportGutter: 24 },
    hotspot: { width: { default: 300, min: 220, max: 420 }, height: {}, viewportGutter: 24 },
    banner: { width: { default: "full" }, height: {}, viewportGutter: 0 },
    survey: { width: { default: 700, min: 320, max: 960, allowFull: true }, height: { allowFixed: true, allowViewport: true, min: 200, max: 900 }, viewportGutter: 24 }
  };
  function normalizeWidgetSize(widgetType, design) {
    var _a, _b;
    const constraint = WIDGET_SIZE_CONSTRAINTS[widgetType];
    if (widgetType === "banner") return { width: { mode: "full" }, height: { mode: "auto" } };
    const legacyValue = design.width === "sm" ? constraint.width.min : design.width === "lg" ? constraint.width.max : constraint.width.default;
    const requestedWidth = (_a = design.size) == null ? void 0 : _a.width;
    const width = (requestedWidth == null ? void 0 : requestedWidth.mode) === "full" && constraint.width.allowFull ? { mode: "full" } : { mode: "fixed", value: clamp$1((requestedWidth == null ? void 0 : requestedWidth.value) ?? legacyValue, constraint.width.min, constraint.width.max) };
    const requestedHeight = (_b = design.size) == null ? void 0 : _b.height;
    const height = (requestedHeight == null ? void 0 : requestedHeight.mode) === "fixed" && constraint.height.allowFixed ? { mode: "fixed", value: clamp$1(requestedHeight.value ?? constraint.height.min, constraint.height.min, constraint.height.max) } : (requestedHeight == null ? void 0 : requestedHeight.mode) === "viewport" && constraint.height.allowViewport ? { mode: "viewport" } : { mode: "auto" };
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
    card.style.overflow = "visible";
  }
  function applyBuilderSizeContent(card, widgetType, design) {
    const content = card.querySelector(".builder-content");
    const widget = content == null ? void 0 : content.querySelector(":scope > .movcues-widget");
    if (!content || !widget) return;
    const size = normalizeWidgetSize(widgetType, design);
    const fillsHeight = size.height.mode !== "auto";
    content.style.width = "100%";
    content.style.height = fillsHeight ? "100%" : "auto";
    widget.style.setProperty("box-sizing", "border-box");
    widget.style.setProperty("min-width", "0", "important");
    widget.style.setProperty("max-width", "100%", "important");
    widget.style.setProperty("height", fillsHeight ? "100%" : "auto", "important");
    widget.style.setProperty("max-height", fillsHeight ? "100%" : "none", "important");
  }
  function clamp$1(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
  }
  const PANEL_NAMES = ["top", "right", "bottom", "left"];
  const SCROLL_KEYS = /* @__PURE__ */ new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);
  let scrollLockCount = 0;
  let scrollLockCleanup = null;
  class AnchoredTargetBackdrop {
    constructor(root, card, behavior, design, onDismiss) {
      this.panels = [];
      this.releaseScrollLock = lockDocumentScroll();
      const opacity = finiteClamp(behavior.backdropOpacity ?? 0.45, 0, 1);
      this.panels = PANEL_NAMES.map((name) => {
        const panel = document.createElement("div");
        panel.dataset.movcuesTargetBackdrop = name;
        panel.style.cssText = `position:fixed;box-sizing:border-box;background:rgba(0,0,0,${opacity});pointer-events:auto`;
        if (behavior.closeOnBackdrop && behavior.dismissible) panel.addEventListener("click", onDismiss);
        root.insertBefore(panel, card);
        return panel;
      });
      this.highlight = document.createElement("div");
      this.highlight.dataset.movcuesTargetHighlight = "";
      this.highlight.style.cssText = "position:fixed;box-sizing:border-box;border-radius:4px;pointer-events:none";
      this.highlight.style.outline = `2px solid ${design.theme.primary}`;
      root.insertBefore(this.highlight, card);
    }
    update(rect) {
      const viewportWidth = Math.max(0, innerWidth);
      const viewportHeight = Math.max(0, innerHeight);
      const left = finiteClamp(rect.left, 0, viewportWidth);
      const right = finiteClamp(rect.right, 0, viewportWidth);
      const top = finiteClamp(rect.top, 0, viewportHeight);
      const bottom = finiteClamp(rect.bottom, 0, viewportHeight);
      const middleHeight = Math.max(0, bottom - top);
      setRect(this.panels[0], 0, 0, viewportWidth, top);
      setRect(this.panels[1], right, top, Math.max(0, viewportWidth - right), middleHeight);
      setRect(this.panels[2], 0, bottom, viewportWidth, Math.max(0, viewportHeight - bottom));
      setRect(this.panels[3], 0, top, left, middleHeight);
      setRect(this.highlight, rect.left, rect.top, Math.max(0, rect.width), Math.max(0, rect.height));
    }
    setHidden(hidden) {
      var _a;
      if (hidden) {
        (_a = this.releaseScrollLock) == null ? void 0 : _a.call(this);
        this.releaseScrollLock = null;
      } else if (!this.releaseScrollLock) this.releaseScrollLock = lockDocumentScroll();
      const visibility = hidden ? "hidden" : "";
      this.panels.forEach((panel) => {
        panel.style.visibility = visibility;
      });
      this.highlight.style.visibility = visibility;
    }
    destroy() {
      var _a;
      (_a = this.releaseScrollLock) == null ? void 0 : _a.call(this);
      this.releaseScrollLock = null;
      this.panels.forEach((panel) => panel.remove());
      this.panels = [];
      this.highlight.remove();
    }
  }
  function lockDocumentScroll() {
    var _a;
    scrollLockCount += 1;
    if (scrollLockCount === 1) {
      const rootStyle = captureProperty(document.documentElement.style, "overflow");
      const bodyStyle = document.body ? captureProperty(document.body.style, "overflow") : null;
      document.documentElement.style.setProperty("overflow", "hidden", "important");
      (_a = document.body) == null ? void 0 : _a.style.setProperty("overflow", "hidden", "important");
      const preventScroll = (event) => {
        const delta = event instanceof WheelEvent ? event.deltaY : 0;
        if (event.composedPath().some((node) => node instanceof HTMLElement && node !== document.body && node !== document.documentElement && /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight && (!delta || (delta > 0 ? node.scrollTop + node.clientHeight < node.scrollHeight : node.scrollTop > 0)))) return;
        if (event.cancelable) event.preventDefault();
      };
      const preventScrollKey = (event) => {
        if (!SCROLL_KEYS.has(event.key) || event.composedPath().some(isEditableControl)) return;
        if (event.cancelable) event.preventDefault();
      };
      document.addEventListener("wheel", preventScroll, { capture: true, passive: false });
      document.addEventListener("touchmove", preventScroll, { capture: true, passive: false });
      document.addEventListener("keydown", preventScrollKey, true);
      scrollLockCleanup = () => {
        document.removeEventListener("wheel", preventScroll, true);
        document.removeEventListener("touchmove", preventScroll, true);
        document.removeEventListener("keydown", preventScrollKey, true);
        restoreProperty(document.documentElement.style, "overflow", rootStyle);
        if (bodyStyle && document.body) restoreProperty(document.body.style, "overflow", bodyStyle);
      };
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) {
        scrollLockCleanup == null ? void 0 : scrollLockCleanup();
        scrollLockCleanup = null;
      }
    };
  }
  function isEditableControl(target) {
    return target instanceof Element && Boolean(target.closest("input,textarea,select,button,[contenteditable]:not([contenteditable='false'])"));
  }
  function captureProperty(style, property2) {
    return { value: style.getPropertyValue(property2), priority: style.getPropertyPriority(property2) };
  }
  function restoreProperty(style, property2, captured) {
    if (captured.value) style.setProperty(property2, captured.value, captured.priority);
    else style.removeProperty(property2);
  }
  function setRect(element, left, top, width, height) {
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
  }
  function finiteClamp(value, minimum, maximum) {
    return Number.isFinite(value) ? Math.max(minimum, Math.min(value, maximum)) : minimum;
  }
  function findTarget(target) {
    if (!target) return null;
    for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
      try {
        const matches2 = document.querySelectorAll(selector);
        if (matches2.length === 1) return matches2[0];
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
    let frameId = null;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      observer == null ? void 0 : observer.disconnect();
      clearTimeout(timer);
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    };
    const check = () => {
      if (stopped) return;
      const element = findTarget(target);
      if (element) {
        stop();
        onFound(element);
      }
    };
    const scheduleCheck = () => {
      if (stopped || frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        check();
      });
    };
    if (typeof MutationObserver === "undefined" || !document.documentElement) {
      timer = window.setTimeout(() => {
        stop();
        onUnavailable();
      }, timeoutMs);
      return stop;
    }
    observer = new MutationObserver(scheduleCheck);
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
    var _a, _b;
    const card = document.createElement("section");
    card.className = "card";
    card.style.setProperty("--movcues-bg", design.theme.background);
    card.style.setProperty("--movcues-fg", design.theme.foreground);
    card.style.setProperty("--movcues-primary", design.theme.primary);
    if (design.theme.spacing !== void 0) card.style.setProperty("--movcues-theme-spacing", `${design.theme.spacing}px`);
    const theme = design.theme.siteTheme;
    if (theme) {
      card.style.setProperty("--movcues-surface", theme.colors.surface);
      card.style.setProperty("--movcues-muted", theme.colors.mutedText);
      card.style.setProperty("--movcues-border", theme.colors.border);
      card.style.setProperty("--movcues-primary-fg", theme.colors.primaryForeground);
      card.style.setProperty("--movcues-font-body", theme.typography.bodyFontFamily);
      card.style.setProperty("--movcues-font-heading", theme.typography.headingFontFamily);
      card.style.setProperty("--movcues-font-body-size", `${theme.typography.bodyFontSize}px`);
      card.style.setProperty("--movcues-font-heading-size", `${theme.typography.headingFontSize}px`);
      card.style.setProperty("--movcues-theme-radius", `${theme.radii.lg}px`);
      card.style.setProperty("--movcues-button-radius", `${theme.radii.md}px`);
      const shadow2 = theme.shadows.md;
      card.style.setProperty("--movcues-theme-shadow", `${shadow2.x}px ${shadow2.y}px ${shadow2.blur}px ${shadow2.spread}px ${shadow2.color}`);
    }
    card.dataset.width = design.width;
    card.dataset.radius = design.theme.borderRadius;
    if (widgetType) applyWidgetSizeEnvelope(card, widgetType, design);
    const mountedBuilder = Boolean(builder && mountBuilderContent(root, card, builder, callbacks, widgetType === "survey"));
    if (mountedBuilder && widgetType) applyBuilderSizeContent(card, widgetType, design);
    if (!mountedBuilder) {
      const primary = content.primaryAction ? `<button class="primary" data-primary>${escapeText$1(content.primaryAction.label)}</button>` : "";
      const secondary = content.secondaryAction ? `<button class="secondary" data-secondary>${escapeText$1(content.secondaryAction.label)}</button>` : "";
      card.insertAdjacentHTML("beforeend", `<div class="legacy-content"><h2>${escapeText$1(content.heading)}</h2><p>${escapeText$1(content.body)}</p><footer>${secondary}${primary}</footer></div>`);
      (_a = card.querySelector("[data-primary]")) == null ? void 0 : _a.addEventListener("click", callbacks.onPrimary);
      (_b = card.querySelector("[data-secondary]")) == null ? void 0 : _b.addEventListener("click", callbacks.onSecondary);
    }
    if (behavior.dismissible) mountRuntimeDismissControl(card, callbacks.onDismiss);
    root.appendChild(card);
    if (mountedBuilder && widgetType) fitBuilderWidthEnvelope(card);
    if (mountedBuilder && widgetType === "anchored_card") fitAnchoredBuilderEnvelope(card);
    return card;
  }
  function mountRuntimeDismissControl(card, onDismiss) {
    const chrome = document.createElement("div");
    chrome.className = "movcues-runtime-chrome";
    chrome.dataset.movcuesRuntimeChrome = "dismiss";
    chrome.style.setProperty("position", "absolute", "important");
    chrome.style.setProperty("inset", "0", "important");
    chrome.style.setProperty("z-index", "2", "important");
    chrome.style.setProperty("pointer-events", "none", "important");
    const chromeRoot = chrome.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `:host{all:initial;color:inherit}button{position:absolute;top:7px;right:8px;display:block;box-sizing:border-box;flex:none;margin:0;border:0;border-radius:7px;padding:3px 7px;background:transparent;color:inherit;font:20px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;pointer-events:auto}`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "movcues-runtime-close";
    close.dataset.dismiss = "";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", onDismiss);
    chromeRoot.append(style, close);
    card.appendChild(chrome);
  }
  function fitAnchoredBuilderEnvelope(card) {
    const widget = card.querySelector(".builder-content > .movcues-widget");
    if (!widget) return;
    const cardRect = card.getBoundingClientRect();
    const widgetRect = widget.getBoundingClientRect();
    if (widgetRect.width > 0 && cardRect.width - widgetRect.width > 0.5) card.style.width = `${Math.ceil(widgetRect.width)}px`;
    if (widgetRect.height > 0 && cardRect.height - widgetRect.height > 0.5) card.style.height = `${Math.ceil(widgetRect.height)}px`;
  }
  function fitBuilderWidthEnvelope(card) {
    const widget = card.querySelector(".builder-content > .movcues-widget");
    if (!widget) return;
    const widgetRect = widget.getBoundingClientRect();
    if (widgetRect.width <= 0) return;
    card.style.width = `${Math.ceil(widgetRect.width)}px`;
    card.style.minWidth = "0";
  }
  class AnchoredCardRenderer {
    constructor() {
      this.cleanup = [];
    }
    render(root, target, content, design, behavior, callbacks, builder, widgetType) {
      var _a;
      this.destroy();
      const card = buildCard(root, content, design, behavior, callbacks, builder, widgetType);
      const pointer = ((_a = behavior.pointer) == null ? void 0 : _a.enabled) === false ? null : buildPointer(card, design, behavior);
      const backdrop = behavior.backdrop ? new AnchoredTargetBackdrop(root, card, behavior, design, callbacks.onDismiss) : null;
      let frameId = null;
      let destroyed = false;
      let hidden = false;
      let resolvedPlacement = null;
      let cardSize = null;
      let measureCard = true;
      let lastLeft = null;
      let lastTop = null;
      const setHidden = (next) => {
        if (hidden === next) return;
        hidden = next;
        card.style.visibility = next ? "hidden" : "";
        card.style.pointerEvents = next ? "none" : "";
        backdrop == null ? void 0 : backdrop.setHidden(next);
      };
      const update = () => {
        if (destroyed) return;
        if (!target.isConnected) {
          setHidden(true);
          return;
        }
        const rect = target.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          setHidden(true);
          return;
        }
        backdrop == null ? void 0 : backdrop.update(rect);
        if (measureCard || !cardSize) {
          const bounds2 = card.getBoundingClientRect();
          cardSize = { width: bounds2.width, height: bounds2.height };
          measureCard = false;
        }
        const bounds = cardSize;
        if (!resolvedPlacement) resolvedPlacement = resolvePlacement(rect, bounds, behavior);
        const coordinates = coordinatesFor(rect, bounds, behavior, resolvedPlacement);
        const naturalCardRect = rectAt(coordinates.left, coordinates.top, bounds.width, bounds.height);
        if (!intersectsViewport(rect) && !intersectsViewport(naturalCardRect)) {
          setHidden(true);
          return;
        }
        setHidden(false);
        const left = clampHorizontally(coordinates.left, bounds.width);
        if (pointer) positionPointer(pointer, rect, bounds, left, coordinates.top, resolvedPlacement, behavior);
        if (left !== lastLeft) {
          lastLeft = left;
          card.style.left = `${left}px`;
        }
        if (coordinates.top !== lastTop) {
          lastTop = coordinates.top;
          card.style.top = `${coordinates.top}px`;
        }
      };
      const schedule = (reconsiderPlacement = false, remeasureCard = false) => {
        if (destroyed) return;
        if (reconsiderPlacement && isAutomaticPlacement(behavior)) resolvedPlacement = null;
        if (remeasureCard) measureCard = true;
        if (frameId !== null) return;
        frameId = requestAnimationFrame(() => {
          frameId = null;
          update();
        });
      };
      const onScroll = (event) => {
        const scrollContainer = event.target;
        if (target.isConnected && scrollContainer instanceof Element && !scrollContainer.contains(target)) return;
        schedule();
      };
      const onResize = () => schedule(true, true);
      window.addEventListener("scroll", onScroll, { capture: true, passive: true });
      window.addEventListener("resize", onResize);
      this.cleanup.push(
        () => window.removeEventListener("scroll", onScroll, true),
        () => window.removeEventListener("resize", onResize),
        () => {
          destroyed = true;
          if (frameId !== null) cancelAnimationFrame(frameId);
          frameId = null;
        },
        () => backdrop == null ? void 0 : backdrop.destroy()
      );
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver((entries) => schedule(true, entries.some((entry) => entry.target === card)));
        observer.observe(target);
        observer.observe(card);
        this.cleanup.push(() => observer.disconnect());
      }
      update();
      return card;
    }
    destroy() {
      this.cleanup.splice(0).forEach((fn) => fn());
    }
  }
  function buildPointer(card, design, behavior) {
    const pointer = document.createElement("span");
    const size = pointerSize(behavior);
    pointer.className = "movcues-anchor-pointer";
    pointer.setAttribute("aria-hidden", "true");
    pointer.style.setProperty("--movcues-pointer-size", `${size}px`);
    pointer.style.color = pointerColor(card, design);
    pointer.innerHTML = '<svg viewBox="0 0 10 10" focusable="false" aria-hidden="true"><path d="M5 0 10 10H0Z" fill="currentColor"/></svg>';
    card.prepend(pointer);
    return pointer;
  }
  function pointerColor(card, design) {
    const widget = card.querySelector(".movcues-widget");
    if (!widget) return design.theme.background;
    const background = getComputedStyle(widget).backgroundColor.trim();
    return isTransparent(background) ? design.theme.background : background;
  }
  function isTransparent(color) {
    return !color || color.toLowerCase() === "transparent" || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color);
  }
  function positionPointer(pointer, targetRect, cardSize, finalLeft, finalTop, placement, behavior) {
    const size = pointerSize(behavior);
    const edgePadding = Math.max(size + 6, 14);
    pointer.dataset.placement = placement;
    if (placement === "top" || placement === "bottom") {
      const center = clamp(targetRect.left + targetRect.width / 2 - finalLeft, edgePadding, cardSize.width - edgePadding);
      pointer.style.left = `${center}px`;
      pointer.style.top = "";
    } else {
      const center = clamp(targetRect.top + targetRect.height / 2 - finalTop, edgePadding, cardSize.height - edgePadding);
      pointer.style.top = `${center}px`;
      pointer.style.left = "";
    }
  }
  function pointerSize(behavior) {
    var _a;
    const requested = ((_a = behavior.pointer) == null ? void 0 : _a.size) ?? 10;
    return Number.isFinite(requested) ? clamp(Math.round(requested), 4, 30) : 10;
  }
  function clamp(value, minimum, maximum) {
    if (maximum < minimum) return maximum / 2;
    return Math.max(minimum, Math.min(value, maximum));
  }
  function isAutomaticPlacement(behavior) {
    return !behavior.placement || behavior.placement === "auto";
  }
  function resolvePlacement(rect, bounds, behavior) {
    if (!isAutomaticPlacement(behavior)) return behavior.placement;
    const gap = behavior.offset ?? 8;
    const spaceBelow = innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    if (spaceBelow >= bounds.height) return "bottom";
    if (spaceAbove >= bounds.height) return "top";
    return spaceBelow >= spaceAbove ? "bottom" : "top";
  }
  function coordinatesFor(rect, bounds, behavior, placement) {
    const gap = behavior.offset ?? 8;
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
    return { left, top };
  }
  function clampHorizontally(left, width) {
    const margin = 8;
    return Math.max(margin, Math.min(left, innerWidth - width - margin));
  }
  function rectAt(left, top, width, height) {
    return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) };
  }
  function intersectsViewport(rect) {
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
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
    render(root, content, design, behavior, callbacks, builder, widgetType = "modal") {
      if (behavior.backdrop !== false) {
        const backdrop = document.createElement("div");
        backdrop.className = "backdrop";
        backdrop.style.setProperty("--movcues-backdrop-opacity", String(behavior.backdropOpacity ?? 0.45));
        if (behavior.closeOnBackdrop && behavior.dismissible) backdrop.addEventListener("click", callbacks.onDismiss);
        root.appendChild(backdrop);
      }
      const card = buildCard(root, content, design, behavior, callbacks, builder, widgetType);
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
        backdrop.style.setProperty("--movcues-backdrop-opacity", String(behavior.backdropOpacity ?? 0.35));
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
      this.destroy();
      const beacon = document.createElement("button");
      beacon.className = "hotspot";
      beacon.dataset.style = behavior.hotspotStyle ?? "pulse";
      beacon.style.setProperty("--movcues-hotspot", behavior.hotspotColor ?? design.theme.primary);
      beacon.type = "button";
      beacon.setAttribute("aria-label", `Open ${content.heading}`);
      if (beacon.dataset.style === "question") beacon.textContent = "?";
      root.appendChild(beacon);
      let frameId = null;
      let destroyed = false;
      let lastLeft = null;
      let lastTop = null;
      const update = () => {
        if (destroyed || !target.isConnected) return;
        const rect = target.getBoundingClientRect();
        const left = Math.max(4, Math.min(rect.right - 7, innerWidth - 18));
        const top = Math.max(4, Math.min(rect.top - 7, innerHeight - 18));
        if (left !== lastLeft) {
          lastLeft = left;
          beacon.style.left = `${left}px`;
        }
        if (top !== lastTop) {
          lastTop = top;
          beacon.style.top = `${top}px`;
        }
      };
      const schedule = () => {
        if (destroyed || frameId !== null) return;
        frameId = requestAnimationFrame(() => {
          frameId = null;
          update();
        });
      };
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
      const onScroll = (event) => {
        const scrollContainer = event.target;
        if (scrollContainer instanceof Element && !scrollContainer.contains(target)) return;
        schedule();
      };
      beacon.addEventListener("click", toggle);
      window.addEventListener("scroll", onScroll, { capture: true, passive: true });
      window.addEventListener("resize", schedule);
      this.cleanup.push(
        () => beacon.removeEventListener("click", toggle),
        () => window.removeEventListener("scroll", onScroll, true),
        () => window.removeEventListener("resize", schedule),
        () => {
          destroyed = true;
          if (frameId !== null) cancelAnimationFrame(frameId);
          frameId = null;
        }
      );
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
  class SurveyRenderer {
    constructor() {
      this.modal = new ModalRenderer();
      this.stepIndex = 0;
      this.answers = {};
      this.root = null;
      this.busy = false;
      this.completed = false;
      this.generation = 0;
      this.retry = null;
      this.dismiss = () => {
        if (!this.busy) void this.run(async () => {
          await this.callbacks.onDismiss();
        });
      };
    }
    render(root, content, design, behavior, survey, callbacks, requestedStepId) {
      if (!survey.steps.length) return null;
      this.root = root;
      this.content = content;
      this.design = design;
      this.behavior = behavior;
      this.survey = survey;
      this.callbacks = callbacks;
      const requested = requestedStepId ? survey.steps.findIndex((step) => step.id === requestedStepId) : -1;
      this.stepIndex = requested >= 0 ? requested : 0;
      this.generation++;
      this.completed = false;
      this.answers = {};
      this.busy = false;
      this.retry = null;
      const card = this.renderStep();
      if (callbacks.onLoad) void this.run(async (isCurrent) => {
        const saved = await callbacks.onLoad();
        if (!isCurrent()) return;
        this.answers = saved.answers;
        const index = survey.steps.findIndex((step) => step.id === saved.currentStepId);
        if (index >= 0) this.stepIndex = index;
        if (!saved.closed) this.renderStep();
      });
      return card;
    }
    renderStep() {
      var _a, _b, _c, _d;
      const root = this.root;
      const step = this.survey.steps[this.stepIndex];
      (_b = (_a = this.callbacks).onStepChange) == null ? void 0 : _b.call(_a, step.id);
      const baseStyle = root.firstElementChild;
      Array.from(root.children).forEach((element) => {
        if (element !== baseStyle) element.remove();
      });
      const content = { heading: step.content.heading || this.content.heading, body: step.content.body || this.content.body };
      const stepDesign = step.size ? { ...this.design, size: step.size } : this.design;
      const card = this.modal.render(root, content, stepDesign, this.behavior, { onDismiss: this.dismiss, onPrimary: this.dismiss, onSecondary: this.dismiss }, step.builder, "survey");
      let surface = card.querySelector(".movcues-widget");
      if (!surface) {
        (_c = card.querySelector(".legacy-content")) == null ? void 0 : _c.remove();
        surface = document.createElement("section");
        surface.className = "movcues-widget movcues-widget--survey";
        card.appendChild(surface);
      }
      surface.dataset.movcuesSurveyStepId = step.id;
      this.syncQuestions(surface, step.questions);
      if (!surface.querySelector(".movcues-survey-validation")) {
        const status = document.createElement("p");
        status.className = "movcues-survey-validation";
        surface.append(status);
      }
      (_d = surface.querySelector(".movcues-survey-validation")) == null ? void 0 : _d.setAttribute("role", "alert");
      this.syncNavigation(surface);
      return card;
    }
    syncQuestions(surface, questions) {
      const ids = new Set(questions.map((question) => question.id));
      surface.querySelectorAll("[data-movcues-question-id]").forEach((node) => {
        if (!ids.has(node.dataset.movcuesQuestionId ?? "")) node.remove();
      });
      let navigation = surface.querySelector("[data-movcues-survey-action]");
      while (navigation && navigation.parentElement !== surface) navigation = navigation.parentElement;
      for (const question of questions) {
        const matches2 = Array.from(surface.querySelectorAll(`[data-movcues-question-id="${cssEscape(question.id)}"]`));
        matches2.slice(1).forEach((node2) => node2.remove());
        const node = matches2[0] ?? createQuestionNode(question);
        if (!matches2[0]) surface.insertBefore(node, navigation);
        node.dataset.movcuesQuestionType = question.type;
        node.classList.add("movcues-survey-question", `movcues-survey-question--${question.type}`);
        this.bindQuestion(node, question);
        navigation = navigation ?? node.nextElementSibling;
      }
    }
    bindQuestion(node, question) {
      var _a;
      node.classList.remove("has-error");
      if (question.type === "single_choice" || question.type === "multiple_choice" || question.type === "rating" || question.type === "nps") {
        const allowed = question.type === "rating" ? range(question.min, question.max).map(String) : question.type === "nps" ? range(0, 10).map(String) : question.options.map((option) => option.id);
        let controls = Array.from(node.querySelectorAll("[data-movcues-option-id]"));
        if (!controls.length) {
          const holder = document.createElement("div");
          holder.className = "movcues-survey-options";
          for (const value of allowed) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "movcues-survey-option";
            button.dataset.movcuesOptionId = value;
            button.textContent = question.type === "single_choice" || question.type === "multiple_choice" ? ((_a = question.options.find((option) => option.id === value)) == null ? void 0 : _a.label) ?? value : value;
            holder.appendChild(button);
          }
          node.appendChild(holder);
          controls = Array.from(holder.children);
        }
        controls.forEach((control) => {
          const optionId = control.dataset.movcuesOptionId;
          control.setAttribute("role", "button");
          const update = () => {
            const answer = this.answers[question.id];
            const selected = Array.isArray(answer) ? answer.includes(optionId) : String(answer ?? "") === optionId;
            control.classList.toggle("is-selected", selected);
            control.setAttribute("aria-pressed", String(selected));
          };
          update();
          control.onclick = () => {
            var _a2, _b;
            if (!allowed.includes(optionId)) return;
            if (question.type === "multiple_choice") {
              const current = Array.isArray(this.answers[question.id]) ? this.answers[question.id] : [];
              this.answers[question.id] = current.includes(optionId) ? current.filter((value) => value !== optionId) : [...current, optionId];
            } else this.answers[question.id] = question.type === "rating" || question.type === "nps" ? Number(optionId) : optionId;
            (_b = (_a2 = this.callbacks).onAnswersChange) == null ? void 0 : _b.call(_a2, { ...this.answers });
            node.classList.remove("has-error");
            this.syncNavigation(this.root.querySelector(".movcues-widget"));
            controls.forEach((item) => {
              const value = item.dataset.movcuesOptionId;
              const answer = this.answers[question.id];
              const selected = Array.isArray(answer) ? answer.includes(value) : String(answer) === value;
              item.classList.toggle("is-selected", selected);
              item.setAttribute("aria-pressed", String(selected));
            });
          };
        });
        return;
      }
      let input = node.querySelector("[data-movcues-question-input]");
      if (!input) {
        input = question.type === "long_text" ? document.createElement("textarea") : document.createElement("input");
        input.dataset.movcuesQuestionInput = "";
        input.className = "movcues-survey-input";
        node.appendChild(input);
      }
      input.value = typeof this.answers[question.id] === "string" ? this.answers[question.id] : "";
      input.placeholder = question.placeholder ?? "";
      if (question.maxLength) input.maxLength = question.maxLength;
      input.oninput = () => {
        var _a2, _b;
        this.answers[question.id] = input.value.slice(0, question.maxLength ?? 1e4);
        node.classList.remove("has-error");
        (_b = (_a2 = this.callbacks).onAnswersChange) == null ? void 0 : _b.call(_a2, { ...this.answers });
        this.syncNavigation(this.root.querySelector(".movcues-widget"));
      };
    }
    syncNavigation(surface) {
      const nextIndex = nextSurveyStep(this.survey, this.stepIndex, this.answers);
      const final = nextIndex === null;
      const path = surveyPath(this.survey, this.answers), previousIndex = path[path.indexOf(this.stepIndex) - 1];
      const step = this.survey.steps[this.stepIndex];
      const buttons = Array.from(surface.querySelectorAll("[data-movcues-survey-action]"));
      const back = buttons.filter((button) => button.dataset.movcuesSurveyAction === "back");
      const next = buttons.filter((button) => button.dataset.movcuesSurveyAction === "next");
      const submit = buttons.filter((button) => button.dataset.movcuesSurveyAction === "submit");
      const legacyControls = Boolean(surface.querySelector("[data-movcues-survey-controls]"));
      for (const button of back) {
        button.hidden = !this.survey.allowBack || previousIndex === void 0;
        button.onclick = () => {
          if (this.busy || this.completed || !this.survey.allowBack || previousIndex === void 0) return;
          void this.run(async (isCurrent) => {
            await this.callbacks.onProgress({ ...this.answers }, step.id, "back", this.survey.steps[previousIndex].id);
            if (!isCurrent()) return;
            this.stepIndex = previousIndex;
            this.renderStep();
          });
        };
      }
      for (const button of next) {
        button.hidden = final;
        button.onclick = () => {
          if (this.busy || this.completed || nextIndex === null || !this.validateStep()) return;
          void this.run(async (isCurrent) => {
            this.answers = answersOnSurveyPath(this.survey, this.answers);
            await this.callbacks.onProgress({ ...this.answers }, step.id, "next", this.survey.steps[nextIndex].id);
            if (!isCurrent()) return;
            this.stepIndex = nextIndex;
            this.renderStep();
          });
        };
      }
      for (const button of submit) {
        button.hidden = !final;
        if (legacyControls) button.textContent = this.survey.submitLabel;
        button.onclick = () => {
          if (this.busy || this.completed || !this.validateAll()) return;
          void this.run(async (isCurrent) => {
            this.answers = answersOnSurveyPath(this.survey, this.answers);
            await this.callbacks.onSubmit({ ...this.answers }, step.id);
            if (isCurrent()) this.completed = true;
          });
        };
      }
      this.syncProgress(surface);
    }
    async run(operation) {
      var _a;
      if (this.busy || !this.root) return;
      const generation = this.generation;
      this.busy = true;
      this.retry = operation;
      this.setBusy(true);
      (_a = this.root.querySelector("[data-movcues-survey-retry]")) == null ? void 0 : _a.remove();
      try {
        await operation(() => generation === this.generation && Boolean(this.root));
        if (generation === this.generation) this.retry = null;
      } catch {
        if (generation !== this.generation || !this.root) return;
        const status = this.root.querySelector(".movcues-survey-validation");
        if (status) {
          status.textContent = "Couldn't save your answers. They are still here. Try again.";
          const retry = document.createElement("button");
          retry.type = "button";
          retry.dataset.movcuesSurveyRetry = "";
          retry.textContent = "Retry";
          retry.onclick = () => {
            if (this.retry) void this.run(this.retry);
          };
          status.append(" ", retry);
        }
      } finally {
        if (generation === this.generation) {
          this.busy = false;
          this.setBusy(false);
        }
      }
    }
    setBusy(value) {
      var _a;
      (_a = this.root) == null ? void 0 : _a.querySelectorAll("[data-movcues-survey-action],[data-movcues-option-id],[data-movcues-question-input]").forEach((control) => {
        control.disabled = value || this.completed;
      });
    }
    syncProgress(surface) {
      const progress = surface.querySelector("[data-movcues-survey-progress]");
      if (progress) progress.hidden = !this.survey.showProgress;
      const progressLabel = progress == null ? void 0 : progress.querySelector("span:not([data-movcues-survey-progress-bar])");
      if (progressLabel && !progressLabel.querySelector("[data-movcues-survey-progress-bar]")) progressLabel.textContent = `Step ${surveyPath(this.survey, this.answers).indexOf(this.stepIndex) + 1} of ${surveyPath(this.survey, this.answers).length}`;
      const bar = surface.querySelector("[data-movcues-survey-progress-bar]");
      if (bar) bar.style.width = `${(surveyPath(this.survey, this.answers).indexOf(this.stepIndex) + 1) / surveyPath(this.survey, this.answers).length * 100}%`;
    }
    validateStep() {
      return this.validateQuestions(this.survey.steps[this.stepIndex].questions);
    }
    validateAll() {
      let valid = true;
      let currentValid = true;
      for (const index of surveyPath(this.survey, this.answers)) {
        const step = this.survey.steps[index];
        const stepValid = this.validateQuestions(step.questions, step === this.survey.steps[this.stepIndex]);
        if (step === this.survey.steps[this.stepIndex]) currentValid = stepValid;
        if (!stepValid) valid = false;
      }
      if (!valid && currentValid && this.root) {
        const status = this.root.querySelector(".movcues-survey-validation");
        if (status) status.textContent = "Please go back and answer all required questions before submitting.";
      }
      return valid;
    }
    validateQuestions(questions, show = true) {
      const missing = questions.filter((question) => question.required && isEmpty(this.answers[question.id]));
      if (show && this.root) {
        missing.forEach((question) => {
          var _a;
          return (_a = this.root.querySelector(`[data-movcues-question-id="${cssEscape(question.id)}"]`)) == null ? void 0 : _a.classList.add("has-error");
        });
        const status = this.root.querySelector(".movcues-survey-validation");
        if (status) status.textContent = missing.length ? "Please answer the required questions before continuing." : "";
      }
      return missing.length === 0;
    }
    destroy() {
      this.generation++;
      this.modal.destroy();
      this.root = null;
      this.retry = null;
    }
  }
  function createQuestionNode(question) {
    const node = document.createElement("div");
    node.dataset.movcuesQuestionId = question.id;
    const label = document.createElement("p");
    label.className = "movcues-survey-question__label";
    label.textContent = `${question.label}${question.required ? " *" : ""}`;
    node.appendChild(label);
    return node;
  }
  function isEmpty(value) {
    return value === void 0 || value === "" || Array.isArray(value) && value.length === 0;
  }
  function range(min, max) {
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }
  function cssEscape(value) {
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
  }
  function guideInteractionTarget(step) {
    var _a, _b;
    return ((_a = step.advance) == null ? void 0 : _a.type) === "element_click" || ((_b = step.advance) == null ? void 0 : _b.type) === "element_hover" ? step.advance.target ?? step.target : void 0;
  }
  function matchesGuideRoute(path, rules) {
    const match = (rule) => {
      if (rule.operator === "equals") return path === rule.value;
      if (rule.operator === "starts_with") return path.startsWith(rule.value);
      if (rule.operator === "ends_with") return path.endsWith(rule.value);
      if (rule.operator === "contains") return path.includes(rule.value);
      const escaped = rule.value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      try {
        return new RegExp(`^${escaped}$`).test(path);
      } catch {
        return false;
      }
    };
    return rules.some((rule) => rule.kind === "include" && match(rule)) && !rules.some((rule) => rule.kind === "exclude" && match(rule));
  }
  function guideStepConfigurationErrors(step, index) {
    var _a, _b, _c;
    const errors = [];
    const add = (message) => errors.push(`Step ${index + 1}: ${message}`);
    const bounded2 = (value, min, max) => value === void 0 || Number.isInteger(value) && value >= min && value <= max;
    if (!bounded2((_a = step.presentation) == null ? void 0 : _a.delayMs, 0, 3e4)) add("Presentation delay must be 0–30,000 ms.");
    if (((_b = step.presentation) == null ? void 0 : _b.missingTarget) && (!bounded2(step.presentation.missingTarget.timeoutMs, 100, 6e4) || !["wait", "skip", "dismiss"].includes(step.presentation.missingTarget.action))) add("Choose a missing-target action and a timeout of 100–60,000 ms.");
    if (((_c = step.presentation) == null ? void 0 : _c.missingTarget) && !guideStepRequiresTarget(step)) add("Missing-target behavior requires an Anchored Card step.");
    const advance = step.advance;
    if (!advance) return errors;
    if ((advance.type === "element_click" || advance.type === "element_hover") && !guideStepRequiresTarget(step)) add("Website click and hover triggers require an Anchored Card step.");
    if (advance.type === "element_hover" && !bounded2(advance.durationMs, 100, 6e4)) add("Hover duration must be 100–60,000 ms.");
    if (advance.type === "custom_event" && (!advance.eventName.trim() || advance.eventName.length > 200 || /[\u0000-\u001f\u007f]/.test(advance.eventName))) add("Enter an event name of 1–200 characters without control characters.");
    if (advance.type === "route" && (!advance.pageRules.length || !advance.pageRules.some((rule) => rule.kind === "include") || advance.pageRules.some((rule) => !rule.value.trim() || rule.value.length > 500))) add("Enter at least one valid matching page rule.");
    return errors;
  }
  class ExperienceRenderer {
    constructor() {
      this.host = null;
      this.renderer = null;
      this.cancelPendingTarget = null;
      this.cleanupAdvance = null;
      this.appliedLayer = null;
      this.layerManager = new LayerManager();
      this.guideTimer = 0;
      this.visibleFrame = 0;
      this.renderGeneration = 0;
    }
    render(experience, callbacks, guideStepId) {
      this.destroy();
      if (experience.kind === "checklist") return false;
      if (isGuideDefinition(experience.definition)) return this.renderGuide(experience, experience.definition, callbacks, guideStepId);
      return this.renderWidget(experience, experience.definition, callbacks, guideStepId);
    }
    root(experienceId, behavior, targetElement) {
      this.host = document.createElement("div");
      this.host.dataset.movcuesExperience = experienceId;
      this.host.dataset.movcuesExperienceRoot = experienceId;
      this.host.style.cssText = "position:fixed;inset:0;pointer-events:none";
      const root = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLES;
      root.appendChild(style);
      document.documentElement.appendChild(this.host);
      this.applyLayer(behavior, targetElement);
      return root;
    }
    applyLayer(behavior, targetElement) {
      var _a;
      if (!this.host) return;
      (_a = this.appliedLayer) == null ? void 0 : _a.destroy();
      this.appliedLayer = this.layerManager.apply(this.host, { layer: behavior.layer, legacyZIndex: behavior.zIndex, targetElement });
    }
    renderWidget(experience, definition, callbacks, requestedStepId) {
      var _a;
      if (experience.widgetType === "anchored_card" || experience.widgetType === "hotspot") {
        const mount = (target2) => {
          const root = this.root(experience.id, definition.behavior, target2);
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
          var _a2;
          this.cancelPendingTarget = null;
          (_a2 = callbacks.onUnavailable) == null ? void 0 : _a2.call(callbacks);
        });
      } else if (experience.widgetType === "toast") {
        const root = this.root(experience.id, definition.behavior);
        const renderer = new ToastRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
      } else if (experience.widgetType === "cursor_follow") {
        const root = this.root(experience.id, definition.behavior);
        const renderer = new CursorFollowRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
      } else if (experience.widgetType === "modal") {
        const root = this.root(experience.id, definition.behavior);
        const renderer = new ModalRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
      } else if (experience.widgetType === "survey" && definition.survey) {
        const selectedStep = definition.survey.steps.find((step) => step.id === requestedStepId) ?? definition.survey.steps[0];
        const root = this.root(experience.id, { ...definition.behavior, layer: ((_a = selectedStep == null ? void 0 : selectedStep.behavior) == null ? void 0 : _a.layer) ?? definition.behavior.layer });
        const renderer = new SurveyRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, definition.survey, { onDismiss: () => callbacks.onDismiss(), onLoad: callbacks.onSurveyLoad, onAnswersChange: callbacks.onSurveyAnswersChange, onProgress: (answers, stepId, direction, destinationStepId) => {
          var _a2;
          return (_a2 = callbacks.onSurveyProgress) == null ? void 0 : _a2.call(callbacks, answers, stepId, direction, destinationStepId);
        }, onSubmit: (answers, stepId) => {
          var _a2;
          return (_a2 = callbacks.onSurveySubmit) == null ? void 0 : _a2.call(callbacks, answers, stepId);
        }, onStepChange: (stepId) => {
          var _a2;
          const step = definition.survey.steps.find((item) => item.id === stepId);
          this.applyLayer({ ...definition.behavior, layer: ((_a2 = step == null ? void 0 : step.behavior) == null ? void 0 : _a2.layer) ?? definition.behavior.layer });
        } }, requestedStepId);
      } else if (experience.widgetType === "slideout") {
        const root = this.root(experience.id, definition.behavior);
        const renderer = new SlideoutRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
      } else if (experience.widgetType === "banner") {
        const root = this.root(experience.id, definition.behavior);
        const renderer = new BannerRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks), definition.builder);
      } else return false;
      if (experience.widgetType !== "anchored_card" && experience.widgetType !== "hotspot") requestAnimationFrame(callbacks.onVisible);
      return true;
    }
    renderGuide(experience, definition, callbacks, guideStepId) {
      var _a, _b;
      const stepIndex = guideStepId ? definition.steps.findIndex((item) => item.id === guideStepId) : 0;
      const step = definition.steps[stepIndex];
      if (!step) return false;
      const generation = this.renderGeneration;
      let finished = false;
      const alive = () => generation === this.renderGeneration && !finished;
      const once = (run2) => {
        if (!alive()) return;
        finished = true;
        run2();
      };
      const advance = () => once(() => {
        var _a2;
        return (_a2 = callbacks.onGuideAdvance) == null ? void 0 : _a2.call(callbacks);
      });
      const back = () => once(() => {
        var _a2;
        return (_a2 = callbacks.onGuideBack) == null ? void 0 : _a2.call(callbacks);
      });
      const dismiss = () => {
        if (generation !== this.renderGeneration) return;
        finished = true;
        callbacks.onDismiss();
        this.destroy();
      };
      const guarded = { ...callbacks, onGuideAdvance: advance, onGuideBack: back, onDismiss: dismiss };
      const stepDesign = step.size ? { ...definition.design, size: step.size } : definition.design;
      const stepCallbacks = {
        onDismiss: dismiss,
        onSecondary: dismiss,
        onPrimary: () => {
          var _a2;
          if (!alive()) return;
          const action = step.content.primaryAction;
          if (action) callbacks.onAction(action);
          if ((((_a2 = step.advance) == null ? void 0 : _a2.type) ?? "button") === "button") advance();
        },
        onActionId: (action, label) => {
          if (generation === this.renderGeneration && (!finished || !["next_step", "previous_step"].includes(action.type))) this.dispatchBuilderAction(action, label, guarded);
        }
      };
      const visible = () => {
        var _a2;
        if (!alive()) return;
        (_a2 = callbacks.onGuideStatus) == null ? void 0 : _a2.call(callbacks, "ready");
        this.visibleFrame = requestAnimationFrame(() => {
          this.visibleFrame = 0;
          if (alive()) callbacks.onVisible();
        });
      };
      const addBack = (card) => {
        var _a2;
        if (stepIndex === 0) return;
        const button = document.createElement("button");
        button.className = "secondary";
        button.textContent = "Back";
        button.addEventListener("click", back);
        (_a2 = card.querySelector("footer")) == null ? void 0 : _a2.prepend(button);
      };
      const run = () => {
        var _a2, _b2;
        if (!alive()) return;
        this.guideTimer = 0;
        if (getGuideStepPattern(step) === "modal") {
          const root = this.root(experience.id, { layer: step.behavior.layer ?? ((_a2 = definition.behavior) == null ? void 0 : _a2.layer) });
          const renderer = new ModalRenderer();
          this.renderer = renderer;
          const card = renderer.render(root, step.content, stepDesign, { dismissible: step.behavior.dismissible ?? true }, stepCallbacks, step.builder);
          addBack(card);
          visible();
          return;
        }
        const missing = (_b2 = step.presentation) == null ? void 0 : _b2.missingTarget;
        const timeout = Math.max(100, Math.min(6e4, (missing == null ? void 0 : missing.timeoutMs) ?? 5e3));
        const deadline = Date.now() + timeout;
        const unavailable = () => {
          var _a3, _b3;
          if (!alive()) return;
          (_a3 = callbacks.onGuideStatus) == null ? void 0 : _a3.call(callbacks, "unavailable");
          if ((missing == null ? void 0 : missing.action) === "skip") advance();
          else if ((missing == null ? void 0 : missing.action) === "dismiss") dismiss();
          else (_b3 = callbacks.onUnavailable) == null ? void 0 : _b3.call(callbacks);
        };
        const resolve = (spec, found) => {
          var _a3;
          if (!alive()) return;
          const target = findTarget(spec);
          if (target) {
            found(target);
            return;
          }
          (_a3 = callbacks.onGuideStatus) == null ? void 0 : _a3.call(callbacks, "waiting");
          this.cancelPendingTarget = waitForTarget(spec, (element) => {
            this.cancelPendingTarget = null;
            if (alive()) found(element);
          }, () => {
            this.cancelPendingTarget = null;
            unavailable();
          }, Math.max(0, deadline - Date.now()));
        };
        resolve(step.target, (target) => {
          const mount = (interaction2) => {
            var _a3, _b3, _c;
            if (!alive()) return;
            ensureGuideTargetInView(target);
            const root = this.root(experience.id, { layer: step.behavior.layer ?? ((_a3 = definition.behavior) == null ? void 0 : _a3.layer) }, target);
            const renderer = new AnchoredCardRenderer();
            this.renderer = renderer;
            const behavior = { ...step.behavior, dismissible: step.behavior.dismissible ?? true };
            const card = renderer.render(root, target, step.content, stepDesign, behavior, stepCallbacks, step.builder, "anchored_card");
            addBack(card);
            if (interaction2) this.listenForAdvance(interaction2, ((_b3 = step.advance) == null ? void 0 : _b3.type) ?? "button", ((_c = step.advance) == null ? void 0 : _c.type) === "element_hover" ? step.advance.durationMs : void 0, advance);
            visible();
          };
          const interaction = guideInteractionTarget(step);
          if (interaction && interaction !== step.target) resolve(interaction, mount);
          else mount(interaction ? target : void 0);
        });
      };
      const delay = Math.max(0, Math.min(3e4, ((_a = step.presentation) == null ? void 0 : _a.delayMs) ?? 0));
      if (delay) {
        (_b = callbacks.onGuideStatus) == null ? void 0 : _b.call(callbacks, "delay");
        this.guideTimer = window.setTimeout(run, delay);
      } else run();
      return true;
    }
    listenForAdvance(target, type, durationMs, advance) {
      if (!advance) return;
      if (type === "element_click") {
        let active = true;
        const click = () => queueMicrotask(() => {
          if (active) advance();
        });
        target.addEventListener("click", click);
        this.cleanupAdvance = () => {
          active = false;
          target.removeEventListener("click", click);
        };
      } else if (type === "element_hover") {
        let timer = null;
        const leave = () => {
          if (timer !== null) window.clearTimeout(timer);
          timer = null;
        };
        const enter = () => {
          leave();
          timer = window.setTimeout(advance, durationMs ?? 500);
        };
        target.addEventListener("mouseenter", enter);
        target.addEventListener("mouseleave", leave);
        this.cleanupAdvance = () => {
          leave();
          target.removeEventListener("mouseenter", enter);
          target.removeEventListener("mouseleave", leave);
        };
      }
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
        },
        onActionId: (action, label) => this.dispatchBuilderAction(action, label, callbacks)
      };
    }
    dispatchBuilderAction(action, label, callbacks) {
      var _a, _b;
      const runtimeAction = { ...action, label };
      if (action.type === "next_step") {
        callbacks.onAction(runtimeAction);
        (_a = callbacks.onGuideAdvance) == null ? void 0 : _a.call(callbacks);
      } else if (action.type === "previous_step") {
        callbacks.onAction(runtimeAction);
        (_b = callbacks.onGuideBack) == null ? void 0 : _b.call(callbacks);
      } else {
        callbacks.onAction(runtimeAction);
        if (action.type === "dismiss") {
          callbacks.onDismiss();
          this.destroy();
        }
      }
    }
    clearSurface() {
      var _a, _b, _c, _d, _e;
      this.renderGeneration++;
      clearTimeout(this.guideTimer);
      this.guideTimer = 0;
      cancelAnimationFrame(this.visibleFrame);
      this.visibleFrame = 0;
      (_a = this.cleanupAdvance) == null ? void 0 : _a.call(this);
      this.cleanupAdvance = null;
      (_b = this.cancelPendingTarget) == null ? void 0 : _b.call(this);
      this.cancelPendingTarget = null;
      (_c = this.renderer) == null ? void 0 : _c.destroy();
      this.renderer = null;
      (_d = this.appliedLayer) == null ? void 0 : _d.destroy();
      this.appliedLayer = null;
      (_e = this.host) == null ? void 0 : _e.remove();
      this.host = null;
    }
    destroy() {
      this.clearSurface();
    }
  }
  const GUIDE_TARGET_VIEWPORT_MARGIN = 48;
  function ensureGuideTargetInView(target) {
    const rect = target.getBoundingClientRect();
    const comfortablyVisible = rect.width > 0 && rect.height > 0 && rect.top >= GUIDE_TARGET_VIEWPORT_MARGIN && rect.left >= GUIDE_TARGET_VIEWPORT_MARGIN && rect.bottom <= window.innerHeight - GUIDE_TARGET_VIEWPORT_MARGIN && rect.right <= window.innerWidth - GUIDE_TARGET_VIEWPORT_MARGIN;
    if (comfortablyVisible || typeof target.scrollIntoView !== "function") return;
    const prefersReducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
  }
  const STYLES = `
  :host{all:initial}.card{pointer-events:auto;position:fixed;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);padding:18px;background:var(--movcues-bg);color:var(--movcues-fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.12)}
  .card[data-width=sm]{width:260px}.card[data-width=lg]{width:400px}.card[data-radius=sm]{border-radius:6px}.card[data-radius=md]{border-radius:12px}.card[data-radius=lg]{border-radius:20px}
  .builder-card{padding:0;background:transparent;border:0;box-shadow:none}.builder-content{box-sizing:border-box;width:100%;max-width:100%;overflow:visible}
  .movcues-anchor-pointer{position:absolute;width:var(--movcues-pointer-size);height:var(--movcues-pointer-size);pointer-events:none;z-index:0}.movcues-anchor-pointer svg{display:block;width:100%;height:100%;overflow:visible}.movcues-anchor-pointer[data-placement=bottom]{top:calc(-1 * var(--movcues-pointer-size));transform:translateX(-50%)}.movcues-anchor-pointer[data-placement=top]{bottom:calc(-1 * var(--movcues-pointer-size));transform:translateX(-50%) rotate(180deg)}.movcues-anchor-pointer[data-placement=right]{left:calc(-1 * var(--movcues-pointer-size));transform:translateY(-50%) rotate(-90deg)}.movcues-anchor-pointer[data-placement=left]{right:calc(-1 * var(--movcues-pointer-size));transform:translateY(-50%) rotate(90deg)}.builder-content,.legacy-content{position:relative;z-index:1}
  h2{font:600 17px/1.3 ui-sans-serif,system-ui,sans-serif;margin:0 24px 7px 0}p{margin:0;white-space:pre-wrap}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{border:0;border-radius:7px;padding:8px 12px;font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer}.primary{background:var(--movcues-primary);color:#fff}.secondary{background:transparent;color:inherit}
  .toast{position:fixed!important}.toast[data-position=top-left]{top:16px;left:16px}.toast[data-position=top-right]{top:16px;right:16px}.toast[data-position=bottom-left]{bottom:16px;left:16px}.toast[data-position=bottom-right]{bottom:16px;right:16px}.cursor{will-change:left,top}@media(prefers-reduced-motion:reduce){.card{transition:none!important}}
  .backdrop{pointer-events:auto;position:fixed;inset:0;background:rgba(0,0,0,var(--movcues-backdrop-opacity,.45))}
  .modal{left:50%;top:50%;transform:translate(-50%,-50%)}.modal[data-layout=fullscreen],.modal[data-size-width=full]{inset:12px;width:auto!important;max-width:none!important;transform:none;display:flex;flex-direction:column;justify-content:center}.modal[data-layout=fullscreen] footer,.modal[data-size-width=full] footer{justify-content:center}
  .slideout[data-position=top-left]{top:16px;left:16px}.slideout[data-position=top-right]{top:16px;right:16px}.slideout[data-position=bottom-left]{bottom:16px;left:16px}.slideout[data-position=bottom-right]{bottom:16px;right:16px}.slideout[data-position=center-left]{left:16px;top:50%;transform:translateY(-50%)}.slideout[data-position=center-right]{right:16px;top:50%;transform:translateY(-50%)}
  .banner{left:0;right:0;width:auto!important;max-width:none;border-radius:0!important;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:center}.banner[data-position=top]{top:0}.banner[data-position=bottom]{bottom:0}.banner h2,.banner p{grid-column:1}.banner footer{grid-column:2;grid-row:1/span 2;margin:0;padding-right:24px}
  .hotspot{pointer-events:auto;position:fixed;width:18px;height:18px;padding:0;border:3px solid #fff;border-radius:50%;background:var(--movcues-hotspot);box-shadow:0 1px 5px rgba(0,0,0,.35);color:#fff;font:700 12px/12px ui-sans-serif,system-ui,sans-serif}.hotspot[data-style=pulse]::after{content:"";position:absolute;inset:-7px;border:2px solid var(--movcues-hotspot);border-radius:50%;animation:movcues-pulse 1.8s ease-out infinite}.hotspot[data-style=dot]{width:14px;height:14px}.hotspot[data-style=question]{width:22px;height:22px}@keyframes movcues-pulse{0%{transform:scale(.65);opacity:.85}100%{transform:scale(1.45);opacity:0}}@media(prefers-reduced-motion:reduce){.hotspot::after{animation:none}}
  .movcues-survey-question.has-error{outline:2px solid #fecaca;outline-offset:6px;border-radius:6px}.movcues-survey-validation{color:#b91c1c}:where(.movcues-survey-option.is-selected){border-color:var(--movcues-primary);background:color-mix(in srgb,var(--movcues-primary) 12%,white)}.movcues-survey-input{font:inherit}
`;
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
    async chat(input, signal) {
      const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/ai/chat`, { method: "POST", headers: this.headers(), credentials: "omit", body: JSON.stringify(input), signal });
      const body = await response.json().catch(() => null);
      if (response.status === 409 && (body == null ? void 0 : body.error) === "draft_conflict") throw new DraftConflictError(body.currentRevision);
      if ([401, 403, 404, 410].includes(response.status) && (body == null ? void 0 : body.error) !== "conversation_not_found") throw new EditorSessionExpiredError();
      if (!response.ok) throw new EditorAiRequestError((body == null ? void 0 : body.message) ?? "Movcues AI could not complete this request.", body == null ? void 0 : body.conversationId);
      return body;
    }
    async saveStyle(name, tokens) {
      var _a;
      const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets`, { method: "POST", headers: this.headers(), credentials: "omit", body: JSON.stringify({ name, tokens }) });
      if (!response.ok) throw new Error(((_a = await response.json().catch(() => null)) == null ? void 0 : _a.error) ?? "Style could not be saved");
      return (await response.json()).preset;
    }
    async renameStyle(id, name) {
      const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets/${encodeURIComponent(id)}`, { method: "PATCH", headers: this.headers(), credentials: "omit", body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error("Style could not be renamed");
      return (await response.json()).preset;
    }
    async deleteStyle(id) {
      const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets/${encodeURIComponent(id)}`, { method: "DELETE", headers: this.headers(), credentials: "omit" });
      if (!response.ok) throw new Error("Style could not be deleted");
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
  class EditorAiRequestError extends Error {
    constructor(message, conversationId) {
      super(message);
      this.conversationId = conversationId;
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
  const OVERRIDE_ATTR = "data-movcues-name";
  const detector = new SensitiveElementDetector();
  function clean(text2) {
    if (!text2) return void 0;
    const trimmed = text2.replace(/\s+/g, " ").trim();
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
      const text2 = clean(el.textContent);
      if (text2) return text2;
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
      const matches2 = document.querySelectorAll(selector);
      return matches2.length === 1 && matches2[0] === selected;
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
  function editorSelection(root) {
    var _a;
    return ((_a = root.getSelection) == null ? void 0 : _a.call(root)) ?? window.getSelection();
  }
  function editorRange(root) {
    const selection = editorSelection(root);
    if (!selection) return null;
    const composed = selection;
    if (composed.getComposedRanges) {
      try {
        const value = composed.getComposedRanges({ shadowRoots: [root] })[0];
        if (value && root.contains(value.startContainer) && root.contains(value.endContainer)) {
          const range2 = document.createRange();
          range2.setStart(value.startContainer, value.startOffset);
          range2.setEnd(value.endContainer, value.endOffset);
          return range2;
        }
      } catch {
      }
    }
    return selection.rangeCount ? selection.getRangeAt(0) : null;
  }
  function setEditorRange(root, range2) {
    const selection = editorSelection(root);
    if (!selection) return;
    if (selection.setBaseAndExtent) selection.setBaseAndExtent(range2.startContainer, range2.startOffset, range2.endContainer, range2.endOffset);
    else {
      selection.removeAllRanges();
      selection.addRange(range2);
    }
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
          const range2 = document.createRange();
          range2.selectNodeContents(this.selected);
          setEditorRange(this.root, range2);
          this.savedRange = range2.cloneRange();
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
        const text2 = (_a = paste.clipboardData) == null ? void 0 : _a.getData("text/plain");
        if (text2 === void 0) return;
        const range2 = editorRange(this.root);
        if (!range2 || !((_b = this.selected) == null ? void 0 : _b.contains(range2.commonAncestorContainer))) return;
        paste.preventDefault();
        this.beforeOperation();
        range2.deleteContents();
        const node = document.createTextNode(text2);
        range2.insertNode(node);
        range2.setStartAfter(node);
        range2.collapse(true);
        setEditorRange(this.root, range2);
        this.savedRange = range2.cloneRange();
        this.commit();
      };
      this.rememberSelection = () => {
        var _a;
        const range2 = editorRange(this.root);
        if (range2 && ((_a = this.selected) == null ? void 0 : _a.contains(range2.commonAncestorContainer))) this.savedRange = range2.cloneRange();
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
      const range2 = editorRange(this.root);
      if (!range2 || range2.collapsed || !((_a = this.selected) == null ? void 0 : _a.contains(range2.commonAncestorContainer))) return false;
      if (((_b = this.selected) == null ? void 0 : _b.closest("a")) || ((_c = range2.startContainer.parentElement) == null ? void 0 : _c.closest("a")) || ((_d = range2.endContainer.parentElement) == null ? void 0 : _d.closest("a")) || range2.cloneContents().querySelector("a")) return false;
      this.beforeOperation();
      const anchor = document.createElement("a");
      anchor.href = url;
      if (/^https?:\/\//i.test(url)) {
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
      }
      anchor.append(range2.extractContents());
      range2.insertNode(anchor);
      range2.selectNodeContents(anchor);
      setEditorRange(this.root, range2);
      this.savedRange = range2.cloneRange();
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
    restoreSelection() {
      var _a;
      if (!this.savedRange || !((_a = this.selected) == null ? void 0 : _a.contains(this.savedRange.commonAncestorContainer))) {
        this.savedRange = null;
        return false;
      }
      this.selected.focus({ preventScroll: true });
      setEditorRange(this.root, this.savedRange);
      return true;
    }
    wrapSelection(tag) {
      var _a;
      if (this.composing || !this.restoreSelection()) return;
      const range2 = editorRange(this.root);
      if (!range2 || range2.collapsed || !((_a = this.selected) == null ? void 0 : _a.contains(range2.commonAncestorContainer))) return;
      if (range2.cloneContents().querySelector("ul,ol,li,div,p,button,img")) return;
      this.beforeOperation();
      const wrapper = document.createElement(tag);
      wrapper.append(range2.extractContents());
      range2.insertNode(wrapper);
      range2.selectNodeContents(wrapper);
      setEditorRange(this.root, range2);
      this.savedRange = range2.cloneRange();
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
        const text2 = componentPlainText(element);
        if (marker === "heading" || marker === "body") content[marker] = text2;
        else {
          const action = marker === "primary" ? content.primaryAction : content.secondaryAction;
          if (action) action.label = text2;
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
      const range2 = editorRange(this.root);
      if (!this.selected || !range2 || !this.selected.contains(range2.commonAncestorContainer)) return { start: 0, end: 0 };
      const prefix = range2.cloneRange();
      prefix.selectNodeContents(this.selected);
      prefix.setEnd(range2.startContainer, range2.startOffset);
      return { start: prefix.toString().length, end: prefix.toString().length + range2.toString().length };
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
        for (const text2 of nodes) {
          if (offset <= text2.length) return [text2, offset];
          offset -= text2.length;
        }
        const last = nodes[nodes.length - 1];
        return [last, last.length];
      };
      const range2 = document.createRange();
      range2.setStart(...locate(start));
      range2.setEnd(...locate(end));
      setEditorRange(this.root, range2);
      this.savedRange = range2.cloneRange();
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
  async function prepareImageFile(file) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG or WebP image.");
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          image.onload = image.onerror = null;
          reject(new Error("Image took too long to open. Try another file."));
        }, 15e3);
        image.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        image.onerror = () => {
          clearTimeout(timer);
          reject(new Error("This image could not be opened. Try another PNG, JPG or WebP file."));
        };
        image.src = url;
      });
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 4e7) throw new Error("This image is too large. Choose an image under 40 megapixels.");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not prepare the image.");
      let scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
      for (let attempt = 0; attempt < 8; attempt++) {
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const src = canvas.toDataURL("image/webp", Math.max(0.45, 0.85 - attempt * 0.08));
        if (src.length <= ONSITE_LIMITS.maxInlineImage && onsiteImageSourceIsSafe(src)) return src;
        scale *= 0.8;
      }
      throw new Error("This image is too detailed to save. Try a smaller image or use an image URL.");
    } finally {
      image.onload = image.onerror = null;
      URL.revokeObjectURL(url);
    }
  }
  const BLOCK_PATCH_KEYS = /* @__PURE__ */ new Set(["align", "fontSize", "weight", "lineHeight", "color", "label", "variant", "background", "width", "paddingX", "paddingY", "radius", "alt", "fit", "size", "thickness", "icon"]);
  const CELL_PATCH_KEYS = /* @__PURE__ */ new Set(["direction", "sizing", "align", "justify", "gap", "padding", "responsiveStack", "style"]);
  const plainText = (value) => sanitizeRichText(value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]));
  function patchBlock(block, patch) {
    for (const key of Object.keys(patch)) if (!BLOCK_PATCH_KEYS.has(key)) throw new Error(`Unsupported block property: ${key}`);
    Object.assign(block, cloneOnsite(patch));
  }
  function patchCell(cell, patch) {
    for (const key of Object.keys(patch)) if (!CELL_PATCH_KEYS.has(key)) throw new Error(`Unsupported cell property: ${key}`);
    Object.assign(cell, cloneOnsite(patch));
  }
  function moveCandidate(document2, sourceId, targetId, before = false) {
    if (sourceId === document2.root.id || sourceId === targetId) throw new Error("The root cell cannot be moved.");
    const source = findCell(document2, sourceId), target = findCell(document2, targetId), from = parentCell(document2, sourceId);
    if (!source || !target || !(from == null ? void 0 : from.children) || findCell({ ...document2, root: source }, targetId)) throw new Error("Invalid move target.");
    from.children.splice(from.children.indexOf(source), 1);
    if (!from.children.length) delete from.children;
    if (!target.block && !target.children) target.children = [source];
    else {
      const to = parentCell(document2, targetId);
      if (!(to == null ? void 0 : to.children)) throw new Error("Invalid move target.");
      to.children.splice(to.children.indexOf(target) + (before ? 0 : 1), 0, source);
    }
  }
  function applyEditorAiProposal(document2, proposal) {
    if (document2.schemaVersion !== 2 && document2.schemaVersion !== 3) throw new Error("AI editing requires an on-site document.");
    if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
    const candidate = cloneOnsite(document2);
    for (const operation of proposal.operations) {
      if (operation.type === "update_text") {
        const block = findBlock(candidate, operation.blockId);
        if (!block || block.type !== "heading" && block.type !== "text") throw new Error("Text target no longer exists.");
        block.html = plainText(operation.text.slice(0, 1e4));
      } else if (operation.type === "update_block") {
        const block = findBlock(candidate, operation.blockId);
        if (!block || block.type === "question" || block.type === "survey_controls" || block.type.startsWith("checklist_")) throw new Error("Block target is unavailable.");
        patchBlock(block, operation.patch);
      } else if (operation.type === "update_cell") {
        const cell = findCell(candidate, operation.cellId);
        if (!cell) throw new Error("Cell target no longer exists.");
        patchCell(cell, operation.patch);
      } else if (operation.type === "update_button_action") {
        const block = findBlock(candidate, operation.blockId);
        if ((block == null ? void 0 : block.type) !== "button") throw new Error("Button target no longer exists.");
        block.action = { id: block.action.id, ...cloneOnsite(operation.action) };
      } else if (operation.type === "insert_block") {
        const target = findCell(candidate, operation.targetCellId);
        if (!target) throw new Error("Insert target no longer exists.");
        const block = createBlock(operation.blockType);
        if (operation.text && (block.type === "heading" || block.type === "text")) block.html = plainText(operation.text);
        if (operation.position === "inside") {
          if (!target.block && !target.children) target.block = block;
          else {
            target.children ?? (target.children = target.block ? [emptyCell(target.block)] : []);
            delete target.block;
            target.children.push(emptyCell(block));
          }
        } else {
          const id = insertAdjacentCell(candidate, target.id, operation.position === "before" ? "top" : "bottom");
          if (!id) throw new Error("Block could not be inserted.");
          findCell(candidate, id).block = block;
        }
      } else if (operation.type === "remove_cell") {
        if (operation.cellId === candidate.root.id || !removeCell(candidate, operation.cellId)) throw new Error("Cell cannot be removed.");
      } else if (operation.type === "duplicate_cell") {
        if (operation.cellId === candidate.root.id || !duplicateCell(candidate, operation.cellId)) throw new Error("Cell cannot be duplicated.");
      } else if (operation.type === "move_cell") moveCandidate(candidate, operation.cellId, operation.targetCellId, operation.before);
      else throw new Error("Unsupported AI operation.");
    }
    const validation = validateOnsiteDocument(candidate);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    return candidate;
  }
  function setDocumentCopy(step, heading, body) {
    const document2 = onsiteDocumentFromBuilder(step.builder);
    if (!document2 || !step.builder) throw new Error(`Step ${step.id} has no editable on-site document.`);
    const blocks = listBlocks(document2.root);
    const headingBlock = blocks.find((block) => block.type === "heading");
    if (heading !== void 0 && (headingBlock == null ? void 0 : headingBlock.type) === "heading") headingBlock.html = plainText(heading.slice(0, 160));
    const bodyBlock = blocks.find((block) => block.type === "text");
    if (body !== void 0 && (bodyBlock == null ? void 0 : bodyBlock.type) === "text") bodyBlock.html = plainText(body.slice(0, 1e4));
    const compiled = applyOnsiteDocument(step.builder, document2, getGuideStepPattern(step));
    step.content = compiled.content;
  }
  function newGuideStep(operation) {
    var _a;
    const document2 = createOnsiteDocument(true), builder = { version: 1, projectData: {}, html: "", css: "" };
    const step = { id: onsiteId("step"), label: ((_a = operation.label) == null ? void 0 : _a.trim().slice(0, 80)) || (operation.pattern === "modal" ? "Modal step" : "Anchored step"), pattern: operation.pattern, content: { heading: "", body: "" }, builder, advance: { type: "button" }, behavior: operation.pattern === "modal" ? { dismissible: true } : { placement: "auto", alignment: "center", offset: 8, pointer: { enabled: true, size: 10 }, dismissible: true } };
    applyOnsiteDocument(builder, document2, operation.pattern);
    setDocumentCopy(step, operation.heading, operation.body);
    return step;
  }
  function normalizePattern(step, pattern) {
    var _a, _b, _c;
    step.pattern = pattern;
    if (pattern === "modal") {
      delete step.target;
      (_a = step.presentation) == null ? true : delete _a.missingTarget;
      if (((_b = step.advance) == null ? void 0 : _b.type) === "element_click" || ((_c = step.advance) == null ? void 0 : _c.type) === "element_hover") step.advance = { type: "button" };
      step.behavior = { dismissible: step.behavior.dismissible ?? true, backdrop: step.behavior.backdrop, backdropOpacity: step.behavior.backdropOpacity, closeOnBackdrop: step.behavior.closeOnBackdrop };
    } else step.behavior = { placement: step.behavior.placement ?? "auto", alignment: step.behavior.alignment ?? "center", offset: step.behavior.offset ?? 8, pointer: step.behavior.pointer ?? { enabled: true, size: 10 }, dismissible: step.behavior.dismissible ?? true, layer: step.behavior.layer };
    if (step.builder) {
      const document2 = onsiteDocumentFromBuilder(step.builder);
      if (document2) step.content = applyOnsiteDocument(step.builder, document2, pattern).content;
    }
  }
  function withPageRuleIds(rules) {
    return rules.map((rule) => ({ ...cloneOnsite(rule), id: onsiteId("cell") }));
  }
  function applyGuideAiProposal(source, proposal, resolvedTargets = /* @__PURE__ */ new Map()) {
    if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
    const guide = cloneOnsite(source), affected = /* @__PURE__ */ new Set(), withinStep = /* @__PURE__ */ new Map();
    const step = (id) => {
      const value = guide.steps.find((item) => item.id === id);
      if (!value) throw new Error(`Guide step no longer exists: ${id}`);
      return value;
    };
    proposal.operations.forEach((operation, operationIndex) => {
      var _a, _b, _c, _d, _e;
      if (["update_text", "update_block", "update_cell", "update_button_action", "insert_block", "remove_cell", "duplicate_cell", "move_cell"].includes(operation.type)) {
        const documentOperation = operation;
        if (!documentOperation.stepId) throw new Error("Within-step operations require a stable step ID.");
        step(documentOperation.stepId);
        withinStep.set(documentOperation.stepId, [...withinStep.get(documentOperation.stepId) ?? [], documentOperation]);
        affected.add(documentOperation.stepId);
        return;
      }
      const guideOperation = operation;
      if (guideOperation.type === "add_guide_step") {
        if (guide.steps.length >= 20) throw new Error("A Guide can contain up to 20 steps.");
        const created = newGuideStep(guideOperation), after = guideOperation.afterStepId ? guide.steps.findIndex((item) => item.id === guideOperation.afterStepId) : guide.steps.length - 1;
        if (guideOperation.afterStepId && after < 0) throw new Error("The requested insertion step no longer exists.");
        guide.steps.splice(after + 1, 0, created);
        affected.add(created.id);
      } else if (guideOperation.type === "duplicate_guide_step") {
        if (guide.steps.length >= 20) throw new Error("A Guide can contain up to 20 steps.");
        const original = step(guideOperation.stepId), copy = cloneOnsite(original);
        copy.id = onsiteId("step");
        copy.label = ((_a = guideOperation.label) == null ? void 0 : _a.trim().slice(0, 80)) || `${original.label || original.content.heading || "Step"} copy`;
        const document2 = onsiteDocumentFromBuilder(copy.builder);
        if (document2 && copy.builder) copy.content = applyOnsiteDocument(copy.builder, duplicateDocument(document2), getGuideStepPattern(copy)).content;
        setDocumentCopy(copy, guideOperation.heading, guideOperation.body);
        const after = guideOperation.afterStepId ? guide.steps.findIndex((item) => item.id === guideOperation.afterStepId) : guide.steps.indexOf(original);
        if (after < 0) throw new Error("The requested insertion step no longer exists.");
        guide.steps.splice(after + 1, 0, copy);
        affected.add(copy.id);
      } else if (guideOperation.type === "remove_guide_step") {
        if (guide.steps.length <= 1) throw new Error("The final Guide step cannot be removed.");
        const index = guide.steps.findIndex((item) => item.id === guideOperation.stepId);
        if (index < 0) throw new Error("Guide step no longer exists.");
        guide.steps.splice(index, 1);
        affected.add(guideOperation.stepId);
      } else if (guideOperation.type === "move_guide_step") {
        const value = step(guideOperation.stepId), from = guide.steps.indexOf(value);
        guide.steps.splice(from, 1);
        const before = guideOperation.beforeStepId ? guide.steps.findIndex((item) => item.id === guideOperation.beforeStepId) : guide.steps.length;
        if (before < 0) throw new Error("Move destination no longer exists.");
        guide.steps.splice(before, 0, value);
        affected.add(value.id);
      } else if (guideOperation.type === "update_guide_step") {
        const value = step(guideOperation.stepId);
        if (guideOperation.patch.label !== void 0) value.label = guideOperation.patch.label.trim().slice(0, 80) || void 0;
        if (guideOperation.patch.pattern) normalizePattern(value, guideOperation.patch.pattern);
        affected.add(value.id);
      } else if (guideOperation.type === "update_guide_step_behavior") {
        const value = step(guideOperation.stepId);
        Object.assign(value.behavior, cloneOnsite(guideOperation.patch));
        affected.add(value.id);
      } else if (guideOperation.type === "update_guide_advance") {
        const value = step(guideOperation.stepId);
        if ((guideOperation.advance.type === "element_click" || guideOperation.advance.type === "element_hover") && !guideStepRequiresTarget(value)) throw new Error("Website interaction advancement requires an Anchored Card step.");
        const target = ((_b = value.advance) == null ? void 0 : _b.type) === "element_click" || ((_c = value.advance) == null ? void 0 : _c.type) === "element_hover" ? value.advance.target : void 0;
        const advance = cloneOnsite(guideOperation.advance);
        value.advance = advance.type === "route" ? { ...advance, pageRules: withPageRuleIds(advance.pageRules) } : { ...advance, ...target ? { target } : {} };
        affected.add(value.id);
      } else if (guideOperation.type === "update_guide_presentation") {
        const value = step(guideOperation.stepId), { missingTarget, ...presentationPatch } = cloneOnsite(guideOperation.presentation);
        value.presentation = { ...value.presentation, ...presentationPatch, ...missingTarget && { missingTarget } };
        if (missingTarget === null && value.presentation) delete value.presentation.missingTarget;
        affected.add(value.id);
      } else if (guideOperation.type === "update_guide_targeting") {
        const patch = cloneOnsite(guideOperation.patch);
        Object.assign(guide.targeting, patch, patch.pageRules ? { pageRules: withPageRuleIds(patch.pageRules) } : {});
      } else if (guideOperation.type === "request_guide_target") {
        const value = step(guideOperation.stepId), target = resolvedTargets.get(operationIndex);
        if (!target) throw new Error(`Select a ${guideOperation.targetKind === "position" ? "positioning" : "interaction"} target before applying.`);
        const safe = { ...cloneOnsite(target) };
        if (guideOperation.targetKind === "position") value.target = safe;
        else {
          if (!(((_d = value.advance) == null ? void 0 : _d.type) === "element_click" || ((_e = value.advance) == null ? void 0 : _e.type) === "element_hover")) throw new Error("Configure click or hover advancement before selecting its target.");
          value.advance.target = safe;
        }
        affected.add(value.id);
      } else throw new Error("Unsupported Guide AI operation.");
    });
    for (const [stepId, operations] of withinStep) {
      const value = step(stepId), document2 = onsiteDocumentFromBuilder(value.builder);
      if (!document2 || !value.builder) throw new Error(`Step ${stepId} has no editable on-site document.`);
      const next = applyEditorAiProposal(document2, { summary: proposal.summary, operations });
      value.content = applyOnsiteDocument(value.builder, next, getGuideStepPattern(value)).content;
    }
    const warnings = [];
    guide.steps.forEach((value, index) => {
      var _a, _b;
      warnings.push(...guideStepConfigurationErrors(value, index));
      if (((_b = (_a = value.presentation) == null ? void 0 : _a.missingTarget) == null ? void 0 : _b.action) === "skip" && index === guide.steps.length - 1) warnings.push(`Step ${index + 1}: Skip cannot be used on the final step.`);
      const document2 = onsiteDocumentFromBuilder(value.builder);
      if (!document2 || !validateOnsiteDocument(document2).valid) warnings.push(`Step ${index + 1}: on-site document is invalid.`);
    });
    if (warnings.length) throw new Error(warnings.join(" "));
    return { guide, affectedStepIds: [...affected], order: guide.steps.map((value) => value.id), warnings };
  }
  function editorAiContext(input) {
    return { experience: input.experience, selection: cloneOnsite(input.selection), document: cloneOnsite(input.document), ...input.theme ? { theme: cloneOnsite(input.theme) } : {} };
  }
  function guideAiContext(input) {
    var _a;
    const selected = input.guide.steps.find((step) => step.id === input.currentStepId);
    if (!selected) throw new Error("Selected Guide step no longer exists.");
    const target = (value) => {
      var _a2;
      return value ? { configured: true, label: value.label, reliability: value.reliability, pagePath: (_a2 = value.targetContext) == null ? void 0 : _a2.pagePath } : { configured: false };
    };
    const summaries = input.guide.steps.map((step, index) => {
      const document2 = onsiteDocumentFromBuilder(step.builder), buttons = document2 ? listBlocks(document2.root).filter((block) => block.type === "button").map((block) => ({ id: block.id, label: block.label, action: block.action.type })) : [];
      return { id: step.id, index, label: step.label, pattern: getGuideStepPattern(step), heading: step.content.heading, description: step.content.body, buttons, advance: step.advance ? { ...cloneOnsite(step.advance), ...step.advance.type === "element_click" || step.advance.type === "element_hover" ? { target: target(step.advance.target ?? step.target) } : {} } : { type: "button" }, presentation: step.presentation, dismissible: step.behavior.dismissible, positionTarget: target(step.target) };
    });
    const layer = (_a = input.guide.behavior) == null ? void 0 : _a.layer;
    const behavior = layer ? { layer: layer.mode === "relative" ? { mode: layer.mode, relation: layer.relation, target: target(layer.target) } : cloneOnsite(layer) } : void 0;
    return { experience: { ...input.experience, kind: "guide", widgetType: null }, selection: { ...cloneOnsite(input.selection), scope: input.scope ?? "step", stepId: selected.id }, guide: { id: input.experience.id, name: input.experience.name, revision: input.revision, currentStepId: selected.id, totalSteps: input.guide.steps.length, steps: summaries, targeting: cloneOnsite(input.guide.targeting), ...behavior ? { behavior } : {}, theme: cloneOnsite(input.theme ?? null) }, currentDocument: cloneOnsite(onsiteDocumentFromBuilder(selected.builder) ?? null) };
  }
  const BLOCK_LABEL = { checklist_task: "Task", checklist_text: "Checklist text", checklist_control: "Checklist control", checklist_progress: "Progress", question: "Question", survey_controls: "Survey controls", heading: "Heading", text: "Text", button: "Button", image: "Image", divider: "Divider", spacer: "Spacer", icon: "Icon" };
  const HISTORY_LIMIT = 50;
  const HISTORY_BYTES = 2e6;
  class OnsiteCompositionEditor {
    constructor(root, builder, content, widgetType, guide, callbacks, survey, checklist) {
      this.root = root;
      this.builder = builder;
      this.content = content;
      this.widgetType = widgetType;
      this.guide = guide;
      this.callbacks = callbacks;
      this.survey = survey;
      this.checklist = checklist;
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
      this.compiledState = "";
      this.imageFileTarget = null;
      this.imageRequest = 0;
      this.imagePlaceholders = /* @__PURE__ */ new Map();
      this.imageDropTarget = null;
      this.savedRange = null;
      this.moveSource = null;
      this.checklistView = "expanded";
      this.rememberSelection = () => {
        var _a;
        const range2 = editorRange(this.root);
        if (range2 && ((_a = this.surface) == null ? void 0 : _a.contains(range2.commonAncestorContainer))) this.savedRange = range2.cloneRange();
      };
      this.onSurfaceClick = (event) => {
        const element = event.target instanceof Element ? event.target : null;
        if (!element) return;
        const blockElement = element.closest("[data-movcues-block-id]");
        const cellElement = element.closest("[data-movcues-node-id]");
        if (this.moveSource && cellElement) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.moveTo(cellElement.dataset.movcuesNodeId);
          return;
        }
        if (blockElement && cellElement) {
          const block = findBlock(this.document, blockElement.dataset.movcuesBlockId);
          if (block) this.select({ kind: "block", label: BLOCK_LABEL[block.type], cellId: cellElement.dataset.movcuesNodeId, blockId: block.id, blockType: block.type });
        } else if (cellElement) this.select({ kind: "cell", label: "Cell", cellId: cellElement.dataset.movcuesNodeId });
        else this.selectStep();
        if (blockElement == null ? void 0 : blockElement.hasAttribute("data-movcues-image-placeholder")) this.chooseImageFile(blockElement.dataset.movcuesBlockId);
        if (element.closest("[data-movcues-empty-cell]")) this.openPalette(element.closest("[data-movcues-empty-cell]"));
        if (blockElement == null ? void 0 : blockElement.matches("button,a")) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      };
      this.onImageDragOver = (event) => {
        var _a, _b, _c;
        if (this.moveSource && ((_a = event.dataTransfer) == null ? void 0 : _a.types.includes("application/x-movcues-cell"))) {
          event.preventDefault();
          event.stopPropagation();
          this.clearImageDrop();
          const target2 = event.target instanceof Element ? event.target.closest("[data-movcues-node-id]") : null;
          const source = findCell(this.document, this.moveSource);
          if (target2 && source && target2.dataset.movcuesNodeId !== this.document.root.id && !findCell({ ...this.document, root: source }, target2.dataset.movcuesNodeId)) {
            this.imageDropTarget = target2;
            const row = ((_b = parentCell(this.document, target2.dataset.movcuesNodeId)) == null ? void 0 : _b.direction) === "row";
            target2.setAttribute("data-movcues-insertion-edge", this.dropBefore(target2, event) ? row ? "left" : "top" : row ? "right" : "bottom");
            event.dataTransfer.dropEffect = "move";
          } else event.dataTransfer.dropEffect = "none";
          return;
        }
        if (!((_c = event.dataTransfer) == null ? void 0 : _c.types.includes("Files"))) return;
        event.preventDefault();
        event.stopPropagation();
        const target = event.target instanceof Element ? event.target.closest("[data-movcues-block-id]") : null;
        const block = target ? findBlock(this.document, target.dataset.movcuesBlockId) : null;
        this.clearImageDrop();
        event.dataTransfer.dropEffect = (block == null ? void 0 : block.type) === "image" ? "copy" : "none";
        if (target && (block == null ? void 0 : block.type) === "image") {
          this.imageDropTarget = target;
          target.setAttribute("data-movcues-image-drop", "");
        }
      };
      this.onImageDragLeave = (event) => {
        var _a;
        if (!(event.relatedTarget instanceof Node) || !((_a = this.imageDropTarget) == null ? void 0 : _a.contains(event.relatedTarget))) this.clearImageDrop();
      };
      this.onMoveDragStart = (event) => {
        if (!(event.target instanceof Element) || !event.target.closest('[data-command="move"]')) return;
        const cell = this.getSelectedCell();
        if (!cell || cell === this.document.root || !event.dataTransfer) {
          event.preventDefault();
          return;
        }
        this.moveSource = cell.id;
        event.dataTransfer.setData("application/x-movcues-cell", cell.id);
        event.dataTransfer.effectAllowed = "move";
      };
      this.cancelMove = () => {
        var _a, _b;
        this.moveSource = null;
        this.clearImageDrop();
        (_a = this.surface) == null ? void 0 : _a.removeAttribute("data-movcues-moving");
        (_b = this.toolbar.querySelector('[data-command="move"]')) == null ? void 0 : _b.setAttribute("aria-pressed", "false");
      };
      this.onImageDrop = (event) => {
        var _a, _b;
        if (this.moveSource && ((_a = event.dataTransfer) == null ? void 0 : _a.types.includes("application/x-movcues-cell"))) {
          event.preventDefault();
          event.stopPropagation();
          const target2 = event.target instanceof Element ? event.target.closest("[data-movcues-node-id]") : null;
          if (target2) this.moveTo(target2.dataset.movcuesNodeId, this.dropBefore(target2, event));
          this.cancelMove();
          return;
        }
        if (!((_b = event.dataTransfer) == null ? void 0 : _b.files.length)) return;
        event.preventDefault();
        event.stopPropagation();
        this.clearImageDrop();
        const target = event.target instanceof Element ? event.target.closest("[data-movcues-block-id]") : null;
        const block = target ? findBlock(this.document, target.dataset.movcuesBlockId) : null;
        if ((block == null ? void 0 : block.type) !== "image") {
          this.callbacks.onValidation(["Drop the file onto an image block."]);
          return;
        }
        if (event.dataTransfer.files.length !== 1) {
          this.callbacks.onValidation(["Choose one image at a time."]);
          return;
        }
        void this.setImageFile(event.dataTransfer.files[0], block.id);
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
          this.rememberSelection();
          if (event.relatedTarget) element.contentEditable = "false";
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
        var _a;
        if (this.composing) return;
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (event.key === "Escape") {
          this.cancelMove();
          if (target == null ? void 0 : target.isContentEditable) target.blur();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && (target == null ? void 0 : target.isContentEditable)) {
          event.preventDefault();
          const range2 = document.createRange();
          range2.selectNodeContents(target);
          setEditorRange(this.root, range2);
          this.savedRange = range2.cloneRange();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          event.stopImmediatePropagation();
          event.shiftKey ? this.redo() : this.undo();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && ["b", "i", "u"].includes(event.key.toLowerCase())) {
          event.preventDefault();
          this.rememberSelection();
          this.formatInline(event.key.toLowerCase() === "b" ? "strong" : event.key.toLowerCase() === "i" ? "em" : "u");
          return;
        }
        if (target == null ? void 0 : target.isContentEditable) return;
        if (this.moveSource && event.key === "Tab" && (target == null ? void 0 : target.hasAttribute("data-movcues-node-id"))) {
          const destinations = this.moveDestinations();
          const index = destinations.indexOf(target);
          (_a = destinations[(index + (event.shiftKey ? -1 : 1) + destinations.length) % destinations.length]) == null ? void 0 : _a.focus({ preventScroll: true });
          event.preventDefault();
          return;
        }
        if (event.key === "Enter" && (target == null ? void 0 : target.matches("[data-movcues-node-id]"))) {
          event.preventDefault();
          if (this.moveSource) this.moveTo(target.dataset.movcuesNodeId);
          else target.click();
        }
        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault();
          this.move(event.key === "ArrowUp" ? -1 : 1);
        } else if (event.ctrlKey || event.metaKey) {
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
      this.onPaste = (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest('[contenteditable="true"]') : null;
        if (!target || !event.clipboardData) return;
        const range2 = editorRange(this.root);
        if (!range2 || !target.contains(range2.commonAncestorContainer)) return;
        event.preventDefault();
        const text2 = document.createTextNode(event.clipboardData.getData("text/plain"));
        range2.deleteContents();
        range2.insertNode(text2);
        range2.setStartAfter(text2);
        range2.collapse(true);
        setEditorRange(this.root, range2);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      };
      this.onToolbarClick = (event) => {
        var _a, _b, _c;
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
        else if (command === "move") {
          if (this.moveSource) this.cancelMove();
          else {
            this.moveSource = ((_a = this.getSelectedCell()) == null ? void 0 : _a.id) ?? null;
            (_b = this.surface) == null ? void 0 : _b.setAttribute("data-movcues-moving", "");
            button.setAttribute("aria-pressed", "true");
            button.title = "Choose a destination cell, or press Escape to cancel";
            if (event.detail === 0) (_c = this.moveDestinations()[0]) == null ? void 0 : _c.focus({ preventScroll: true });
          }
        }
      };
      this.onPaletteClick = (event) => {
        var _a;
        const button = event.target instanceof Element ? event.target.closest("[data-insert-block],[data-insert-question],[data-insert-task]") : null;
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        if (button.hasAttribute("data-insert-task") ? this.insertTask(this.insertion ?? void 0) : button.dataset.insertQuestion ? this.insertQuestion(button.dataset.insertQuestion, this.insertion ?? void 0) : this.insertBlock(button.dataset.insertBlock, this.insertion ?? void 0)) {
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
        if (event.key === "Escape" && this.moveSource) {
          this.cancelMove();
          event.preventDefault();
        }
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
        if (this.composing) return;
        const handle = event.currentTarget;
        const firstId = handle.dataset.first;
        const secondId = handle.dataset.second;
        const first = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-node-id="${firstId}"]`);
        const second = (_b = this.surface) == null ? void 0 : _b.querySelector(`[data-movcues-node-id="${secondId}"]`);
        if (!first || !second) return;
        if (!this.beforeTransaction()) return;
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
        const finish = (save) => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", stop);
          window.removeEventListener("pointercancel", cancel);
          cancelAnimationFrame(this.resizeFrame);
          this.resizeFrame = 0;
          this.resizeCleanup = null;
          if (save && !this.destroyed && resizeSiblings(this.document, firstId, secondId, ratio)) this.commit(this.selection);
          else {
            first.style.flex = "";
            second.style.flex = "";
          }
        };
        const stop = () => finish(true);
        const cancel = () => finish(false);
        (_c = this.resizeCleanup) == null ? void 0 : _c.call(this);
        this.resizeCleanup = cancel;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", cancel);
      };
      this.resizeWithKeyboard = (event) => {
        var _a;
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        const handle = event.currentTarget;
        const first = findCell(this.document, handle.dataset.first);
        const weight = (first == null ? void 0 : first.sizing.mode) === "flexible" ? first.sizing.weight : 1;
        const increase = event.key === "ArrowRight" || event.key === "ArrowDown";
        if (!this.beforeTransaction()) return;
        if (resizeSiblings(this.document, handle.dataset.first, handle.dataset.second, weight + (increase ? 0.1 : -0.1))) this.commit(this.selection);
        (_a = this.root.querySelector(`[data-movcues-resize-handle][data-first="${handle.dataset.first}"][data-second="${handle.dataset.second}"]`)) == null ? void 0 : _a.focus({ preventScroll: true });
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
      this.imageInput = document.createElement("input");
      this.imageInput.type = "file";
      this.imageInput.accept = "image/png,image/jpeg,image/webp";
      this.imageInput.hidden = true;
      this.imageInput.dataset.movcuesImageFile = "";
      this.imageInput.addEventListener("change", () => {
        var _a;
        const id = this.imageFileTarget;
        this.imageFileTarget = null;
        const file = (_a = this.imageInput.files) == null ? void 0 : _a[0];
        if (id && file) void this.setImageFile(file, id);
      });
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
        ["move", "Move to another cell: drag or click, then choose a cell", '<path d="M8 2v12M2 8h12m-4-4 4 4-4 4M6 4 2 8l4 4"/>'],
        ["delete", "Delete", '<path d="m4 4 8 8m0-8-8 8"/>']
      ];
      this.toolbar.innerHTML = tools.map(([command, label, icon]) => `<button type="button" data-command="${command}" title="${label}" aria-label="${label}"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></button>`).join("");
      this.toolbar.querySelector('[data-command="move"]').draggable = true;
      this.palette.innerHTML = Object.keys(BLOCK_LABEL).filter((type) => type !== "question" && type !== "survey_controls" && !type.startsWith("checklist_") && !(this.checklist && type === "button")).map((type) => `<button type="button" data-insert-block="${type}">${BLOCK_LABEL[type]}</button>`).join("");
      if (this.survey) this.palette.insertAdjacentHTML("beforeend", QUESTION_TYPES.map((type) => `<button type="button" data-insert-question="${type}">${{ single_choice: "Single choice", multiple_choice: "Multiple choice", short_text: "Short text", long_text: "Long text", rating: "Rating", nps: "NPS" }[type]}</button>`).join(""));
      this.root.append(this.toolbar, this.palette, this.imageInput);
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
      if (this.checklist) this.palette.insertAdjacentHTML("afterbegin", '<button type="button" data-insert-task>Task</button>');
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
      const id = this.selection.kind === "step" ? this.checklist ? this.document.root.children.find((cell) => cell.checklistRole === this.checklistView).id : this.document.root.id : this.selection.cellId;
      return findCell(this.document, id);
    }
    getSelectedBlock() {
      return this.selection.kind === "block" ? findBlock(this.document, this.selection.blockId) : null;
    }
    canUndo() {
      return this.historyIndex > 0 || this.historyIndex >= 0 && this.historyState() !== this.historyState(this.history[this.historyIndex]);
    }
    canRedo() {
      return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1 && this.historyState() === this.historyState(this.history[this.historyIndex]);
    }
    isComposing() {
      return this.composing;
    }
    getValidation() {
      return [...validateOnsiteDocument(this.document).errors, ...this.survey ? validateOnsiteSurveyDocument(this.document, this.surveyContext()) : [], ...this.checklist ? validateOnsiteChecklistDocument(this.document, this.checklist) : []];
    }
    /** Commits an already-reviewed AI proposal as one undoable transaction. */
    applyAiProposal(proposal) {
      if (this.guide || this.survey || this.checklist || this.composing || !this.beforeTransaction()) return false;
      try {
        this.document = applyEditorAiProposal(this.document, proposal);
        this.commit(this.selection);
        return true;
      } catch (error) {
        const previous = this.history[this.historyIndex];
        if (previous) this.document = cloneOnsite(previous.document);
        this.callbacks.onValidation([error instanceof Error ? error.message : "AI proposal is invalid."]);
        return false;
      }
    }
    flush() {
      if (this.composing) return false;
      clearTimeout(this.compileTimer);
      this.compileTimer = 0;
      this.repairDocumentStructure();
      const state = this.historyState();
      if (state === this.compiledState) return true;
      const errors = this.getValidation();
      this.callbacks.onValidation(errors);
      if (errors.length) return false;
      const compiled = applyOnsiteDocument(this.builder, this.document, this.widgetType, this.surveyContext(), this.checklist);
      Object.assign(this.content, compiled.content);
      this.compiledState = state;
      return true;
    }
    snapshot() {
      this.flush();
      return { builder: cloneOnsite(this.builder), content: cloneOnsite(this.content) };
    }
    undo() {
      if (this.composing) return;
      if (!this.flush()) {
        clearTimeout(this.typingTimer);
        const current = this.history[this.historyIndex];
        if (current) this.restore(current);
        return;
      }
      this.pushHistory();
      if (!this.canUndo()) return;
      clearTimeout(this.typingTimer);
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
      if (!cell || this.composing) return false;
      if (!this.beforeTransaction()) return false;
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
      if (!cell || this.composing) return false;
      if (!this.beforeTransaction()) return false;
      const id = splitCell(this.document, cell.id, direction);
      if (!id) return false;
      this.commit({ kind: "cell", label: direction === "row" ? "Right cell" : "Lower cell", cellId: id });
      return true;
    }
    addEdge(edge) {
      if (this.composing) return;
      if (!this.beforeTransaction()) return;
      const id = insertEdgeCell(this.document, edge);
      this.commit({ kind: "cell", label: `${edge} cell`, cellId: id });
    }
    duplicate() {
      const cell = this.getSelectedCell();
      if (!cell || cell === this.document.root || this.composing) return false;
      if (!this.beforeTransaction()) return false;
      if (this.checklist) {
        const duplicated = duplicateChecklistCell(this.document, this.checklist, cell.id);
        if (!duplicated) {
          this.callbacks.onValidation(["Required Checklist components cannot be duplicated."]);
          return false;
        }
        this.document = duplicated.document;
        this.checklist.items = duplicated.items;
        this.commit({ kind: "cell", label: "Duplicated cell", cellId: duplicated.cellId });
        return true;
      }
      if (this.survey) {
        const duplicated = duplicateSurveyCell(this.document, this.survey.step.questions, cell.id);
        if (!duplicated) return false;
        this.document = duplicated.document;
        this.survey.step.questions = duplicated.questions;
        this.commit({ kind: "cell", label: "Duplicated cell", cellId: duplicated.cellId });
        return true;
      }
      const id = duplicateCell(this.document, cell.id);
      if (!id) return false;
      this.commit({ kind: "cell", label: "Duplicated cell", cellId: id });
      return true;
    }
    remove() {
      const cell = this.getSelectedCell();
      if (!cell || cell === this.document.root || this.composing) return false;
      if (!this.beforeTransaction()) return false;
      if (this.survey && listBlocks(cell).some((block) => block.type === "survey_controls")) {
        this.callbacks.onValidation(["Keep the Survey navigation block so visitors can continue or submit."]);
        return false;
      }
      if (this.checklist) {
        const components = listBlocks(cell);
        if (cell.checklistRole || components.some((block) => block.type.startsWith("checklist_") && block.type !== "checklist_task")) {
          this.callbacks.onValidation(["Keep the required Checklist views and controls. You can style or move them within their view."]);
          return false;
        }
        const removedTasks = new Set(components.filter((block) => block.type === "checklist_task").map((block) => block.itemId));
        if (this.checklist.items.length - removedTasks.size < 1) {
          this.callbacks.onValidation(["Keep at least one task in this Checklist."]);
          return false;
        }
        this.checklist.items = this.checklist.items.filter((item) => !removedTasks.has(item.id));
      }
      const removed = new Set(listBlocks(cell).filter((block) => block.type === "question").map((block) => block.type === "question" ? block.questionId : ""));
      const parent = parentCell(this.document, cell.id);
      if (!removeCell(this.document, cell.id)) return false;
      if (this.survey) {
        this.survey.step.questions = this.survey.step.questions.filter((question) => !removed.has(question.id));
        if (this.survey.step.branching) this.survey.step.branching.rules = this.survey.step.branching.rules.filter((rule) => !removed.has(rule.questionId));
      }
      this.commit(parent ? { kind: "cell", label: "Parent cell", cellId: parent.id } : { kind: "step", label: "Step" });
      return true;
    }
    move(delta) {
      const cell = this.getSelectedCell();
      if (!cell || this.composing) return false;
      if (!this.beforeTransaction()) return false;
      if (!moveCell(this.document, cell.id, delta)) return false;
      this.commit(this.selection);
      return true;
    }
    /** Move the existing subtree; never regenerate its cell/block/action IDs. */
    moveTo(targetId, before = false, sourceId = this.moveSource ?? ((_a) => (_a = this.getSelectedCell()) == null ? void 0 : _a.id)()) {
      if (!sourceId || sourceId === targetId || this.composing) return false;
      const candidate = cloneOnsite(this.document);
      const source = findCell(candidate, sourceId);
      const target = findCell(candidate, targetId);
      const from = parentCell(candidate, sourceId);
      if (!source || !target || !(from == null ? void 0 : from.children) || findCell({ ...candidate, root: source }, targetId)) return false;
      from.children.splice(from.children.indexOf(source), 1);
      if (!from.children.length) delete from.children;
      if (!target.block && !target.children) target.children = [source];
      else {
        const to = parentCell(candidate, targetId);
        if (!(to == null ? void 0 : to.children)) return false;
        to.children.splice(to.children.indexOf(target) + (before ? 0 : 1), 0, source);
      }
      const validation = validateOnsiteDocument(candidate);
      this.callbacks.onValidation(validation.errors);
      if (!validation.valid) return false;
      if (!this.beforeTransaction()) return false;
      this.document = candidate;
      this.cancelMove();
      this.commit(source.block ? { kind: "block", label: BLOCK_LABEL[source.block.type], cellId: source.id, blockId: source.block.id, blockType: source.block.type } : { kind: "cell", label: "Cell", cellId: source.id });
      return true;
    }
    checklistState() {
      const value = this.checklist;
      return cloneOnsite({ title: value.title, description: value.description, items: value.items, behavior: value.behavior, completionMessage: value.completionMessage });
    }
    updateChecklistViewWidth(width) {
      if (!this.checklist || !this.beforeTransaction()) return;
      const view = this.document.root.children.find((cell) => cell.checklistRole === this.checklistView);
      view.checklistWidth = width;
      this.commit(this.selection);
    }
    refreshChecklist() {
      var _a, _b;
      (_b = (_a = this.callbacks).onPatch) == null ? void 0 : _b.call(_a);
      this.callbacks.onSelectionChange(this.selection);
    }
    setChecklistView(view) {
      this.checklistView = view;
    }
    getSelectedTask() {
      var _a;
      const block = this.getSelectedBlock();
      return (block == null ? void 0 : block.type) === "checklist_task" ? ((_a = this.checklist) == null ? void 0 : _a.items.find((item) => item.id === block.itemId)) ?? null : null;
    }
    updateChecklist(update) {
      if (!this.checklist || !this.beforeTransaction()) return false;
      const next = this.checklistState();
      update(next);
      if (!next.title.trim() || next.title.length > 160 || !next.completionMessage.title.trim() || !next.completionMessage.acknowledgeLabel.trim() || next.completionMessage.acknowledgeLabel.length > 80 || next.items.some((item) => {
        var _a;
        return !item.title.trim() || item.title.length > 200 || (((_a = item.description) == null ? void 0 : _a.length) ?? 0) > 1e3 || item.action.type === "none" && item.completion.type !== "item_clicked";
      })) {
        this.callbacks.onValidation(["Use a title and valid task settings. Tasks without an action must complete when clicked."]);
        return false;
      }
      Object.assign(this.checklist, next);
      this.commit(this.selection);
      return true;
    }
    insertTask(insertion) {
      if (!this.checklist || this.checklist.items.length >= 20 || !this.beforeTransaction()) return false;
      let container;
      const visit = (cell2) => {
        var _a;
        if (cell2.checklistRole === "items") container = cell2;
        (_a = cell2.children) == null ? void 0 : _a.forEach(visit);
      };
      visit(this.document.root);
      if (!container) return false;
      const item = { id: onsiteId("item"), title: "New task", description: "Describe the next step.", action: { type: "none" }, completion: { type: "item_clicked" } };
      let cell;
      if (insertion) {
        let target = findCell(this.document, insertion.cellId);
        while (target && target !== container) target = parentCell(this.document, target.id);
        if (!target) {
          this.callbacks.onValidation(["Insert tasks inside the Expanded task list."]);
          return false;
        }
        const id = insertAdjacentCell(this.document, insertion.cellId, insertion.edge);
        if (!id) return false;
        cell = findCell(this.document, id);
        cell.block = { id: onsiteId("block"), type: "checklist_task", itemId: item.id, fontSize: 14, indicator: "check" };
      } else {
        cell = emptyCell({ id: onsiteId("block"), type: "checklist_task", itemId: item.id, fontSize: 14, indicator: "check" });
        container.children.push(cell);
      }
      cell.sizing = { mode: "hug" };
      this.checklist.items.push(item);
      this.checklistView = "expanded";
      this.commit({ kind: "block", label: "Task", cellId: cell.id, blockId: cell.block.id, blockType: "checklist_task" });
      return true;
    }
    surveyContext() {
      return this.survey ? { questions: this.survey.step.questions, submitLabel: this.survey.config.submitLabel } : void 0;
    }
    historyState(entry) {
      return JSON.stringify(this.checklist ? { document: (entry == null ? void 0 : entry.document) ?? this.document, checklist: entry ? entry.checklist : this.checklistState() } : this.survey ? entry ? { document: entry.document, questions: entry.questions, branching: entry.branching } : { document: this.document, questions: this.survey.step.questions, branching: this.survey.step.branching } : (entry == null ? void 0 : entry.document) ?? this.document);
    }
    getSelectedQuestion() {
      var _a;
      const block = this.getSelectedBlock();
      return (block == null ? void 0 : block.type) === "question" ? ((_a = this.survey) == null ? void 0 : _a.step.questions.find((question) => question.id === block.questionId)) ?? null : null;
    }
    refreshSurvey() {
      this.compileAndPatch();
      this.select(this.selection);
    }
    insertQuestion(type, insertion) {
      if (!this.survey || !QUESTION_TYPES.includes(type) || this.survey.step.questions.length >= 20 || !this.beforeTransaction()) return false;
      const selected = this.getSelectedCell();
      if (!selected) return false;
      const candidate = cloneOnsite(this.document), question = newSurveyQuestion(type);
      const block = { id: onsiteId("block"), type: "question", questionId: question.id, fontSize: 14 };
      let cell = findCell(candidate, selected.id);
      if (insertion) {
        const id = insertAdjacentCell(candidate, insertion.cellId, insertion.edge);
        if (!id) return false;
        cell = findCell(candidate, id);
      } else if (cell.children) {
        const added = emptyCell();
        cell.children.push(added);
        cell = added;
      } else if (cell.block) {
        const id = insertAdjacentCell(candidate, cell.id, "bottom");
        if (!id) return false;
        cell = findCell(candidate, id);
      }
      cell.block = block;
      cell.sizing = { mode: "hug" };
      const questions = [...this.survey.step.questions, question];
      const errors = [...validateOnsiteDocument(candidate).errors, ...validateOnsiteSurveyDocument(candidate, { questions })];
      if (errors.length) {
        this.callbacks.onValidation(errors);
        return false;
      }
      this.document = candidate;
      this.survey.step.questions = questions;
      this.commit({ kind: "block", label: "Question", cellId: cell.id, blockId: block.id, blockType: block.type });
      return true;
    }
    updateStepHeading(label) {
      if (!this.survey || !this.beforeTransaction()) return false;
      const heading = listBlocks(this.document.root).find((block) => block.type === "heading");
      if ((heading == null ? void 0 : heading.type) !== "heading") {
        this.callbacks.onValidation(["Insert a Heading block to set the step heading."]);
        return false;
      }
      heading.html = escapeHtmlAttribute(label.slice(0, 160));
      this.commit(this.selection);
      return true;
    }
    updateBranching(branching) {
      if (!this.survey || !this.beforeTransaction()) return false;
      const step = { ...this.survey.step, branching: cloneOnsite(branching) };
      const errors = surveyBranchErrors({ ...this.survey.config, steps: this.survey.config.steps.map((value) => value.id === step.id ? step : value) });
      if (errors.length) {
        this.callbacks.onValidation(errors);
        return false;
      }
      this.survey.step.branching = step.branching;
      this.commit(this.selection);
      return true;
    }
    updateQuestion(question) {
      const current = this.getSelectedQuestion();
      if (!this.survey || !current || current.id !== question.id || !this.beforeTransaction()) return false;
      const questions = this.survey.step.questions.map((value) => value.id === question.id ? cloneOnsite(question) : value);
      const errors = surveyQuestionErrors(questions);
      if (errors.length) {
        this.callbacks.onValidation(errors);
        return false;
      }
      this.survey.step.questions = questions;
      if (this.survey.step.branching) this.survey.step.branching.rules = this.survey.step.branching.rules.filter((rule) => {
        if (rule.questionId !== question.id) return true;
        const step = { ...this.survey.step, branching: { rules: [rule] } };
        return !surveyBranchErrors({ ...this.survey.config, steps: this.survey.config.steps.map((value) => value.id === step.id ? step : value) }).length;
      });
      this.commit(this.selection);
      return true;
    }
    updateCell(update) {
      const cell = this.getSelectedCell();
      if (!cell || this.composing) return;
      if (!this.beforeTransaction()) return;
      Object.assign(cell, cloneOnsite(update));
      this.commit(this.selection);
    }
    updateBlock(update) {
      const block = this.getSelectedBlock();
      if (!block || this.composing) return;
      if (!this.beforeTransaction()) return;
      Object.assign(block, cloneOnsite(update));
      this.commit(this.selection);
    }
    chooseImageFile(blockId) {
      const block = blockId ? findBlock(this.document, blockId) : this.getSelectedBlock();
      if ((block == null ? void 0 : block.type) !== "image" || this.destroyed) return;
      this.imageFileTarget = block.id;
      this.imageInput.value = "";
      this.imageInput.click();
    }
    setImageSource(src) {
      var _a;
      if (((_a = this.getSelectedBlock()) == null ? void 0 : _a.type) !== "image") return false;
      if (!onsiteImageSourceIsSafe(src)) {
        this.callbacks.onValidation(["Use an HTTP(S) image URL, a /path on your site, or choose an image file."]);
        return false;
      }
      this.callbacks.onValidation([]);
      this.updateBlock({ src });
      return true;
    }
    async setImageFile(file, blockId) {
      var _a, _b, _c, _d, _e;
      const block = blockId ? findBlock(this.document, blockId) : this.getSelectedBlock();
      if ((block == null ? void 0 : block.type) !== "image" || this.destroyed) return false;
      const request = ++this.imageRequest;
      const id = block.id;
      const previousSrc = block.src;
      const placeholder = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-image-placeholder][data-movcues-block-id="${id}"]`);
      if (placeholder) {
        placeholder.disabled = true;
        placeholder.setAttribute("aria-busy", "true");
      }
      (_c = (_b = this.callbacks).onImageStatus) == null ? void 0 : _c.call(_b, "Preparing image…");
      try {
        const src = await prepareImageFile(file);
        if (this.destroyed || request !== this.imageRequest) return false;
        const current = findBlock(this.document, id);
        if ((current == null ? void 0 : current.type) !== "image" || current.src !== previousSrc) return false;
        const candidate = cloneOnsite(this.document);
        const image = findBlock(candidate, id);
        if ((image == null ? void 0 : image.type) !== "image") return false;
        image.src = src;
        const validation = validateOnsiteDocument(candidate);
        this.callbacks.onValidation(validation.errors);
        if (!validation.valid) return false;
        if (!this.flush()) return false;
        this.document = candidate;
        this.commit(this.selection);
        return true;
      } catch (error) {
        if (!this.destroyed && request === this.imageRequest) this.callbacks.onValidation([error instanceof Error ? error.message : "Image could not be added. Try another file."]);
        return false;
      } finally {
        if (placeholder) {
          placeholder.disabled = false;
          placeholder.removeAttribute("aria-busy");
        }
        if (!this.destroyed && request === this.imageRequest) (_e = (_d = this.callbacks).onImageStatus) == null ? void 0 : _e.call(_d, "");
        this.imageInput.value = "";
      }
    }
    updateButtonAction(action) {
      const block = this.getSelectedBlock();
      if ((block == null ? void 0 : block.type) !== "button") return;
      if (!this.beforeTransaction()) return;
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
      if ((block == null ? void 0 : block.type) !== "text" || this.composing) return false;
      if (!this.beforeTransaction()) return false;
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
      var _a, _b, _c;
      if (this.composing) return false;
      const block = this.getSelectedBlock();
      if (!block || block.type !== "heading" && block.type !== "text") return false;
      const element = (_a = this.surface) == null ? void 0 : _a.querySelector(`[data-movcues-block-id="${block.id}"]`);
      if (!element) return false;
      if (!this.beforeTransaction()) return false;
      if (this.savedRange && element.contains(this.savedRange.commonAncestorContainer)) {
        setEditorRange(this.root, this.savedRange);
      }
      const range2 = editorRange(this.root);
      const selectedInside = range2 && element.contains(range2.commonAncestorContainer) && !range2.collapsed;
      if (tag === "a" && (selectedInside ? (range2 == null ? void 0 : range2.cloneContents().querySelector("a")) || ((_b = range2 == null ? void 0 : range2.startContainer.parentElement) == null ? void 0 : _b.closest("a")) || ((_c = range2 == null ? void 0 : range2.endContainer.parentElement) == null ? void 0 : _c.closest("a")) : element.querySelector("a"))) return false;
      if (selectedInside && range2) {
        const wrapper = document.createElement(tag);
        if (tag === "a" && href) {
          wrapper.setAttribute("href", href);
          if (/^https?:\/\//i.test(href)) {
            wrapper.setAttribute("target", "_blank");
            wrapper.setAttribute("rel", "noopener noreferrer");
          }
        }
        try {
          range2.surroundContents(wrapper);
        } catch {
          wrapper.append(range2.extractContents());
          range2.insertNode(wrapper);
        }
        block.html = sanitizeRichText(element.innerHTML);
      } else {
        const open = tag === "a" ? `<a href="${escapeHtmlAttribute(href ?? "")}"${/^https?:\/\//i.test(href ?? "") ? ' target="_blank" rel="noopener noreferrer"' : ""}>` : `<${tag}>`;
        block.html = `${open}${block.html}</${tag}>`;
      }
      if (!selectedInside) element.innerHTML = block.html;
      element.contentEditable = "true";
      element.focus({ preventScroll: true });
      this.rememberSelection();
      this.flush();
      this.pushHistory();
      this.callbacks.onChange();
      this.positionTools();
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
      if (!this.flush()) return false;
      this.pushHistory();
      return true;
    }
    commit(selection) {
      this.repairDocumentStructure();
      if (this.checklist) {
        const byId = new Map(this.checklist.items.map((item) => [item.id, item]));
        this.checklist.items = listBlocks(this.document.root).filter((block) => block.type === "checklist_task").map((block) => byId.get(block.itemId)).filter(Boolean);
      }
      const errors = this.getValidation();
      const validation = { valid: !errors.length, errors };
      if (!validation.valid) {
        const previous = this.history[this.historyIndex];
        if (previous) {
          this.document = cloneOnsite(previous.document);
          if (this.checklist && previous.checklist) Object.assign(this.checklist, cloneOnsite(previous.checklist));
          if (this.survey && previous.questions) {
            this.survey.step.questions = cloneOnsite(previous.questions);
            this.survey.step.branching = previous.branching ? cloneOnsite(previous.branching) : void 0;
          }
          this.compileAndPatch();
          this.select(previous.selection);
        }
        this.callbacks.onValidation(validation.errors);
        return;
      }
      if (this.historyState() === this.compiledState) {
        this.select(selection);
        return;
      }
      this.selection = selection;
      this.compileAndPatch();
      this.pushHistory();
      this.callbacks.onChange();
      this.select(selection);
    }
    compileAndPatch() {
      var _a, _b, _c, _d, _e, _f;
      const compiled = applyOnsiteDocument(this.builder, this.document, this.widgetType, this.surveyContext(), this.checklist);
      Object.assign(this.content, compiled.content);
      this.compiledState = this.historyState();
      const template = document.createElement("template");
      template.innerHTML = compiled.html;
      (_a = this.surface) == null ? void 0 : _a.replaceChildren(...Array.from(template.content.childNodes));
      this.imagePlaceholders.clear();
      (_b = this.surface) == null ? void 0 : _b.querySelectorAll("[data-movcues-question-input]").forEach((input) => {
        input.readOnly = true;
        input.tabIndex = -1;
      });
      this.savedRange = null;
      (_c = this.surface) == null ? void 0 : _c.querySelectorAll("[data-movcues-node-id]").forEach((cell) => {
        cell.tabIndex = 0;
        cell.setAttribute("aria-label", "Layout cell");
        if (!cell.children.length) {
          const add = document.createElement("button");
          add.type = "button";
          add.dataset.movcuesEmptyCell = "";
          add.textContent = "+ Add content";
          cell.append(add);
        }
      });
      (_d = this.surface) == null ? void 0 : _d.querySelectorAll('img[data-movcues-block-id][src=""]').forEach((image) => {
        const placeholder = document.createElement("button");
        placeholder.type = "button";
        placeholder.className = image.className;
        placeholder.dataset.movcuesBlockId = image.dataset.movcuesBlockId;
        placeholder.dataset.movcuesImagePlaceholder = "";
        placeholder.setAttribute("aria-label", "Choose image");
        placeholder.innerHTML = '<svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg><span>Drop an image or click to browse</span>';
        image.replaceWith(placeholder);
        this.imagePlaceholders.set(placeholder, image);
      });
      const style = this.root.querySelector("style[data-movcues-builder-style]");
      if (style) style.textContent = `${compiled.css}
[data-movcues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movcues-builder-surface]>.movcues-widget{position:relative!important;inset:auto!important}`;
      (_f = (_e = this.callbacks).onPatch) == null ? void 0 : _f.call(_e);
    }
    scheduleCompile() {
      clearTimeout(this.compileTimer);
      this.compileTimer = window.setTimeout(() => {
        if (!this.destroyed && !this.composing) this.flush();
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
      var _a;
      const document2 = cloneOnsite(this.document), questions = this.survey ? cloneOnsite(this.survey.step.questions) : void 0, branching = ((_a = this.survey) == null ? void 0 : _a.step.branching) ? cloneOnsite(this.survey.step.branching) : void 0;
      const bytes = this.historyState().length;
      const entry = { document: document2, questions, branching, checklist: this.checklist ? this.checklistState() : void 0, selection: cloneOnsite(this.selection), bytes };
      if (this.historyIndex >= 0 && this.historyState(this.history[this.historyIndex]) === this.historyState()) return;
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
      if (this.checklist && entry.checklist) Object.assign(this.checklist, cloneOnsite(entry.checklist));
      if (this.survey && entry.questions) {
        this.survey.step.questions = cloneOnsite(entry.questions);
        this.survey.step.branching = entry.branching ? cloneOnsite(entry.branching) : void 0;
      }
      this.compileAndPatch();
      this.selection = cloneOnsite(entry.selection);
      this.callbacks.onChange();
      this.select(this.selection);
    }
    clearImageDrop() {
      var _a, _b;
      (_a = this.imageDropTarget) == null ? void 0 : _a.removeAttribute("data-movcues-image-drop");
      (_b = this.imageDropTarget) == null ? void 0 : _b.removeAttribute("data-movcues-insertion-edge");
      this.imageDropTarget = null;
    }
    dropBefore(target, event) {
      const rect = target.getBoundingClientRect();
      const parent = parentCell(this.document, target.dataset.movcuesNodeId);
      return (parent == null ? void 0 : parent.direction) === "row" ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
    }
    moveDestinations() {
      var _a;
      const source = this.moveSource ? findCell(this.document, this.moveSource) : null;
      return source ? Array.from(((_a = this.surface) == null ? void 0 : _a.querySelectorAll("[data-movcues-node-id]")) ?? []).filter((cell) => cell.dataset.movcuesNodeId !== this.document.root.id && !findCell({ ...this.document, root: source }, cell.dataset.movcuesNodeId)) : [];
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
      for (const command of ["delete", "duplicate", "move"]) {
        const button = this.toolbar.querySelector(`[data-command="${command}"]`);
        if (!button) continue;
        button.disabled = atRoot;
        button.title = atRoot ? "Select an element to use this action" : command === "delete" ? "Delete selected element (Undo is available)" : "Duplicate";
      }
    }
    updateToolPositions() {
      var _a, _b, _c;
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
      const blockRect = (cell == null ? void 0 : cell.block) ? (_c = target.querySelector("[data-movcues-block-id]")) == null ? void 0 : _c.getBoundingClientRect() : null;
      const edges = { left: Math.min(rect.left, (blockRect == null ? void 0 : blockRect.left) ?? rect.left), right: Math.max(rect.right, (blockRect == null ? void 0 : blockRect.right) ?? rect.right), top: Math.min(rect.top, (blockRect == null ? void 0 : blockRect.top) ?? rect.top), bottom: Math.max(rect.bottom, (blockRect == null ? void 0 : blockRect.bottom) ?? rect.bottom) };
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
    availableCanvasBounds() {
      var _a, _b, _c;
      const inset = 6;
      const editorRoot = (_a = document.querySelector("[data-movcues-editor]")) == null ? void 0 : _a.shadowRoot;
      const panel = (_b = editorRoot == null ? void 0 : editorRoot.querySelector("aside")) == null ? void 0 : _b.getBoundingClientRect();
      const controls = (_c = editorRoot == null ? void 0 : editorRoot.querySelector("[data-editor-toolbar]")) == null ? void 0 : _c.getBoundingClientRect();
      let left = inset;
      let right = innerWidth - inset;
      let top = inset;
      let bottom = innerHeight - inset;
      if (panel && panel.width > 0 && panel.height > 0) {
        if (panel.left < innerWidth / 2 && innerWidth - panel.right > 240) left = Math.max(left, panel.right + inset);
        else if (panel.left >= innerWidth / 2 && panel.left > 240) right = Math.min(right, panel.left - inset);
        else if (panel.width > innerWidth / 2) bottom = Math.min(bottom, panel.top - inset);
      }
      if (controls && controls.height > 0) top = Math.max(top, controls.bottom + inset);
      return { left, right: Math.max(left, right), top, bottom: Math.max(top + 36, bottom) };
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
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
      this.destroyed = true;
      this.imageRequest++;
      clearTimeout(this.compileTimer);
      clearTimeout(this.typingTimer);
      cancelAnimationFrame(this.toolFrame);
      cancelAnimationFrame(this.resizeFrame);
      (_a = this.resizeCleanup) == null ? void 0 : _a.call(this);
      this.closePalette();
      this.clearImageDrop();
      (_b = this.surface) == null ? void 0 : _b.removeEventListener("click", this.onSurfaceClick);
      (_c = this.surface) == null ? void 0 : _c.removeEventListener("dblclick", this.onDoubleClick);
      (_d = this.surface) == null ? void 0 : _d.removeEventListener("input", this.onInput);
      (_e = this.surface) == null ? void 0 : _e.removeEventListener("blur", this.onBlur, true);
      (_f = this.surface) == null ? void 0 : _f.removeEventListener("compositionstart", this.onCompositionStart);
      (_g = this.surface) == null ? void 0 : _g.removeEventListener("compositionend", this.onCompositionEnd);
      (_h = this.surface) == null ? void 0 : _h.removeEventListener("keydown", this.onSurfaceKeyDown);
      (_i = this.surface) == null ? void 0 : _i.removeEventListener("dragover", this.onImageDragOver);
      (_j = this.surface) == null ? void 0 : _j.removeEventListener("dragleave", this.onImageDragLeave);
      (_k = this.surface) == null ? void 0 : _k.removeEventListener("drop", this.onImageDrop);
      (_l = this.surface) == null ? void 0 : _l.removeEventListener("keyup", this.rememberSelection);
      (_m = this.surface) == null ? void 0 : _m.removeEventListener("mouseup", this.rememberSelection);
      (_n = this.surface) == null ? void 0 : _n.removeEventListener("paste", this.onPaste);
      this.toolbar.removeEventListener("dragstart", this.onMoveDragStart);
      this.toolbar.removeEventListener("dragend", this.cancelMove);
      this.cancelMove();
      this.savedRange = null;
      (_o = this.surface) == null ? void 0 : _o.querySelectorAll("[data-movcues-empty-cell]").forEach((element) => element.remove());
      (_p = this.surface) == null ? void 0 : _p.querySelectorAll("[data-movcues-node-id]").forEach((cell) => {
        cell.removeAttribute("tabindex");
        cell.removeAttribute("aria-label");
        cell.removeAttribute("data-movcues-editor-selected");
      });
      this.imagePlaceholders.forEach((image, placeholder) => placeholder.replaceWith(image));
      this.imagePlaceholders.clear();
      this.imageInput.remove();
      this.toolbar.remove();
      this.palette.remove();
      this.edgeButtons.forEach((button) => button.remove());
      this.handles.forEach((handle) => handle.remove());
      (_q = this.root.querySelector("style[data-movcues-composition-style]")) == null ? void 0 : _q.remove();
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
  function escapeHtmlAttribute(value) {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  const shadow = (y, blur, color) => ({ x: 0, y, blur, spread: 0, color });
  const EXPERIENCE_PRESETS = {
    minimal: { version: 1, colors: { background: "#ffffff", surface: "#ffffff", text: "#111827", mutedText: "#64748b", primary: "#2563eb", primaryForeground: "#ffffff", border: "#e2e8f0" }, typography: { bodyFontFamily: "ui-sans-serif, system-ui, sans-serif", headingFontFamily: "ui-sans-serif, system-ui, sans-serif", bodyFontSize: 15, headingFontSize: 24, bodyFontWeight: 400, headingFontWeight: 700, bodyLineHeight: 1.5, headingLineHeight: 1.2 }, radii: { sm: 4, md: 8, lg: 12 }, shadows: { sm: shadow(2, 8, "rgba(15,23,42,.08)"), md: shadow(12, 36, "rgba(15,23,42,.16)") } },
    modern: { version: 1, colors: { background: "#ffffff", surface: "#f8fafc", text: "#0f172a", mutedText: "#64748b", primary: "#4f46e5", primaryForeground: "#ffffff", border: "#e2e8f0" }, typography: { bodyFontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", headingFontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", bodyFontSize: 15, headingFontSize: 28, bodyFontWeight: 400, headingFontWeight: 700, bodyLineHeight: 1.55, headingLineHeight: 1.15 }, radii: { sm: 6, md: 12, lg: 20 }, shadows: { sm: shadow(4, 14, "rgba(15,23,42,.09)"), md: shadow(24, 70, "rgba(15,23,42,.20)") } },
    soft: { version: 1, colors: { background: "#f8fafc", surface: "#ffffff", text: "#1e293b", mutedText: "#64748b", primary: "#0284c7", primaryForeground: "#ffffff", border: "#dbeafe" }, typography: { bodyFontFamily: "ui-rounded, ui-sans-serif, system-ui, sans-serif", headingFontFamily: "ui-rounded, ui-sans-serif, system-ui, sans-serif", bodyFontSize: 15, headingFontSize: 26, bodyFontWeight: 400, headingFontWeight: 700, bodyLineHeight: 1.6, headingLineHeight: 1.2 }, radii: { sm: 10, md: 16, lg: 24 }, shadows: { sm: shadow(6, 18, "rgba(14,116,144,.10)"), md: shadow(22, 58, "rgba(14,116,144,.16)") } },
    dark: { version: 1, colors: { background: "#0f172a", surface: "#1e293b", text: "#f8fafc", mutedText: "#cbd5e1", primary: "#818cf8", primaryForeground: "#0f172a", border: "#334155" }, typography: { bodyFontFamily: "ui-sans-serif, system-ui, sans-serif", headingFontFamily: "ui-sans-serif, system-ui, sans-serif", bodyFontSize: 15, headingFontSize: 26, bodyFontWeight: 400, headingFontWeight: 700, bodyLineHeight: 1.55, headingLineHeight: 1.18 }, radii: { sm: 6, md: 12, lg: 18 }, shadows: { sm: shadow(5, 16, "rgba(0,0,0,.28)"), md: shadow(24, 70, "rgba(0,0,0,.42)") } }
  };
  function resolvedTheme(state) {
    const value = structuredClone(state.baseTokens), o = state.overrides;
    if (o.primary) value.colors.primary = o.primary;
    if (o.secondary) value.colors.surface = o.secondary;
    if (o.background) value.colors.background = o.background;
    if (o.text) value.colors.text = o.text;
    if (o.bodyFontFamily) value.typography.bodyFontFamily = o.bodyFontFamily;
    if (o.headingFontFamily) value.typography.headingFontFamily = o.headingFontFamily;
    if (o.bodyFontSize) value.typography.bodyFontSize = o.bodyFontSize;
    if (o.headingFontSize) value.typography.headingFontSize = o.headingFontSize;
    if (o.radius !== void 0) value.radii = { sm: Math.max(0, o.radius / 2), md: o.radius, lg: Math.min(100, o.radius * 1.5) };
    if (o.buttonRadius !== void 0) value.radii.md = o.buttonRadius;
    if (o.shadow) value.shadows = { sm: o.shadow, md: o.shadow };
    return value;
  }
  const text = (value, max) => sanitizeRichText(value.trim().slice(0, max).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]));
  const isDocumentOperation = (operation) => ["update_text", "update_block", "update_cell", "update_button_action", "insert_block", "remove_cell", "duplicate_cell", "move_cell"].includes(operation.type);
  function questionFromInput(input, id = onsiteId("question")) {
    var _a;
    const base = { id, label: input.label.trim().slice(0, 500), required: input.required ?? false };
    if (input.type === "single_choice" || input.type === "multiple_choice") return { ...base, type: input.type, options: input.options.map((option) => ({ id: onsiteId("option"), label: option.label.trim().slice(0, 200) })) };
    if (input.type === "short_text" || input.type === "long_text") return { ...base, type: input.type, placeholder: ((_a = input.placeholder) == null ? void 0 : _a.slice(0, 500)) ?? "", maxLength: input.maxLength ?? (input.type === "short_text" ? 200 : 2e3) };
    if (input.type === "rating") return { ...base, type: input.type, min: input.min, max: input.max };
    return { ...base, type: "nps" };
  }
  function documentFor(step) {
    const document2 = onsiteDocumentFromBuilder(step.builder);
    if (!document2 || document2.schemaVersion !== 3 || !step.builder) throw new Error(`Survey step ${step.id} has no editable schema-v3 document.`);
    return document2;
  }
  function referenceCell(document2, questionId) {
    let result = null;
    const walk = (cell) => {
      var _a, _b;
      if (((_a = cell.block) == null ? void 0 : _a.type) === "question" && cell.block.questionId === questionId) result = cell;
      (_b = cell.children) == null ? void 0 : _b.forEach(walk);
    };
    walk(document2.root);
    return result;
  }
  function controlsCell(document2) {
    let result = null;
    const walk = (cell) => {
      var _a, _b;
      if (((_a = cell.block) == null ? void 0 : _a.type) === "survey_controls") result = cell;
      (_b = cell.children) == null ? void 0 : _b.forEach(walk);
    };
    walk(document2.root);
    return result;
  }
  function insertQuestionReference(document2, questionId, afterQuestionId) {
    const target = afterQuestionId ? referenceCell(document2, afterQuestionId) : controlsCell(document2);
    if (!target) throw new Error("Survey question insertion point no longer exists.");
    const parent = parentCell(document2, target.id);
    if (!(parent == null ? void 0 : parent.children)) throw new Error("Survey question insertion point is invalid.");
    const index = parent.children.indexOf(target) + (afterQuestionId ? 1 : 0);
    parent.children.splice(index, 0, { ...emptyCell({ id: onsiteId("block"), type: "question", questionId, fontSize: 14 }), sizing: { mode: "hug" } });
  }
  function removeQuestionReference(document2, questionId) {
    const cell = referenceCell(document2, questionId);
    if (!cell || !removeCell(document2, cell.id)) throw new Error("Survey question reference no longer exists.");
  }
  function moveQuestionReference(document2, questionId, beforeQuestionId) {
    const source = referenceCell(document2, questionId), target = beforeQuestionId ? referenceCell(document2, beforeQuestionId) : controlsCell(document2);
    if (!source || !target || source === target) throw new Error("Survey question move target is invalid.");
    const from = parentCell(document2, source.id), to = parentCell(document2, target.id);
    if (!(from == null ? void 0 : from.children) || !(to == null ? void 0 : to.children)) throw new Error("Survey question move target is invalid.");
    from.children.splice(from.children.indexOf(source), 1);
    to.children.splice(to.children.indexOf(target), 0, source);
  }
  function setStepCopy(step, patch, submitLabel) {
    const document2 = documentFor(step), blocks = listBlocks(document2.root);
    if (patch.heading !== void 0) {
      step.content.heading = patch.heading.trim().slice(0, 500);
      const block = blocks.find((value) => value.type === "heading");
      if ((block == null ? void 0 : block.type) === "heading") block.html = text(patch.heading, 500);
    }
    if (patch.body !== void 0) {
      step.content.body = patch.body.trim().slice(0, 1e4);
      const block = blocks.find((value) => value.type === "text");
      if ((block == null ? void 0 : block.type) === "text") block.html = text(patch.body, 1e4);
    }
    step.content = applyOnsiteDocument(step.builder, document2, "survey", { questions: step.questions, submitLabel }).content;
  }
  function compileStep(step, submitLabel) {
    const document2 = documentFor(step), generic = validateOnsiteDocument(document2), survey = validateOnsiteSurveyDocument(document2, { questions: step.questions });
    const errors = [...surveyQuestionErrors(step.questions), ...generic.errors, ...survey];
    if (errors.length) throw new Error(errors.join(" "));
    step.content = applyOnsiteDocument(step.builder, document2, "survey", { questions: step.questions, submitLabel }).content;
  }
  function referencedByBranch(survey, predicate) {
    return survey.steps.some((step) => {
      var _a;
      return (_a = step.branching) == null ? void 0 : _a.rules.some(predicate);
    });
  }
  function ensureSurvey(definition) {
    if (!definition.survey) throw new Error("This definition is not a Survey.");
    return definition.survey;
  }
  function applySurveyAiProposal(source, proposal) {
    var _a, _b, _c, _d;
    if (!proposal.operations.length || proposal.operations.length > 30) throw new Error("AI proposal has an invalid operation count.");
    const definition = cloneOnsite(source), survey = ensureSurvey(definition), affected = /* @__PURE__ */ new Set(), warnings = [], withinStep = /* @__PURE__ */ new Map();
    const step = (id) => {
      const value = survey.steps.find((item) => item.id === id);
      if (!value) throw new Error(`Survey step no longer exists: ${id}`);
      return value;
    };
    const question = (owner, id) => {
      const value = owner.questions.find((item) => item.id === id);
      if (!value) throw new Error(`Survey question no longer exists: ${id}`);
      return value;
    };
    for (const operation of proposal.operations) {
      if (isDocumentOperation(operation)) {
        if (!operation.stepId) throw new Error("Survey layout operations require a stable step ID.");
        step(operation.stepId);
        withinStep.set(operation.stepId, [...withinStep.get(operation.stepId) ?? [], operation]);
        affected.add(operation.stepId);
        continue;
      }
      if (operation.type === "add_survey_step") {
        if (survey.steps.length >= 20) throw new Error("A Survey can contain up to 20 steps.");
        const questions = (operation.questions ?? []).map((value) => questionFromInput(value));
        const created = { id: onsiteId("step"), content: { heading: operation.heading.trim().slice(0, 500), body: ((_a = operation.body) == null ? void 0 : _a.trim().slice(0, 1e4)) ?? "" }, questions, builder: { version: 1, projectData: {}, html: "", css: "" } };
        created.content = applyOnsiteDocument(created.builder, createOnsiteSurveyDocument(questions, created.content), "survey", { questions, submitLabel: survey.submitLabel }).content;
        const index = operation.afterStepId ? survey.steps.findIndex((value) => value.id === operation.afterStepId) : survey.steps.length - 1;
        if (operation.afterStepId && index < 0) throw new Error("Survey step insertion point no longer exists.");
        survey.steps.splice(index + 1, 0, created);
        affected.add(created.id);
      } else if (operation.type === "duplicate_survey_step") {
        if (survey.steps.length >= 20) throw new Error("A Survey can contain up to 20 steps.");
        const original = step(operation.stepId), copy = duplicateSurveyStep(original, survey.submitLabel);
        const index = operation.afterStepId ? survey.steps.findIndex((value) => value.id === operation.afterStepId) : survey.steps.indexOf(original);
        if (index < 0) throw new Error("Survey step insertion point no longer exists.");
        survey.steps.splice(index + 1, 0, copy);
        affected.add(copy.id);
      } else if (operation.type === "remove_survey_step") {
        if (survey.steps.length <= 1) throw new Error("The final Survey step cannot be removed.");
        const inbound = referencedByBranch(survey, (rule) => rule.nextStepId === operation.stepId);
        if (inbound && !operation.removeBranchRules) throw new Error("This step is a branch destination. Explicitly allow removal of dependent branch rules.");
        if (inbound) {
          survey.steps.forEach((value) => {
            if (value.branching) {
              value.branching.rules = value.branching.rules.filter((rule) => rule.nextStepId !== operation.stepId);
              if (value.branching.defaultNextStepId === operation.stepId) delete value.branching.defaultNextStepId;
            }
          });
          warnings.push("Dependent branch destinations were removed with the Survey step.");
        }
        survey.steps.splice(survey.steps.indexOf(step(operation.stepId)), 1);
        affected.add(operation.stepId);
        warnings.push("A Survey step and its questions were removed.");
      } else if (operation.type === "move_survey_step") {
        const value = step(operation.stepId);
        survey.steps.splice(survey.steps.indexOf(value), 1);
        const index = operation.beforeStepId ? survey.steps.findIndex((item) => item.id === operation.beforeStepId) : survey.steps.length;
        if (index < 0) throw new Error("Survey step move destination no longer exists.");
        survey.steps.splice(index, 0, value);
        affected.add(value.id);
        warnings.push("Survey step order changed; branch paths were revalidated.");
      } else if (operation.type === "update_survey_step") setStepCopy(step(operation.stepId), operation.patch, survey.submitLabel), affected.add(operation.stepId);
      else if (operation.type === "add_survey_question") {
        const owner = step(operation.stepId);
        if (owner.questions.length >= 20) throw new Error("A Survey step can contain up to 20 questions.");
        if (operation.afterQuestionId) question(owner, operation.afterQuestionId);
        const created = questionFromInput(operation.question), index = operation.afterQuestionId ? owner.questions.findIndex((value) => value.id === operation.afterQuestionId) + 1 : owner.questions.length;
        owner.questions.splice(index, 0, created);
        insertQuestionReference(documentFor(owner), created.id, operation.afterQuestionId);
        affected.add(owner.id);
      } else if (operation.type === "duplicate_survey_question") {
        const owner = step(operation.stepId);
        if (owner.questions.length >= 20) throw new Error("A Survey step can contain up to 20 questions.");
        const original = question(owner, operation.questionId), copy = cloneOnsite(original);
        copy.id = onsiteId("question");
        if (copy.type === "single_choice" || copy.type === "multiple_choice") copy.options.forEach((value) => {
          value.id = onsiteId("option");
        });
        const afterId = operation.afterQuestionId ?? original.id;
        question(owner, afterId);
        owner.questions.splice(owner.questions.findIndex((value) => value.id === afterId) + 1, 0, copy);
        insertQuestionReference(documentFor(owner), copy.id, afterId);
        affected.add(owner.id);
      } else if (operation.type === "remove_survey_question") {
        const owner = step(operation.stepId);
        question(owner, operation.questionId);
        const dependent = (_b = owner.branching) == null ? void 0 : _b.rules.some((rule) => rule.questionId === operation.questionId);
        if (dependent && !operation.removeBranchRules) throw new Error("This question controls branching. Explicitly allow removal of dependent branch rules.");
        if (dependent) {
          owner.branching.rules = owner.branching.rules.filter((rule) => rule.questionId !== operation.questionId);
          warnings.push("Dependent branch rules were removed with the Survey question.");
        }
        owner.questions = owner.questions.filter((value) => value.id !== operation.questionId);
        removeQuestionReference(documentFor(owner), operation.questionId);
        affected.add(owner.id);
        warnings.push("A Survey question and any collected value for it were removed.");
      } else if (operation.type === "move_survey_question") {
        const owner = step(operation.stepId), value = question(owner, operation.questionId);
        if (operation.beforeQuestionId) question(owner, operation.beforeQuestionId);
        owner.questions.splice(owner.questions.indexOf(value), 1);
        const index = operation.beforeQuestionId ? owner.questions.findIndex((item) => item.id === operation.beforeQuestionId) : owner.questions.length;
        owner.questions.splice(index, 0, value);
        moveQuestionReference(documentFor(owner), value.id, operation.beforeQuestionId);
        affected.add(owner.id);
      } else if (operation.type === "update_survey_question") {
        const owner = step(operation.stepId), value = question(owner, operation.questionId), patch = operation.patch;
        if (patch.label !== void 0) value.label = patch.label.trim().slice(0, 500);
        if (patch.required !== void 0) value.required = patch.required;
        if (value.type === "short_text" || value.type === "long_text") {
          if (patch.placeholder !== void 0) value.placeholder = patch.placeholder.slice(0, 500);
          if (patch.maxLength !== void 0) value.maxLength = patch.maxLength;
        }
        if (value.type === "rating") {
          if (patch.min !== void 0) value.min = patch.min;
          if (patch.max !== void 0) value.max = patch.max;
        }
        affected.add(owner.id);
      } else if (operation.type === "change_survey_question_type") {
        const owner = step(operation.stepId), value = question(owner, operation.questionId), replacement = questionFromInput(operation.question, value.id), oldRules = ((_c = owner.branching) == null ? void 0 : _c.rules) ?? [];
        owner.questions.splice(owner.questions.indexOf(value), 1, replacement);
        const invalid = surveyBranchErrors(survey);
        if (invalid.length && oldRules.some((rule) => rule.questionId === value.id)) {
          if (!operation.removeInvalidBranchRules) throw new Error("Changing this question type invalidates branching. Explicitly allow removal of dependent rules.");
          owner.branching.rules = oldRules.filter((rule) => rule.questionId !== value.id);
          warnings.push("Branch rules using the converted question were removed.");
        }
        warnings.push(`Question type changed from ${value.type} to ${replacement.type}; existing answers may no longer be comparable.`);
        affected.add(owner.id);
      } else if (["add_survey_option", "update_survey_option", "remove_survey_option", "move_survey_option"].includes(operation.type)) {
        const op = operation, owner = step(op.stepId), value = question(owner, op.questionId);
        if (value.type !== "single_choice" && value.type !== "multiple_choice") throw new Error("Options are available only on choice questions.");
        if (op.type === "add_survey_option") {
          if (value.options.length >= 20) throw new Error("A choice question supports up to 20 options.");
          const index = op.afterOptionId ? value.options.findIndex((item) => item.id === op.afterOptionId) + 1 : value.options.length;
          if (op.afterOptionId && index === 0) throw new Error("Survey option insertion point no longer exists.");
          value.options.splice(index, 0, { id: onsiteId("option"), label: op.label.trim().slice(0, 200) });
        } else {
          const index = value.options.findIndex((item) => item.id === op.optionId);
          if (index < 0) throw new Error("Survey option no longer exists.");
          if (op.type === "update_survey_option") value.options[index].label = op.label.trim().slice(0, 200);
          else if (op.type === "move_survey_option") {
            const [item] = value.options.splice(index, 1), destination = op.beforeOptionId ? value.options.findIndex((option) => option.id === op.beforeOptionId) : value.options.length;
            if (destination < 0) throw new Error("Survey option move destination no longer exists.");
            value.options.splice(destination, 0, item);
          } else {
            const dependent = (_d = owner.branching) == null ? void 0 : _d.rules.some((rule) => rule.questionId === value.id && rule.value === op.optionId);
            if (dependent && !op.removeBranchRules) throw new Error("This option controls branching. Explicitly allow removal of dependent branch rules.");
            if (dependent) {
              owner.branching.rules = owner.branching.rules.filter((rule) => !(rule.questionId === value.id && rule.value === op.optionId));
              warnings.push("Dependent branch rules were removed with the Survey option.");
            }
            value.options.splice(index, 1);
            warnings.push("A Survey option and its answer value were removed.");
          }
        }
        affected.add(owner.id);
      } else if (operation.type === "update_survey_branching") {
        const owner = step(operation.stepId);
        owner.branching = operation.branching ? cloneOnsite(operation.branching) : void 0;
        affected.add(owner.id);
        warnings.push("Survey branching changed; visitor paths may differ.");
      } else if (operation.type === "remove_survey_branch_rule") {
        const owner = step(operation.stepId);
        if (!owner.branching || operation.ruleIndex < 0 || operation.ruleIndex >= owner.branching.rules.length) throw new Error("Survey branch rule no longer exists.");
        owner.branching.rules.splice(operation.ruleIndex, 1);
        affected.add(owner.id);
        warnings.push("A Survey branch rule was removed.");
      } else if (operation.type === "update_survey_configuration") {
        Object.assign(survey, cloneOnsite(operation.patch));
        if (operation.patch.submitLabel !== void 0) survey.submitLabel = operation.patch.submitLabel.trim().slice(0, 80);
        warnings.push("Survey-wide configuration changed.");
      } else throw new Error("Unsupported Survey AI operation.");
    }
    for (const [stepId, operations] of withinStep) {
      const owner = step(stepId), document2 = applyEditorAiProposal(documentFor(owner), { summary: proposal.summary, operations });
      owner.content = applyOnsiteDocument(owner.builder, document2, "survey", { questions: owner.questions, submitLabel: survey.submitLabel }).content;
      affected.add(stepId);
    }
    if (survey.steps.length < 1 || survey.steps.length > 20) throw new Error("A Survey must contain 1–20 steps.");
    const ids = /* @__PURE__ */ new Set();
    for (const owner of survey.steps) {
      if (ids.has(owner.id)) throw new Error("Survey step IDs must be unique.");
      ids.add(owner.id);
      for (const value of owner.questions) {
        if (ids.has(value.id)) throw new Error("Survey question IDs must be unique.");
        ids.add(value.id);
        if (value.type === "single_choice" || value.type === "multiple_choice") for (const option of value.options) {
          if (ids.has(option.id)) throw new Error("Survey option IDs must be unique.");
          ids.add(option.id);
        }
      }
      compileStep(owner, survey.submitLabel);
    }
    const branchErrors = surveyBranchErrors(survey);
    if (branchErrors.length) throw new Error(branchErrors.join(" "));
    return { definition, affectedStepIds: [...affected], order: survey.steps.map((value) => value.id), warnings };
  }
  function surveyAiContext(input) {
    const survey = ensureSurvey(input.definition), current = survey.steps.find((step) => step.id === input.currentStepId);
    if (!current) throw new Error("Current Survey step no longer exists.");
    const document2 = documentFor(current);
    return {
      experience: { ...input.experience, kind: "widget", widgetType: "survey" },
      revision: input.revision,
      scope: input.scope ?? (input.selection.kind === "step" ? "survey" : "step"),
      currentStepId: current.id,
      selection: cloneOnsite(input.selection),
      configuration: { showProgress: survey.showProgress, allowBack: survey.allowBack, submitLabel: survey.submitLabel },
      steps: survey.steps.map((step) => ({ id: step.id, heading: step.content.heading, body: step.content.body, questions: cloneOnsite(step.questions), branching: cloneOnsite(step.branching) })),
      currentDocument: { schemaVersion: document2.schemaVersion, id: document2.id, root: cloneOnsite(document2.root) },
      targeting: cloneOnsite(input.definition.targeting),
      visualTheme: cloneOnsite(input.definition.visualTheme)
    };
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
      this.surveyEditor = null;
      this.checklist = null;
      this.checklistEditor = null;
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
      this.guidePreviewComplete = false;
      this.guidePreviewEntryPath = "";
      this.previewDevice = "desktop";
      this.aiProposal = null;
      this.aiResolvedTargets = /* @__PURE__ */ new Map();
      this.aiPreviewOriginal = null;
      this.aiPreviewCandidate = null;
      this.aiPreviewReturnMode = null;
      this.guideAiUndo = [];
      this.guideAiRedo = [];
      this.surveyAiPreviewOriginal = null;
      this.surveyAiPreviewCandidate = null;
      this.surveyAiUndo = [];
      this.surveyAiRedo = [];
      this.aiAbort = null;
      this.aiRequestGeneration = 0;
      this.persistBeforePageLeave = () => this.updateContinuation();
      this.protectUnsavedChanges = (event) => {
        var _a, _b;
        if (!this.dirty && !this.saveInFlight && !((_a = this.contentEditor) == null ? void 0 : _a.isComposing()) && !((_b = this.compositionEditor) == null ? void 0 : _b.isComposing())) return;
        event.preventDefault();
        event.returnValue = "";
      };
      this.fitPanel = () => {
        var _a, _b, _c;
        const aside = (_a = this.root) == null ? void 0 : _a.querySelector("aside");
        if (!aside) return;
        const viewport = window.visualViewport;
        const width = (viewport == null ? void 0 : viewport.width) ?? innerWidth;
        const height = (viewport == null ? void 0 : viewport.height) ?? innerHeight;
        const x = (viewport == null ? void 0 : viewport.offsetLeft) ?? 0;
        const y = (viewport == null ? void 0 : viewport.offsetTop) ?? 0;
        const toolbar = (_b = this.root) == null ? void 0 : _b.querySelector("[data-editor-toolbar]");
        if (toolbar) {
          toolbar.style.maxWidth = `${Math.max(0, width - 8)}px`;
          const bounds = toolbar.getBoundingClientRect();
          if (bounds.left < x + 4 || bounds.right > x + width - 4 || bounds.top < y + 4 || bounds.bottom > y + height - 4) {
            toolbar.style.transform = "none";
            toolbar.style.left = `${Math.max(x + 4, Math.min(x + width - bounds.width - 4, bounds.left))}px`;
            toolbar.style.top = `${Math.max(y + 4, Math.min(y + height - bounds.height - 4, bounds.top))}px`;
          }
        }
        aside.style.maxWidth = `${Math.max(0, width - 8)}px`;
        aside.style.maxHeight = `${Math.max(48, height - 8)}px`;
        const main = (_c = this.root) == null ? void 0 : _c.querySelector("main");
        if (main) main.style.maxHeight = `${Math.max(0, width <= 480 ? height * 0.38 : height - 32)}px`;
        const rect = aside.getBoundingClientRect();
        if (aside.style.left) aside.style.left = `${Math.max(x + 4, Math.min(x + width - rect.width - 4, rect.left))}px`;
        if (width <= 480) {
          aside.style.top = "auto";
          aside.style.bottom = this.guide || this.survey ? "70px" : "8px";
        } else {
          aside.style.bottom = "auto";
          aside.style.top = `${Math.max(y + 4, Math.min(y + height - 48, rect.top || y + 4))}px`;
        }
      };
      this.protectPreviewSubmission = (event) => {
        if (this.mode !== "preview") return;
        event.preventDefault();
        this.setText("[data-trigger-status]", "Form submission is disabled in preview. Use Next to continue safely.");
      };
      this.protectPreviewNavigation = (event) => {
        if (this.mode !== "preview") return;
        const link = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
        if (!link) return;
        try {
          const url = new URL(link.href, location.href);
          if (url.origin !== location.origin || !["http:", "https:"].includes(url.protocol) || link.target === "_blank" || link.hasAttribute("download")) {
            event.preventDefault();
            this.setText("[data-trigger-status]", "External navigation is disabled in preview. Use Next to continue safely.");
          }
        } catch {
          event.preventDefault();
        }
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
        const clean2 = new URL(location.href);
        const requestedStep = Number(clean2.searchParams.get("movcues_editor_step") ?? "0");
        clean2.searchParams.delete("movcues_editor_token");
        clean2.searchParams.delete("movcues_editor_step");
        history.replaceState(history.state, "", clean2.toString());
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
      if (draft.experience.kind === "checklist" && draft.experience.builderMode !== "onsite") {
        clearEditorContinuation();
        return false;
      }
      this.bridge = bridge;
      this.session = session;
      this.draft = draft;
      this.checklist = isChecklistDefinition(draft.version.definition) ? draft.version.definition : null;
      this.definition = this.checklist ? checklistEditorAdapter(this.checklist) : draft.version.definition;
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
      var _a, _b, _c;
      if (!this.draft || !this.definition) return;
      this.host = document.createElement("div");
      this.host.dataset.movcuesEditor = "";
      this.host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
      this.root = this.host.attachShadow({ mode: "open" });
      this.root.innerHTML = `<style>${STYLE}${GUIDE_STYLE}</style>${this.panelMarkup(this.draft)}`;
      if (this.guide) (_a = this.root.querySelector('[data-inspector="step"]')) == null ? void 0 : _a.insertAdjacentHTML("beforeend", this.guideBehaviorMarkup());
      if (this.guide) this.root.querySelectorAll("[data-guide] .history-row:not([data-step-bar-actions])").forEach((actions) => {
        var _a2;
        return (_a2 = this.root.querySelector('[data-inspector="step"]')) == null ? void 0 : _a2.append(actions);
      });
      (document.body ?? document.documentElement).appendChild(this.host);
      if (this.survey && this.draft.experience.builderMode === "onsite") this.surveyEditor = new SurveyEditor(this.root, this.survey, {
        index: () => this.stepIndex,
        composer: () => this.compositionEditor,
        canEdit: () => this.mode === "design" && this.saveState !== "expired",
        flush: () => this.flushContent(),
        changed: () => this.changed(false),
        error: (errors) => this.showValidation(errors),
        stepsChanged: (index) => {
          var _a2;
          (_a2 = this.compositionEditor) == null ? void 0 : _a2.destroy();
          this.compositionEditor = null;
          this.compositionSelection = null;
          this.stepIndex = index;
          this.changed();
          this.refreshStepBar();
        }
      });
      if (this.checklist) this.checklistEditor = new ChecklistEditor(this.root, this.checklist, this.draft.references ?? { guides: [], segments: [] }, {
        composer: () => this.compositionEditor,
        canEdit: () => this.mode === "design" && this.saveState !== "expired",
        flush: () => this.flushContent(),
        changed: () => this.changed(false),
        render: () => {
          this.renderPreview();
          this.syncPanel();
        },
        error: (errors) => this.showValidation(errors)
      });
      this.bindPanel();
      this.syncPanel();
      this.applyMode();
      this.routeUnsubscribe = this.routeObserver.onChange(() => this.onRouteChange());
      this.routeObserver.start();
      window.addEventListener("pagehide", this.persistBeforePageLeave);
      document.addEventListener("click", this.protectPreviewNavigation, true);
      document.addEventListener("submit", this.protectPreviewSubmission, true);
      window.addEventListener("beforeunload", this.protectUnsavedChanges);
      this.configureDiagnostics();
      (_b = window.visualViewport) == null ? void 0 : _b.addEventListener("resize", this.fitPanel);
      (_c = window.visualViewport) == null ? void 0 : _c.addEventListener("scroll", this.fitPanel);
      window.addEventListener("resize", this.fitPanel);
      this.fitPanel();
    }
    panelMarkup(draft) {
      var _a, _b, _c;
      const selectableSteps = ((_a = this.guide) == null ? void 0 : _a.steps) ?? ((_b = this.survey) == null ? void 0 : _b.steps);
      const aiEligible = draft.experience.builderMode === "onsite" && (draft.experience.kind === "guide" || draft.experience.kind === "widget" && draft.experience.widgetType !== "survey");
      const guideMarkup = selectableSteps ? `<section class="section step-navigator" data-guide><span class="step-drag-handle" data-step-drag-handle title="Drag step bar" aria-hidden="true">⠿</span><div class="content-heading"><div><div class="eyebrow">${this.guide ? "Guide steps" : "Survey steps"}</div><div class="muted" data-step-label></div></div>${this.guide ? '<div class="history-row"><button type="button" class="secondary-button compact" data-add-step="modal">＋ Modal</button><button type="button" class="secondary-button compact" data-add-step="anchored_card">＋ Anchored</button></div>' : ""}</div><div class="step-flow" data-step-flow>${this.stepButtons()}</div>${this.guide ? `<div class="history-row" data-step-bar-actions><button type="button" class="secondary-button compact step-bar-action" data-add-current-step aria-label="Add step" title="Add a ${getGuideStepPattern(this.guide.steps[this.stepIndex]) === "modal" ? "Modal" : "Anchored"} step">＋</button><button type="button" class="secondary-button compact step-bar-action step-bar-delete" data-delete-step aria-label="Delete selected step" title="Delete selected step"${this.guide.steps.length <= 1 ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M9 7l1-2h4l1 2m-9 0 1 13h10l1-13"/></svg></button></div><div class="history-row"><button type="button" class="secondary-button compact" data-duplicate-step>Duplicate</button><button type="button" class="secondary-button compact" data-step-left>←</button><button type="button" class="secondary-button compact" data-step-right>→</button></div>` : ""}</section>` : "";
      const designDisabled = draft.experience.builderMode !== "onsite" ? ' disabled title="Content is edited in the GrapesJS Dashboard Builder"' : "";
      return `<div class="editor-toolbar" data-editor-toolbar role="region" aria-label="Movcues editing controls">
      <header data-drag-handle>
        <div class="header-copy"><strong>Movcues Live Editor</strong><span>${escapeText(draft.experience.name)}</span><small><i></i> Connected · <span data-save-state>Draft saved</span></small></div>
        <div class="header-actions"><button type="button" data-global-undo aria-label="Undo">↶</button><button type="button" data-global-redo aria-label="Redo">↷</button><button type="button" data-save aria-label="Save draft">Save</button><button type="button" data-move-side aria-label="Move inspector to other side">⇄</button><button type="button" data-return-dashboard aria-label="Return to dashboard">↗</button><button type="button" data-minimize aria-label="Toggle inspector" aria-expanded="true">☷</button><button type="button" data-close aria-label="Close editor">×</button></div>
      </header>
        <div class="modebar"><button type="button" data-mode="design"${designDisabled}>Design</button><button type="button" data-mode="target">Target</button><button type="button" data-mode="navigate">Navigate</button><button type="button" data-mode="preview">Preview</button></div>
        <div class="devicebar" aria-label="Widget-only viewport preview"><span>Widget preview</span><button type="button" data-device="desktop">Desktop</button><button type="button" data-device="tablet">Tablet</button><button type="button" data-device="mobile">Mobile</button></div>
        <div class="guide-preview-controls" data-guide-preview hidden><button type="button" data-preview-start>Start Guide</button><button type="button" data-preview-back aria-label="Previous preview step">←</button><button type="button" data-preview-next aria-label="Next preview step">→</button><button type="button" data-preview-reset>Reset</button><button type="button" data-preview-test hidden>Test event</button><span data-preview-step></span><small data-trigger-status role="status" aria-live="polite"></small></div>
      </div>
      ${guideMarkup}
      <aside aria-label="Contextual inspector"><main>
        <nav class="inspector-tabs" aria-label="Inspector mode"><button type="button" class="active" data-inspector-tab="properties">Properties</button><button type="button" data-inspector-tab="ai"${aiEligible ? "" : " disabled"}>AI</button></nav>
        <section class="section ai-panel" data-ai-panel hidden>
          <div class="content-heading"><div><div class="eyebrow">Movcues AI</div><strong>Design assistant</strong></div><button type="button" class="secondary-button compact" data-ai-cancel hidden>Cancel</button></div>
          <p class="muted" data-ai-context>Choose an element or ask about the whole widget.</p>
          <div class="ai-suggestions"><button type="button" data-ai-suggestion="Improve the selected copy while keeping the same meaning.">Improve copy</button><button type="button" data-ai-suggestion="Improve the selected element's visual hierarchy and spacing.">Improve hierarchy</button><button type="button" data-ai-suggestion="Make this widget more concise and mobile friendly.">Mobile polish</button></div>
          <form data-ai-form><textarea data-ai-prompt maxlength="4000" rows="4" placeholder="Describe the change…"></textarea><button type="submit" class="secondary-button" data-ai-send>Generate proposal</button></form>
          <div class="ai-status" data-ai-status role="status" aria-live="polite"></div>
          <article class="ai-proposal" data-ai-proposal hidden><strong data-ai-summary></strong><ul data-ai-operations></ul><p class="muted">Preview only. Nothing changes until you apply it.</p><div class="history-row"><button type="button" class="secondary-button" data-ai-target hidden>Select target</button><button type="button" class="secondary-button" data-ai-preview hidden>Preview Guide</button><button type="button" class="secondary-button" data-ai-apply>Apply</button><button type="button" class="secondary-button" data-ai-discard>Discard</button></div></article>
        </section>
        <button type="button" class="secondary-button" data-reset-preview hidden>Reset Preview</button><p class="hint" data-preview-limit hidden>${this.guide ? "Test this Guide on the page. No production events or progress are recorded. External links are disabled. Website interactions can still run your site's JavaScript." : this.survey ? "Preview tests the full Survey. No responses, production events or progress are recorded. Website interactions can still run your site's JavaScript." : "Preview tests this step only. Links and external actions are disabled. Website interactions can still run your site's JavaScript."}</p>
        <div class="notice" data-route-notice hidden><b>Page changed</b><span data-route-change></span></div>
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
            <div data-block="image"><button type="button" class="secondary-button" data-choose-image>Choose image</button><p class="muted">PNG, JPG or WebP · up to 10 MB. You can also drop a file onto the image.</p><p class="muted" data-image-status role="status" aria-live="polite"></p><label>Image URL<input data-v2-image-src type="url" placeholder="https://… (optional)"></label><label>Alt text<input data-v2-image-alt type="text" maxlength="500"></label><label>Fit<select data-image-fit><option value="cover">Cover</option><option value="contain">Contain</option></select></label><label>Width<div class="number"><input data-image-width type="number" min="1" max="100"><span>%</span></div></label><label>Radius<div class="number"><input data-image-radius type="number" min="0" max="100"><span>px</span></div></label></div>
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
        <div class="section eyebrow" data-step-only data-step-appearance>Step appearance</div>
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
        <section class="section" data-theme-section>
          <div class="content-heading"><div><div class="eyebrow">Design system</div><strong>Experience theme</strong></div><button type="button" class="secondary-button compact" data-theme-reset>Reset to theme</button></div>
          <label>Base style<select data-theme-source><option value="template">Template defaults</option><option value="site">Match my website</option><option value="preset" disabled>Saved style</option><option value="minimal">Minimal</option><option value="modern">Modern</option><option value="soft">Soft</option><option value="dark">Dark</option></select></label>
          <label>Saved style<select data-saved-style><option value="">Choose saved style…</option>${(((_c = draft.references) == null ? void 0 : _c.stylePresets) ?? []).map((style) => `<option value="${escapeText(style.id)}">${escapeText(style.name)}</option>`).join("")}</select></label>
          <label>Primary<input type="color" data-theme-primary></label><label>Secondary / surface<input type="color" data-theme-secondary></label><label>Background<input type="color" data-theme-background></label><label>Text<input type="color" data-theme-text></label>
          <label>Body font<input type="text" maxlength="200" data-theme-body-font></label><label>Heading font<input type="text" maxlength="200" data-theme-heading-font></label>
          <label>Body size<div class="number"><input type="number" min="8" max="72" data-theme-body-size><span>px</span></div></label><label>Heading size<div class="number"><input type="number" min="10" max="72" data-theme-heading-size><span>px</span></div></label>
          <label>Radius<div class="number"><input type="number" min="0" max="48" data-theme-radius><span>px</span></div></label><label>Button radius<div class="number"><input type="number" min="0" max="48" data-theme-button-radius><span>px</span></div></label><label>Shadow<select data-theme-shadow><option value="theme">Theme shadow</option><option value="none">None</option><option value="soft">Soft</option><option value="strong">Strong</option></select></label><label>Spacing<div class="number"><input type="number" min="0" max="64" data-theme-spacing><span>px</span></div></label>
          <label>Style name<input type="text" maxlength="80" placeholder="My product style" data-style-name></label><div class="history-row"><button type="button" class="secondary-button compact" data-style-save>Save style</button><button type="button" class="secondary-button compact" data-style-rename>Rename</button><button type="button" class="secondary-button compact" data-style-delete>Delete</button></div><p class="muted" data-style-status role="status"></p>
        </section>
        <details class="section live"><summary>Connection & target status</summary><div class="status-ok">✓ SDK/editor connected</div><div data-preview-status></div><div data-live-target></div><div class="status-ok">✓ Current page available</div><code data-current-path></code><div data-missing-selector hidden><span>Target selector</span><code></code><button class="secondary-button" type="button" data-pick>Reselect target</button></div></details>
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
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F;
      const root = this.root;
      root.querySelectorAll("[data-inspector-tab]").forEach((button) => button.addEventListener("click", () => this.setInspectorTab(button.dataset.inspectorTab)));
      root.querySelectorAll("[data-ai-suggestion]").forEach((button) => button.addEventListener("click", () => {
        const input = root.querySelector("[data-ai-prompt]");
        if (input) {
          input.value = button.dataset.aiSuggestion ?? "";
          input.focus();
        }
      }));
      (_a = root.querySelector("[data-ai-form]")) == null ? void 0 : _a.addEventListener("submit", (event) => {
        event.preventDefault();
        void this.sendAiPrompt();
      });
      (_b = root.querySelector("[data-ai-cancel]")) == null ? void 0 : _b.addEventListener("click", () => this.cancelAiRequest());
      (_c = root.querySelector("[data-ai-target]")) == null ? void 0 : _c.addEventListener("click", () => this.resolveAiGuideTarget());
      (_d = root.querySelector("[data-ai-preview]")) == null ? void 0 : _d.addEventListener("click", () => this.survey ? this.previewAiSurveyProposal() : this.previewAiGuideProposal());
      (_e = root.querySelector("[data-ai-apply]")) == null ? void 0 : _e.addEventListener("click", () => this.applyAiProposal());
      (_f = root.querySelector("[data-ai-discard]")) == null ? void 0 : _f.addEventListener("click", () => this.discardAiProposal());
      root.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => this.setMode(button.dataset.mode)));
      root.querySelectorAll("[data-device]").forEach((button) => button.addEventListener("click", () => {
        this.previewDevice = button.dataset.device;
        this.applyPreviewDevice();
        this.syncThemeInspector();
      }));
      root.querySelectorAll("[data-pick]").forEach((button) => button.addEventListener("click", () => {
        if (this.mode !== "target") this.setMode("target");
        else this.startPicker();
      }));
      (_g = root.querySelector("[data-pick-layer]")) == null ? void 0 : _g.addEventListener("click", () => this.startLayerPicker());
      root.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => this.switchStep(Number(button.dataset.step))));
      (_h = root.querySelector("[data-minimize]")) == null ? void 0 : _h.addEventListener("click", () => {
        const aside = root.querySelector("aside");
        aside.classList.toggle("minimized");
        root.querySelector("[data-minimize]").setAttribute("aria-expanded", String(!aside.classList.contains("minimized")));
      });
      (_i = root.querySelector("[data-save]")) == null ? void 0 : _i.addEventListener("click", () => void this.persist());
      (_j = root.querySelector("[data-close]")) == null ? void 0 : _j.addEventListener("click", () => void this.close());
      (_k = root.querySelector("[data-return-dashboard]")) == null ? void 0 : _k.addEventListener("click", () => {
        var _a2;
        (_a2 = window.opener) == null ? void 0 : _a2.focus();
        void this.close();
      });
      (_l = root.querySelector("[data-retry-save]")) == null ? void 0 : _l.addEventListener("click", () => void this.persist());
      (_m = root.querySelector("[data-reload-draft]")) == null ? void 0 : _m.addEventListener("click", () => {
        if (window.confirm("Reloading discards local edits. Copy / Export them first if you need them. Reload latest?")) {
          this.recoveryDraft = null;
          window.location.reload();
        }
      });
      (_n = root.querySelector("[data-export-draft]")) == null ? void 0 : _n.addEventListener("click", () => this.exportRecovery());
      (_o = root.querySelector("[data-discard-draft]")) == null ? void 0 : _o.addEventListener("click", () => {
        if (window.confirm("Discard unsaved edits and close?")) {
          this.recoveryDraft = null;
          this.destroy();
        }
      });
      (_p = root.querySelector("[data-reset-preview]")) == null ? void 0 : _p.addEventListener("click", () => this.guide ? this.startGuidePreview() : this.renderPreview());
      (_q = root.querySelector("[data-global-undo]")) == null ? void 0 : _q.addEventListener("click", () => this.globalUndo());
      (_r = root.querySelector("[data-global-redo]")) == null ? void 0 : _r.addEventListener("click", () => this.globalRedo());
      (_s = root.querySelector("[data-move-side]")) == null ? void 0 : _s.addEventListener("click", () => {
        var _a2;
        return (_a2 = root.querySelector("aside")) == null ? void 0 : _a2.classList.toggle("left-side");
      });
      (_t = root.querySelector("[data-select-step]")) == null ? void 0 : _t.addEventListener("click", () => {
        var _a2;
        return (_a2 = this.compositionEditor) == null ? void 0 : _a2.selectStep();
      });
      root.querySelectorAll("[data-edge]").forEach((button) => button.addEventListener("click", () => {
        var _a2;
        return (_a2 = this.compositionEditor) == null ? void 0 : _a2.addEdge(button.dataset.edge);
      }));
      root.querySelectorAll("[data-add-step]").forEach((button) => button.addEventListener("click", () => this.addGuideStep(button.dataset.addStep)));
      (_u = root.querySelector("[data-add-current-step]")) == null ? void 0 : _u.addEventListener("click", () => this.addGuideStep(getGuideStepPattern(this.guide.steps[this.stepIndex])));
      (_v = root.querySelector("[data-duplicate-step]")) == null ? void 0 : _v.addEventListener("click", () => this.duplicateGuideStep());
      (_w = root.querySelector("[data-delete-step]")) == null ? void 0 : _w.addEventListener("click", () => this.deleteGuideStep());
      (_x = root.querySelector("[data-step-left]")) == null ? void 0 : _x.addEventListener("click", () => this.moveGuideStep(-1));
      (_y = root.querySelector("[data-step-right]")) == null ? void 0 : _y.addEventListener("click", () => this.moveGuideStep(1));
      (_z = root.querySelector("[data-step-name]")) == null ? void 0 : _z.addEventListener("change", (event) => {
        if (!this.guide) return;
        this.guide.steps[this.stepIndex].label = event.currentTarget.value.trim().slice(0, 80) || void 0;
        this.changed();
        this.refreshStepBar();
      });
      (_A = root.querySelector("[data-edit-component]")) == null ? void 0 : _A.addEventListener("click", () => {
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
      (_B = root.querySelector("[data-text-align]")) == null ? void 0 : _B.addEventListener("change", (event) => {
        var _a2, _b2;
        const value = event.currentTarget.value;
        (_a2 = this.compositionEditor) == null ? void 0 : _a2.setAlignment(value);
        (_b2 = this.contentEditor) == null ? void 0 : _b2.setAlignment(value);
        this.syncContentInspector();
      });
      (_C = root.querySelector("[data-apply-link]")) == null ? void 0 : _C.addEventListener("click", () => {
        var _a2, _b2;
        const input = root.querySelector("[data-link-url]");
        const applied = input ? ((_a2 = this.compositionEditor) == null ? void 0 : _a2.applyLink(input.value)) ?? ((_b2 = this.contentEditor) == null ? void 0 : _b2.applyLink(input.value)) : false;
        if (input && !applied) {
          input.setCustomValidity("Select text in a heading or body and use an HTTP(S), email, phone, relative, or hash URL.");
          input.reportValidity();
        } else input == null ? void 0 : input.setCustomValidity("");
        this.syncContentInspector();
      });
      (_D = root.querySelector("[data-apply-image]")) == null ? void 0 : _D.addEventListener("click", () => {
        var _a2;
        const source = root.querySelector("[data-image-src]");
        const alt = root.querySelector("[data-image-alt]");
        if (source && alt && !((_a2 = this.contentEditor) == null ? void 0 : _a2.updateImage(source.value, alt.value))) source.setCustomValidity("Use an HTTP(S), relative, or supported data image URL.");
        else source == null ? void 0 : source.setCustomValidity("");
        this.syncContentInspector();
      });
      (_E = root.querySelector("[data-undo]")) == null ? void 0 : _E.addEventListener("click", () => {
        var _a2;
        (_a2 = this.contentEditor) == null ? void 0 : _a2.undo();
        this.syncContentInspector();
      });
      (_F = root.querySelector("[data-redo]")) == null ? void 0 : _F.addEventListener("click", () => {
        var _a2;
        (_a2 = this.contentEditor) == null ? void 0 : _a2.redo();
        this.syncContentInspector();
      });
      root.addEventListener("pointerdown", (event) => {
        var _a2, _b2;
        (_a2 = this.contentEditor) == null ? void 0 : _a2.rememberSelection();
        (_b2 = this.compositionEditor) == null ? void 0 : _b2.rememberSelection();
        if (event.target instanceof Element && event.target.closest("[data-v2-format],[data-v2-list]")) event.preventDefault();
      }, true);
      root.addEventListener("focusin", () => {
        var _a2, _b2;
        (_a2 = this.contentEditor) == null ? void 0 : _a2.rememberSelection();
        (_b2 = this.compositionEditor) == null ? void 0 : _b2.rememberSelection();
      }, true);
      root.addEventListener("keydown", (rawEvent) => {
        var _a2;
        const event = rawEvent;
        if (event.key === "Escape") {
          (_a2 = this.contentEditor) == null ? void 0 : _a2.editSelected();
          event.preventDefault();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void this.persist();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
          event.preventDefault();
          if (event.shiftKey) this.globalRedo();
          else this.globalUndo();
        }
      });
      this.bindDrag();
      this.bindStepBarDrag();
      this.bindThemeControls();
      this.bindCompositionInspector();
      this.bindGuideBehavior();
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
      var _a, _b, _c, _d, _e;
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
        return (_a2 = this.compositionEditor) == null ? void 0 : _a2.setImageSource(value.trim());
      });
      (_b = root.querySelector("[data-choose-image]")) == null ? void 0 : _b.addEventListener("click", () => {
        var _a2;
        return (_a2 = this.compositionEditor) == null ? void 0 : _a2.chooseImageFile();
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
      (_c = root.querySelector("[data-v2-apply-link]")) == null ? void 0 : _c.addEventListener("click", () => {
        var _a2;
        const input = root.querySelector("[data-v2-link-url]");
        if (input && !((_a2 = this.compositionEditor) == null ? void 0 : _a2.applyLink(input.value))) {
          input.setCustomValidity("Use an HTTP(S), email, phone, relative, or hash URL.");
          input.reportValidity();
        } else input == null ? void 0 : input.setCustomValidity("");
      });
      (_d = root.querySelector("[data-v2-undo]")) == null ? void 0 : _d.addEventListener("click", () => {
        var _a2;
        return (_a2 = this.compositionEditor) == null ? void 0 : _a2.undo();
      });
      (_e = root.querySelector("[data-v2-redo]")) == null ? void 0 : _e.addEventListener("click", () => {
        var _a2;
        return (_a2 = this.compositionEditor) == null ? void 0 : _a2.redo();
      });
    }
    ensureThemeState() {
      var _a;
      const owner = this.checklist ?? this.definition;
      if (owner.visualTheme) return owner.visualTheme;
      const design = ((_a = this.checklist) == null ? void 0 : _a.design) ?? this.definition.design;
      const base = cloneOnsite(design.theme.siteTheme ?? EXPERIENCE_PRESETS.modern);
      base.colors.background = design.theme.background;
      base.colors.text = design.theme.foreground;
      base.colors.primary = design.theme.primary;
      owner.visualTheme = { source: "template", templateTokens: cloneOnsite(base), baseTokens: cloneOnsite(base), overrides: {} };
      if (this.checklist) this.definition.visualTheme = owner.visualTheme;
      return owner.visualTheme;
    }
    applyVisualTheme(render = true) {
      var _a;
      const state = this.ensureThemeState(), tokens = resolvedTheme(state), radius = tokens.radii.md <= 6 ? "sm" : tokens.radii.md >= 18 ? "lg" : "md";
      const design = ((_a = this.checklist) == null ? void 0 : _a.design) ?? this.definition.design;
      design.theme = { background: tokens.colors.background, foreground: tokens.colors.text, primary: tokens.colors.primary, borderRadius: radius, ...state.overrides.spacing !== void 0 ? { spacing: state.overrides.spacing } : {}, siteTheme: tokens };
      if (this.checklist) {
        this.checklist.design = design;
        this.checklist.visualTheme = state;
        this.definition.design = design;
        this.definition.visualTheme = state;
      }
      if (render) this.changed();
    }
    bindThemeControls() {
      var _a, _b, _c, _d, _e, _f, _g;
      const root = this.root;
      this.ensureThemeState();
      this.applyVisualTheme(false);
      (_a = root.querySelector("[data-theme-source]")) == null ? void 0 : _a.addEventListener("change", (event) => {
        var _a2, _b2;
        const value = event.currentTarget.value, state2 = this.ensureThemeState();
        if (value === "template") {
          state2.source = "template";
          state2.baseTokens = cloneOnsite(state2.templateTokens);
          delete state2.preset;
        } else if (value === "site") {
          const site = (_b2 = (_a2 = this.draft) == null ? void 0 : _a2.references) == null ? void 0 : _b2.siteTheme;
          if (!site) {
            this.setText("[data-style-status]", "No captured website theme is available.");
            return;
          }
          state2.source = "site";
          state2.baseTokens = cloneOnsite(site);
          delete state2.preset;
        } else {
          state2.source = "preset";
          state2.preset = value;
          state2.baseTokens = cloneOnsite(EXPERIENCE_PRESETS[state2.preset]);
        }
        this.applyVisualTheme();
      });
      const override = (key, value) => {
        const next = this.ensureThemeState();
        if (value === "" || value === void 0) delete next.overrides[key];
        else next.overrides[key] = value;
        this.applyVisualTheme();
      };
      const color = (selector, key) => {
        var _a2;
        return (_a2 = root.querySelector(selector)) == null ? void 0 : _a2.addEventListener("change", (event) => override(key, event.currentTarget.value));
      };
      const textInput = (selector, key) => {
        var _a2;
        return (_a2 = root.querySelector(selector)) == null ? void 0 : _a2.addEventListener("change", (event) => override(key, event.currentTarget.value.trim()));
      };
      const number = (selector, key, min, max) => {
        var _a2;
        return (_a2 = root.querySelector(selector)) == null ? void 0 : _a2.addEventListener("change", (event) => {
          const value = Number(event.currentTarget.value);
          override(key, Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : void 0);
        });
      };
      color("[data-theme-primary]", "primary");
      color("[data-theme-secondary]", "secondary");
      color("[data-theme-background]", "background");
      color("[data-theme-text]", "text");
      textInput("[data-theme-body-font]", "bodyFontFamily");
      textInput("[data-theme-heading-font]", "headingFontFamily");
      number("[data-theme-body-size]", "bodyFontSize", 8, 72);
      number("[data-theme-heading-size]", "headingFontSize", 10, 72);
      number("[data-theme-radius]", "radius", 0, 48);
      number("[data-theme-button-radius]", "buttonRadius", 0, 48);
      number("[data-theme-spacing]", "spacing", 0, 64);
      (_b = root.querySelector("[data-theme-shadow]")) == null ? void 0 : _b.addEventListener("change", (event) => {
        const mode = event.currentTarget.value;
        if (mode === "theme") return override("shadow", void 0);
        if (mode === "none") return override("shadow", { x: 0, y: 0, blur: 0, spread: 0, color: "transparent" });
        const source = this.ensureThemeState().baseTokens.shadows.md;
        override("shadow", { ...source, y: mode === "soft" ? Math.min(source.y, 10) : Math.max(source.y, 20), blur: mode === "soft" ? Math.min(source.blur, 28) : Math.max(source.blur, 56) });
      });
      (_c = root.querySelector("[data-theme-reset]")) == null ? void 0 : _c.addEventListener("click", () => {
        this.ensureThemeState().overrides = {};
        this.applyVisualTheme();
        this.setText("[data-style-status]", "Experience overrides reset. Block and cell customizations were preserved.");
      });
      (_d = root.querySelector("[data-saved-style]")) == null ? void 0 : _d.addEventListener("change", (event) => {
        var _a2, _b2, _c2;
        const style = (_c2 = (_b2 = (_a2 = this.draft) == null ? void 0 : _a2.references) == null ? void 0 : _b2.stylePresets) == null ? void 0 : _c2.find((item) => item.id === event.currentTarget.value);
        if (!style) return;
        const next = this.ensureThemeState();
        next.source = "preset";
        delete next.preset;
        next.baseTokens = cloneOnsite(style.tokens);
        this.applyVisualTheme();
        this.setText("[data-style-status]", `Applied ${style.name}.`);
      });
      (_e = root.querySelector("[data-style-save]")) == null ? void 0 : _e.addEventListener("click", () => void this.saveCurrentStyle());
      (_f = root.querySelector("[data-style-rename]")) == null ? void 0 : _f.addEventListener("click", () => void this.renameCurrentStyle());
      (_g = root.querySelector("[data-style-delete]")) == null ? void 0 : _g.addEventListener("click", () => void this.deleteCurrentStyle());
    }
    async saveCurrentStyle() {
      var _a, _b;
      const name = (_b = (_a = this.root) == null ? void 0 : _a.querySelector("[data-style-name]")) == null ? void 0 : _b.value.trim();
      if (!name || !this.bridge) return this.setText("[data-style-status]", "Enter a style name.");
      try {
        const preset = await this.bridge.saveStyle(name, resolvedTheme(this.ensureThemeState()));
        const list = this.draft.references.stylePresets ?? (this.draft.references.stylePresets = []);
        list.unshift(preset);
        this.refreshStyleOptions(preset.id);
        this.setText("[data-style-status]", "Style saved for this site.");
      } catch (error) {
        this.setText("[data-style-status]", error instanceof Error ? error.message : "Style could not be saved.");
      }
    }
    async renameCurrentStyle() {
      var _a, _b, _c, _d;
      const select = (_a = this.root) == null ? void 0 : _a.querySelector("[data-saved-style]"), name = (_c = (_b = this.root) == null ? void 0 : _b.querySelector("[data-style-name]")) == null ? void 0 : _c.value.trim();
      if (!(select == null ? void 0 : select.value) || !name || !this.bridge) return this.setText("[data-style-status]", "Choose a saved style and enter a new name.");
      try {
        const updated = await this.bridge.renameStyle(select.value, name), style = (_d = this.draft.references.stylePresets) == null ? void 0 : _d.find((item) => item.id === updated.id);
        if (style) style.name = updated.name;
        this.refreshStyleOptions(updated.id);
        this.setText("[data-style-status]", "Style renamed.");
      } catch {
        this.setText("[data-style-status]", "Style could not be renamed.");
      }
    }
    async deleteCurrentStyle() {
      var _a, _b;
      const select = (_a = this.root) == null ? void 0 : _a.querySelector("[data-saved-style]");
      if (!(select == null ? void 0 : select.value) || !this.bridge) return this.setText("[data-style-status]", "Choose a saved style first.");
      try {
        await this.bridge.deleteStyle(select.value);
        this.draft.references.stylePresets = ((_b = this.draft.references.stylePresets) == null ? void 0 : _b.filter((item) => item.id !== select.value)) ?? [];
        this.refreshStyleOptions();
        this.setText("[data-style-status]", "Style deleted.");
      } catch {
        this.setText("[data-style-status]", "Style could not be deleted.");
      }
    }
    refreshStyleOptions(selected = "") {
      var _a, _b, _c;
      const select = (_a = this.root) == null ? void 0 : _a.querySelector("[data-saved-style]");
      if (!select) return;
      select.innerHTML = '<option value="">Choose saved style…</option>' + (((_c = (_b = this.draft) == null ? void 0 : _b.references) == null ? void 0 : _c.stylePresets) ?? []).map((style) => `<option value="${escapeText(style.id)}">${escapeText(style.name)}</option>`).join("");
      select.value = selected;
    }
    syncThemeInspector() {
      var _a;
      if (!this.root || !this.definition) return;
      const state = this.ensureThemeState(), tokens = resolvedTheme(state);
      this.setValue("[data-theme-source]", state.source === "preset" && state.preset ? state.preset : state.source);
      this.setValue("[data-theme-primary]", tokens.colors.primary);
      this.setValue("[data-theme-secondary]", tokens.colors.surface);
      this.setValue("[data-theme-background]", tokens.colors.background);
      this.setValue("[data-theme-text]", tokens.colors.text);
      this.setValue("[data-theme-body-font]", tokens.typography.bodyFontFamily);
      this.setValue("[data-theme-heading-font]", tokens.typography.headingFontFamily);
      this.setValue("[data-theme-body-size]", String(tokens.typography.bodyFontSize));
      this.setValue("[data-theme-heading-size]", String(tokens.typography.headingFontSize));
      this.setValue("[data-theme-radius]", String(state.overrides.radius ?? tokens.radii.md));
      this.setValue("[data-theme-button-radius]", String(state.overrides.buttonRadius ?? tokens.radii.md));
      this.setValue("[data-theme-shadow]", ((_a = state.overrides.shadow) == null ? void 0 : _a.color) === "transparent" ? "none" : state.overrides.shadow ? "strong" : "theme");
      this.setValue("[data-theme-spacing]", String(state.overrides.spacing ?? 16));
      this.root.querySelectorAll("[data-device]").forEach((button) => button.classList.toggle("active", button.dataset.device === this.previewDevice));
    }
    guideBehaviorMarkup() {
      return `<div class="guide-behavior"><div class="eyebrow">Step behavior</div>
      <label>Advance when<select data-guide-trigger aria-label="Advance when"><option value="button">Guide button</option><option value="element_click">Website element click</option><option value="element_hover">Website element hover</option><option value="custom_event">Custom event</option><option value="route">Route change</option></select></label>
      <p class="muted" data-guide-trigger-help></p>
      <div data-guide-config="element"><label class="check"><input type="checkbox" data-guide-use-position> Use the positioning element</label><strong class="truncate" data-guide-interaction-label></strong><p class="muted" data-guide-interaction-status role="status"></p><button type="button" class="secondary-button" data-guide-pick-interaction>Select website element</button></div>
      <label data-guide-config="hover">Hover duration<div class="number"><input type="number" min="100" max="60000" step="100" data-guide-hover aria-label="Hover duration"><span>ms</span></div></label>
      <label data-guide-config="event">Event name<input type="text" maxlength="200" placeholder="e.g. project_created" data-guide-event aria-label="Guide event name"></label>
      <div data-guide-config="route"><label>Page matches<select data-guide-route-operator aria-label="Guide route comparison"><option value="equals">Exactly</option><option value="starts_with">Starts with</option><option value="ends_with">Ends with</option><option value="contains">Contains</option><option value="matches_pattern">Wildcard pattern</option></select></label><label>Page path<input type="text" maxlength="500" data-guide-route placeholder="/projects" aria-label="Guide route path"></label><p class="muted" data-guide-route-extra>Existing additional page rules are preserved.</p></div>
      <label>Show after<div class="number"><input type="number" min="0" max="30000" step="100" data-guide-delay aria-label="Presentation delay"><span>ms</span></div></label>
      <div data-guide-missing><label>Missing target<select data-guide-missing-action aria-label="Missing-target behavior"><option value="wait">Wait for target</option><option value="skip">Skip to next step</option><option value="dismiss">Dismiss Guide</option></select></label><label>Wait up to<div class="number"><input type="number" min="100" max="60000" step="100" data-guide-timeout aria-label="Target wait timeout"><span>ms</span></div></label><p class="muted">Wait pauses this Guide at the timeout. Navigation or reopening retries discovery.</p></div>
      <label class="check"><input type="checkbox" data-guide-dismissible> Allow visitors to dismiss</label>
    </div>`;
    }
    bindGuideBehavior() {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      if (!this.guide || !this.root) return;
      const change = (selector, run) => {
        var _a2;
        return (_a2 = this.root.querySelector(selector)) == null ? void 0 : _a2.addEventListener("change", (event) => {
          run(event.currentTarget.value);
          this.changed();
        });
      };
      const bounded2 = (value, min, max, fallback) => Math.max(min, Math.min(max, Math.round(numberValue(value, fallback))));
      change("[data-guide-trigger]", (value) => {
        const step = this.guide.steps[this.stepIndex];
        if ((value === "element_click" || value === "element_hover") && !guideStepRequiresTarget(step)) return;
        const old = step.advance;
        const target = (old == null ? void 0 : old.type) === "element_click" || (old == null ? void 0 : old.type) === "element_hover" ? old.target : void 0;
        step.advance = value === "custom_event" ? { type: value, eventName: (old == null ? void 0 : old.type) === value ? old.eventName : "" } : value === "route" ? { type: value, pageRules: (old == null ? void 0 : old.type) === value ? old.pageRules : [{ id: editorId("rule"), kind: "include", operator: "equals", value: currentPagePath() }] } : value === "element_hover" ? { type: value, durationMs: (old == null ? void 0 : old.type) === value ? old.durationMs : 500, ...target ? { target } : {} } : value === "element_click" ? { type: value, ...target ? { target } : {} } : { type: "button" };
      });
      change("[data-guide-hover]", (value) => {
        const advance = this.guide.steps[this.stepIndex].advance;
        if ((advance == null ? void 0 : advance.type) === "element_hover") advance.durationMs = bounded2(value, 100, 6e4, 500);
      });
      change("[data-guide-event]", (value) => {
        const advance = this.guide.steps[this.stepIndex].advance;
        if ((advance == null ? void 0 : advance.type) === "custom_event") advance.eventName = value.trim();
      });
      const route = () => {
        const advance = this.guide.steps[this.stepIndex].advance;
        return (advance == null ? void 0 : advance.type) === "route" ? advance.pageRules.find((rule) => rule.kind === "include") : void 0;
      };
      change("[data-guide-route]", (value) => {
        const rule = route();
        if (rule) rule.value = value.trim();
      });
      change("[data-guide-route-operator]", (value) => {
        const rule = route();
        if (rule) rule.operator = value;
      });
      change("[data-guide-delay]", (value) => {
        const step = this.guide.steps[this.stepIndex];
        step.presentation = { ...step.presentation, delayMs: bounded2(value, 0, 3e4, 0) };
      });
      const missing = () => {
        var _a2;
        const step = this.guide.steps[this.stepIndex];
        return step.presentation = { ...step.presentation, missingTarget: ((_a2 = step.presentation) == null ? void 0 : _a2.missingTarget) ?? { action: "wait", timeoutMs: 5e3 } };
      };
      change("[data-guide-missing-action]", (value) => {
        missing().missingTarget.action = value;
      });
      change("[data-guide-timeout]", (value) => {
        missing().missingTarget.timeoutMs = bounded2(value, 100, 6e4, 5e3);
      });
      (_a = this.root.querySelector("[data-guide-use-position]")) == null ? void 0 : _a.addEventListener("change", (event) => {
        const advance = this.guide.steps[this.stepIndex].advance;
        if (event.currentTarget.checked && ((advance == null ? void 0 : advance.type) === "element_click" || (advance == null ? void 0 : advance.type) === "element_hover")) {
          delete advance.target;
          this.changed();
        } else this.pickGuideInteraction();
      });
      (_b = this.root.querySelector("[data-guide-pick-interaction]")) == null ? void 0 : _b.addEventListener("click", () => this.pickGuideInteraction());
      (_c = this.root.querySelector("[data-guide-dismissible]")) == null ? void 0 : _c.addEventListener("change", (event) => {
        this.guide.steps[this.stepIndex].behavior.dismissible = event.currentTarget.checked;
        this.changed();
      });
      (_d = this.root.querySelector("[data-preview-start]")) == null ? void 0 : _d.addEventListener("click", () => this.startGuidePreview());
      (_e = this.root.querySelector("[data-preview-reset]")) == null ? void 0 : _e.addEventListener("click", () => this.startGuidePreview());
      (_f = this.root.querySelector("[data-preview-next]")) == null ? void 0 : _f.addEventListener("click", () => this.advanceGuidePreview(1));
      (_g = this.root.querySelector("[data-preview-back]")) == null ? void 0 : _g.addEventListener("click", () => this.advanceGuidePreview(-1));
      (_h = this.root.querySelector("[data-preview-test]")) == null ? void 0 : _h.addEventListener("click", () => {
        var _a2;
        const advance = (_a2 = this.guide) == null ? void 0 : _a2.steps[this.stepIndex].advance;
        if (this.mode === "preview" && !this.guidePreviewComplete && ((advance == null ? void 0 : advance.type) === "custom_event" || (advance == null ? void 0 : advance.type) === "route")) this.advanceGuidePreview(1);
      });
    }
    pickGuideInteraction() {
      var _a, _b, _c, _d, _e;
      const step = (_a = this.guide) == null ? void 0 : _a.steps[this.stepIndex];
      if (!step || !this.flushContent() || !(((_b = step.advance) == null ? void 0 : _b.type) === "element_click" || ((_c = step.advance) == null ? void 0 : _c.type) === "element_hover")) return;
      const generation = ++this.selectionGeneration;
      this.picker.cancel();
      (_d = this.contentEditor) == null ? void 0 : _d.destroy();
      this.contentEditor = null;
      (_e = this.compositionEditor) == null ? void 0 : _e.destroy();
      this.compositionEditor = null;
      this.previewGeneration++;
      this.preview.destroy();
      this.previewRendered = false;
      this.setText("[data-mode-hint]", "Select the website element that advances this step. Its positioning target stays unchanged. Escape cancels.");
      void this.picker.pick().then((target) => {
        var _a2, _b2, _c2, _d2;
        if (generation !== this.selectionGeneration || ((_b2 = (_a2 = this.guide) == null ? void 0 : _a2.steps[this.stepIndex]) == null ? void 0 : _b2.id) !== step.id) return;
        if (target && (((_c2 = step.advance) == null ? void 0 : _c2.type) === "element_click" || ((_d2 = step.advance) == null ? void 0 : _d2.type) === "element_hover")) {
          step.advance.target = { ...target, targetContext: { pagePath: currentPagePath() } };
          this.changed();
        } else {
          this.renderPreview();
          this.syncPanel();
        }
      });
    }
    syncGuideBehavior() {
      var _a, _b, _c, _d, _e;
      if (!this.root) return;
      const controls = this.root.querySelector("[data-guide-preview]");
      if (controls) controls.hidden = !this.guide || this.mode !== "preview";
      if (!this.guide) return;
      const step = this.guide.steps[this.stepIndex];
      const advance = step.advance;
      const type = (advance == null ? void 0 : advance.type) ?? "button";
      const anchored = guideStepRequiresTarget(step);
      this.setValue("[data-guide-trigger]", type);
      this.root.querySelectorAll("[data-guide-trigger] option").forEach((option) => {
        option.disabled = !anchored && ["element_click", "element_hover"].includes(option.value);
      });
      this.setText("[data-guide-trigger-help]", type === "button" ? "Buttons configured as Next step advance this Guide. Website click and hover triggers are available on Anchored Cards." : type === "element_click" ? "A click on the selected website element advances once; the normal click still works." : type === "element_hover" ? "Keep the pointer over the selected element for the specified duration." : type === "custom_event" ? "Advance when the SDK receives this exact event name." : "Advance on a future navigation matching this path. Use * for wildcard patterns.");
      this.root.querySelectorAll("[data-guide-config]").forEach((group) => {
        const config = group.dataset.guideConfig;
        group.hidden = config === "element" ? !["element_click", "element_hover"].includes(type) : config === "hover" ? type !== "element_hover" : config === "event" ? type !== "custom_event" : type !== "route";
      });
      const target = guideInteractionTarget(step);
      const hasTarget = (advance == null ? void 0 : advance.type) === "element_click" || (advance == null ? void 0 : advance.type) === "element_hover" ? Boolean(advance.target) : false;
      this.setChecked("[data-guide-use-position]", !hasTarget);
      this.setText("[data-guide-interaction-label]", (target == null ? void 0 : target.label) ?? (target == null ? void 0 : target.primarySelector) ?? "No element selected");
      let count = 0;
      if (target) try {
        count = document.querySelectorAll(target.primarySelector).length;
      } catch {
      }
      this.setText("[data-guide-interaction-status]", target ? `${capitalize(target.reliability)} selector · ${count} primary matches · ${this.targetStatus(target) === "found" ? "Found" : "Missing or on another page"}` : "Select an element or configure a positioning target first.");
      this.setValue("[data-guide-hover]", String((advance == null ? void 0 : advance.type) === "element_hover" ? advance.durationMs ?? 500 : 500));
      this.setValue("[data-guide-event]", (advance == null ? void 0 : advance.type) === "custom_event" ? advance.eventName : "");
      const rule = (advance == null ? void 0 : advance.type) === "route" ? advance.pageRules.find((item) => item.kind === "include") : void 0;
      this.setValue("[data-guide-route]", (rule == null ? void 0 : rule.value) ?? "");
      this.setValue("[data-guide-route-operator]", (rule == null ? void 0 : rule.operator) ?? "equals");
      this.root.querySelector("[data-guide-route-extra]").hidden = (advance == null ? void 0 : advance.type) !== "route" || advance.pageRules.length <= 1;
      this.setValue("[data-guide-delay]", String(((_a = step.presentation) == null ? void 0 : _a.delayMs) ?? 0));
      this.setValue("[data-guide-missing-action]", ((_c = (_b = step.presentation) == null ? void 0 : _b.missingTarget) == null ? void 0 : _c.action) ?? "wait");
      this.setValue("[data-guide-timeout]", String(((_e = (_d = step.presentation) == null ? void 0 : _d.missingTarget) == null ? void 0 : _e.timeoutMs) ?? 5e3));
      this.root.querySelector("[data-guide-missing]").hidden = !anchored;
      this.setChecked("[data-guide-dismissible]", step.behavior.dismissible ?? true);
      this.setText("[data-preview-step]", `${this.guidePreviewComplete ? "Complete · " : ""}${this.stepIndex + 1}/${this.guide.steps.length}`);
      this.root.querySelector("[data-preview-back]").disabled = this.stepIndex === 0;
      this.root.querySelector("[data-preview-next]").disabled = this.guidePreviewComplete;
      const test = this.root.querySelector("[data-preview-test]");
      test.hidden = !["custom_event", "route"].includes(type) || this.guidePreviewComplete;
      test.textContent = type === "route" ? "Simulate match" : "Test event";
    }
    previewTriggerHint() {
      var _a;
      const advance = (_a = this.guide) == null ? void 0 : _a.steps[this.stepIndex].advance;
      return this.guidePreviewComplete ? "Guide preview complete. Reset to start again." : (advance == null ? void 0 : advance.type) === "custom_event" ? `Waiting for “${advance.eventName}”. Test event is preview-only.` : (advance == null ? void 0 : advance.type) === "route" ? "Waiting for matching navigation. Simulate match does not navigate." : (advance == null ? void 0 : advance.type) === "element_click" ? "Click the configured website element." : (advance == null ? void 0 : advance.type) === "element_hover" ? "Hover over the configured website element." : "Click a Next step button.";
    }
    startGuidePreview() {
      if (!this.guide || !this.flushContent()) return;
      this.guidePreviewComplete = false;
      this.stepIndex = 0;
      if (this.mode !== "preview") this.setMode("preview");
      else {
        this.renderPreview();
        this.syncPanel();
      }
    }
    advanceGuidePreview(delta) {
      if (!this.guide || this.mode !== "preview" || this.guidePreviewComplete && delta > 0) return;
      if (this.stepIndex + delta >= this.guide.steps.length) {
        this.guidePreviewComplete = true;
        this.previewGeneration++;
        this.preview.destroy();
        this.previewRendered = false;
        this.syncGuideBehavior();
        this.setText("[data-trigger-status]", this.previewTriggerHint());
        return;
      }
      this.guidePreviewComplete = false;
      this.switchStep(this.stepIndex + delta);
    }
    addGuideStep(pattern) {
      if (!this.guide || !this.flushContent()) return;
      if (this.guide.steps.length >= 20) {
        this.showValidation(["A Guide can contain up to 20 steps."]);
        return;
      }
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
      var _a, _b, _c;
      const flow = (_a = this.root) == null ? void 0 : _a.querySelector("[data-step-flow]");
      if (!flow) return;
      flow.innerHTML = this.stepButtons();
      flow.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => this.switchStep(Number(button.dataset.step))));
      const remove = (_b = this.root) == null ? void 0 : _b.querySelector("[data-step-bar-actions] [data-delete-step]");
      if (remove) remove.disabled = !this.guide || this.guide.steps.length <= 1;
      const add = (_c = this.root) == null ? void 0 : _c.querySelector("[data-add-current-step]");
      if (add && this.guide) add.title = `Add a ${getGuideStepPattern(this.guide.steps[this.stepIndex]) === "modal" ? "Modal" : "Anchored"} step`;
      this.syncPanel();
    }
    bindDrag() {
      var _a, _b;
      const handle = (_a = this.root) == null ? void 0 : _a.querySelector("[data-drag-handle]");
      const aside = (_b = this.root) == null ? void 0 : _b.querySelector("[data-editor-toolbar]");
      if (!handle || !aside) return;
      handle.addEventListener("pointerdown", (event) => {
        var _a2;
        if (event.target.closest("button")) return;
        const rect = aside.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        let frame = 0;
        const move = (next) => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            aside.style.right = "auto";
            aside.style.transform = "none";
            aside.style.left = `${Math.max(4, Math.min(innerWidth - rect.width - 4, rect.left + next.clientX - startX))}px`;
            aside.style.top = `${Math.max(4, Math.min(innerHeight - rect.height - 4, rect.top + next.clientY - startY))}px`;
          });
        };
        const stop = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", stop);
          window.removeEventListener("pointercancel", stop);
          this.dragCleanup = null;
        };
        (_a2 = this.dragCleanup) == null ? void 0 : _a2.call(this);
        this.dragCleanup = stop;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
      });
    }
    bindStepBarDrag() {
      var _a, _b;
      const handle = (_a = this.root) == null ? void 0 : _a.querySelector("[data-step-drag-handle]");
      const bar = (_b = this.root) == null ? void 0 : _b.querySelector("[data-guide]");
      if (!handle || !bar) return;
      handle.addEventListener("pointerdown", (event) => {
        var _a2;
        const rect = bar.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        let frame = 0;
        const move = (next) => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            bar.style.right = "auto";
            bar.style.bottom = "auto";
            bar.style.transform = "none";
            bar.style.left = `${Math.max(4, Math.min(innerWidth - rect.width - 4, rect.left + next.clientX - startX))}px`;
            bar.style.top = `${Math.max(4, Math.min(innerHeight - rect.height - 4, rect.top + next.clientY - startY))}px`;
          });
        };
        const stop = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", stop);
          window.removeEventListener("pointercancel", stop);
          this.dragCleanup = null;
        };
        (_a2 = this.dragCleanup) == null ? void 0 : _a2.call(this);
        this.dragCleanup = stop;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
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
      this.guidePreviewComplete = false;
      this.configureDiagnostics();
      this.updateContinuation();
      this.applyMode();
    }
    applyMode() {
      var _a;
      if (this.mode === "navigate") {
        this.previewGeneration++;
        (_a = this.checklistEditor) == null ? void 0 : _a.destroyView();
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
    changed(render = true, preserveAiHistory = false) {
      if (this.saveState === "expired") return;
      if (!preserveAiHistory) {
        this.guideAiUndo = [];
        this.guideAiRedo = [];
        this.surveyAiUndo = [];
        this.surveyAiRedo = [];
      }
      this.dirty = true;
      this.editGeneration++;
      this.updateContinuation();
      if (render) this.syncPanel();
      else {
        this.syncContentInspector();
        this.syncCompositionInspector();
      }
      if (render && this.mode !== "navigate") this.renderPreview();
      if (this.saveState !== "conflict" && this.saveState !== "failed") this.saveState = this.saveInFlight ? "saving" : "dirty";
      this.showSaveState();
      clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => void this.persist(), 350);
    }
    flushContent() {
      var _a, _b, _c;
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
      const allErrors = [...errors, ...((_b = this.compositionEditor) == null ? void 0 : _b.getValidation()) ?? [], ...((_c = this.guide) == null ? void 0 : _c.steps.flatMap(guideStepConfigurationErrors)) ?? [], ...this.survey ? surveyBranchErrors(this.survey) : []];
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
      var _a, _b, _c, _d;
      const labels = { clean: "Draft saved", dirty: "Unsaved", saving: "Saving…", failed: "Save failed", conflict: "Conflict · reload required", expired: "Session expired · export unsaved edits" };
      this.setText("[data-save-state]", labels[this.saveState]);
      const save = (_a = this.root) == null ? void 0 : _a.querySelector("[data-save]");
      if (save) save.disabled = !this.dirty || ["saving", "conflict", "expired"].includes(this.saveState);
      const recovering = ["failed", "conflict", "expired"].includes(this.saveState);
      const recovery = (_b = this.root) == null ? void 0 : _b.querySelector("[data-save-recovery]");
      if (recovery) recovery.hidden = !recovering;
      const retry = (_c = this.root) == null ? void 0 : _c.querySelector("[data-retry-save]");
      if (retry) retry.hidden = this.saveState !== "failed";
      const reload = (_d = this.root) == null ? void 0 : _d.querySelector("[data-reload-draft]");
      if (reload) reload.hidden = !["conflict", "expired"].includes(this.saveState);
      this.setText("[data-recovery-message]", "Local edits remain in memory in this tab. Export before reloading or leaving.");
    }
    captureRecovery() {
      var _a, _b, _c, _d, _e, _f;
      if (!this.definition || !this.dirty && !((_a = this.contentEditor) == null ? void 0 : _a.isComposing()) && !((_b = this.compositionEditor) == null ? void 0 : _b.isComposing())) return;
      const definition = JSON.parse(JSON.stringify(this.checklist ?? this.definition));
      const snapshot = ((_c = this.compositionEditor) == null ? void 0 : _c.snapshot()) ?? ((_d = this.contentEditor) == null ? void 0 : _d.snapshot());
      if (snapshot) {
        const part = isGuideDefinition(definition) ? definition.steps[this.stepIndex] : "survey" in definition && definition.survey ? definition.survey.steps[this.stepIndex] : definition;
        part.builder = snapshot.builder;
        if (!isChecklistDefinition(part)) part.content = snapshot.content;
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
      const definition = JSON.parse(JSON.stringify(this.checklist ?? this.definition));
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
      var _a, _b, _c, _d, _e, _f;
      if (!this.definition || !this.draft || this.mode === "navigate" || this.saveState === "expired") return;
      if (!this.flushContent()) return;
      const generation = ++this.previewGeneration;
      if (this.mode === "preview" && this.guide) this.guidePreviewEntryPath = currentPagePath();
      this.previewRendered = false;
      (_a = this.contentEditor) == null ? void 0 : _a.destroy();
      this.contentEditor = null;
      this.componentSelection = null;
      (_b = this.compositionEditor) == null ? void 0 : _b.destroy();
      this.compositionEditor = null;
      this.compositionSelection = null;
      if (this.checklist && this.checklistEditor) {
        this.preview.destroy();
        this.previewRendered = this.checklistEditor.render(this.draft.experience.id, this.draft.version.id, this.mode === "preview");
        this.applyPreviewDevice();
        if (this.mode === "design" && this.previewRendered) this.attachContentEditor();
        this.updateDiagnostics();
        return;
      }
      const definition = this.definition;
      const rendered = JSON.parse(JSON.stringify(definition));
      if (this.mode !== "preview") {
        if (isGuideDefinition(rendered)) rendered.steps.forEach((step) => {
          step.behavior.dismissible = false;
          step.advance = { type: "button" };
          delete step.presentation;
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
      const selectedStepId = ((_d = (_c = this.guide) == null ? void 0 : _c.steps[this.stepIndex]) == null ? void 0 : _d.id) ?? (this.mode === "preview" ? void 0 : (_f = (_e = this.survey) == null ? void 0 : _e.steps[this.stepIndex]) == null ? void 0 : _f.id);
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
          this.applyPreviewDevice();
          if (this.mode === "design") this.attachContentEditor();
          this.updateDiagnostics();
        },
        onDismiss: () => {
          this.previewRendered = false;
          this.setText("[data-trigger-status]", "Preview closed. Start or Reset to try again.");
          this.updateDiagnostics();
        },
        onAction: () => void 0,
        onGuideAdvance: () => {
          if (this.mode === "preview" && this.guide) this.advanceGuidePreview(1);
        },
        onGuideBack: () => {
          if (this.mode === "preview" && this.guide) this.advanceGuidePreview(-1);
        },
        onGuideStatus: (status) => {
          if (generation === this.previewGeneration && this.mode === "preview") this.setText("[data-trigger-status]", status === "delay" ? "Waiting for presentation delay…" : status === "waiting" ? "Waiting for a website element…" : status === "unavailable" ? "Target missing; use Next, Reset or reselect the target." : this.previewTriggerHint());
        },
        onSurveySubmit: this.mode === "preview" && this.survey ? () => {
          this.setText("[data-preview-limit]", "Preview complete. No response or production analytics were sent. Website interactions can still run your site's JavaScript.");
        } : void 0,
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
    applyPreviewDevice() {
      var _a;
      if (!this.draft) return;
      const host = Array.from(document.querySelectorAll("[data-movcues-experience],[data-movcues-checklist]")).find((element) => (element.dataset.movcuesExperience ?? element.dataset.movcuesChecklist) === this.draft.experience.id), surface = (_a = host == null ? void 0 : host.shadowRoot) == null ? void 0 : _a.querySelector(".card,.movcues-widget");
      if (!surface) return;
      if (surface.dataset.movcuesOriginalMaxWidth === void 0) surface.dataset.movcuesOriginalMaxWidth = surface.style.maxWidth;
      const width = this.previewDevice === "mobile" ? 360 : this.previewDevice === "tablet" ? 720 : null;
      if (width) {
        surface.style.maxWidth = `min(${width}px, calc(100vw - 16px))`;
        surface.dataset.movcuesViewportPreview = this.previewDevice;
      } else {
        surface.style.maxWidth = surface.dataset.movcuesOriginalMaxWidth;
        delete surface.dataset.movcuesViewportPreview;
      }
    }
    attachContentEditor() {
      var _a, _b, _c;
      if (((_a = this.draft) == null ? void 0 : _a.experience.builderMode) !== "onsite" || this.mode !== "design") return;
      const host = Array.from(document.querySelectorAll("[data-movcues-experience],[data-movcues-checklist]")).find(
        (element) => (element.dataset.movcuesExperience ?? element.dataset.movcuesChecklist) === this.draft.experience.id
      );
      const builder = this.currentBuilder();
      const content = this.currentContent();
      if (!(host == null ? void 0 : host.shadowRoot) || !builder || !content) return;
      if (document.body && !document.body.contains(host)) document.body.appendChild(host);
      (_b = this.contentEditor) == null ? void 0 : _b.destroy();
      (_c = this.compositionEditor) == null ? void 0 : _c.destroy();
      try {
        this.compositionEditor = new OnsiteCompositionEditor(host.shadowRoot, builder, content, this.checklist ? "checklist" : this.guide ? getGuideStepPattern(this.guide.steps[this.stepIndex]) : this.draft.experience.widgetType ?? "modal", Boolean(this.guide), {
          onPatch: () => {
            var _a2;
            (_a2 = this.checklistEditor) == null ? void 0 : _a2.applyDesign(this.draft.experience.id);
          },
          onChange: () => {
            this.syncOnsiteAnchoredPointer(host.shadowRoot, builder);
            this.changed(false);
          },
          onValidation: (errors) => this.showValidation(errors),
          onImageStatus: (message) => this.setText("[data-image-status]", message),
          onSelectionChange: (selection) => {
            var _a2, _b2, _c2, _d;
            if (this.checklist && selection.kind !== "step") {
              (_b2 = (_a2 = this.root) == null ? void 0 : _a2.querySelector("aside")) == null ? void 0 : _b2.classList.remove("minimized");
              (_d = (_c2 = this.root) == null ? void 0 : _c2.querySelector("[data-minimize]")) == null ? void 0 : _d.setAttribute("aria-expanded", "true");
            }
            this.compositionSelection = selection;
            this.syncCompositionInspector();
            this.syncAiPanel();
          }
        }, this.survey ? { config: this.survey, step: this.survey.steps[this.stepIndex] } : void 0, this.checklist ?? void 0);
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
      var _a, _b, _c, _d, _e, _f, _g, _h, _i;
      (_a = this.surveyEditor) == null ? void 0 : _a.sync();
      (_b = this.checklistEditor) == null ? void 0 : _b.sync();
      if (!this.root) return;
      const editor = this.compositionEditor;
      const selection = this.compositionSelection;
      const inspector = this.root.querySelector("[data-composition-inspector]");
      if (!inspector) return;
      const globalUndo = this.root.querySelector("[data-global-undo]");
      const globalRedo = this.root.querySelector("[data-global-redo]");
      if (globalUndo) globalUndo.disabled = !this.guideAiUndo.length && !this.surveyAiUndo.length && !(editor == null ? void 0 : editor.canUndo()) && !((_c = this.contentEditor) == null ? void 0 : _c.canUndo());
      if (globalRedo) globalRedo.disabled = !this.guideAiRedo.length && !this.surveyAiRedo.length && !(editor == null ? void 0 : editor.canRedo()) && !((_d = this.contentEditor) == null ? void 0 : _d.canRedo());
      inspector.hidden = this.mode !== "design" || !editor || !selection;
      this.root.querySelector("[data-content-inspector]").hidden = Boolean(editor) || this.mode !== "design" || !this.componentSelection;
      if (!editor || !selection) return;
      if (selection.kind === "step") this.syncGuideBehavior();
      this.setText("[data-composition-label]", selection.label);
      this.root.querySelectorAll("[data-step-only]").forEach((group) => {
        if (selection.kind !== "step") group.hidden = true;
      });
      if (selection.kind === "step") this.root.querySelectorAll("[data-step-only]").forEach((group) => {
        group.hidden = group.hasAttribute("data-for") ? !this.isTargetedType() : group.hasAttribute("data-step-summary") ? !this.guide : group.hasAttribute("data-placement-section") ? Boolean(this.guide && getGuideStepPattern(this.guide.steps[this.stepIndex]) === "modal") : false;
      });
      const stepName = (_e = this.root.querySelector("[data-step-name]")) == null ? void 0 : _e.closest("label");
      if (stepName) stepName.hidden = !this.guide;
      this.root.querySelectorAll("[data-inspector]").forEach((group) => {
        group.hidden = group.dataset.inspector !== selection.kind;
      });
      const step = (_f = this.guide) == null ? void 0 : _f.steps[this.stepIndex];
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
        this.setValue("[data-cell-background]", ((_g = cell.style) == null ? void 0 : _g.background) && /^#[0-9a-f]{6}$/i.test(cell.style.background) ? cell.style.background : "#ffffff");
        this.setValue("[data-cell-border]", String(((_h = cell.style) == null ? void 0 : _h.borderWidth) ?? 0));
        this.setValue("[data-cell-radius]", String(((_i = cell.style) == null ? void 0 : _i.borderRadius) ?? 0));
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
      if ((block == null ? void 0 : block.type) === "image") {
        const local = block.src.startsWith("data:");
        if (local) this.setValue("[data-v2-image-src]", "");
        this.root.querySelector("[data-v2-image-src]").placeholder = local ? "Added from file; paste a URL to replace" : "https://… (optional)";
        this.setText("[data-choose-image]", block.src ? "Replace image" : "Choose image");
      }
      this.hideChecklistWidgetControls();
      const undo = this.root.querySelector("[data-v2-undo]");
      if (undo) undo.disabled = !editor.canUndo();
      const redo = this.root.querySelector("[data-v2-redo]");
      if (redo) redo.disabled = !editor.canRedo();
      if (globalUndo) globalUndo.disabled = !this.guideAiUndo.length && !this.surveyAiUndo.length && !editor.canUndo();
      if (globalRedo) globalRedo.disabled = !this.guideAiRedo.length && !this.surveyAiRedo.length && !editor.canRedo();
    }
    setInspectorTab(tab) {
      var _a, _b;
      if (!this.root || tab === "ai" && (this.checklist || ((_a = this.draft) == null ? void 0 : _a.experience.builderMode) !== "onsite")) return;
      (_b = this.root.querySelector("main")) == null ? void 0 : _b.classList.toggle("ai-mode", tab === "ai");
      this.root.querySelectorAll("[data-inspector-tab]").forEach((button) => button.classList.toggle("active", button.dataset.inspectorTab === tab));
      const panel = this.root.querySelector("[data-ai-panel]");
      if (panel) panel.hidden = tab !== "ai";
      if (tab === "ai") this.syncAiPanel();
    }
    syncAiPanel() {
      var _a;
      if (!this.root) return;
      const selection = this.compositionSelection;
      this.setText("[data-ai-context]", this.guide ? `Guide · step ${this.stepIndex + 1} of ${this.guide.steps.length}${selection ? ` · ${selection.label}` : ""}` : this.survey ? `Survey · step ${this.stepIndex + 1} of ${this.survey.steps.length}${selection ? ` · ${selection.label}` : ""}` : selection ? `Editing ${selection.label} · ${selection.kind}` : "Choose an element or ask about the whole widget.");
      const proposal = this.root.querySelector("[data-ai-proposal]");
      if (proposal) proposal.hidden = !this.aiProposal;
      if (!this.aiProposal) return;
      this.setText("[data-ai-summary]", this.aiProposal.value.summary);
      const list = this.root.querySelector("[data-ai-operations]");
      if (list) {
        const items = this.aiProposal.value.operations.map((operation, index) => {
          var _a2, _b;
          const item = document.createElement("li");
          const stepId = "stepId" in operation ? operation.stepId : void 0;
          const steps = ((_a2 = this.guide) == null ? void 0 : _a2.steps.map((value) => ({ id: value.id, label: value.label || value.content.heading }))) ?? ((_b = this.survey) == null ? void 0 : _b.steps.map((value) => ({ id: value.id, label: value.content.heading }))) ?? [];
          const stepIndex = stepId ? steps.findIndex((value) => value.id === stepId) : -1;
          item.textContent = `${operation.type.replace(/_/g, " ")}${stepIndex >= 0 ? ` · ${steps[stepIndex].label || `step ${stepIndex + 1}`}` : ""}${operation.type === "request_guide_target" && this.aiResolvedTargets.has(index) ? " · target selected" : ""}`;
          return item;
        });
        if (this.survey && this.definition) try {
          for (const warning of applySurveyAiProposal(this.definition, this.aiProposal.value).warnings) {
            const item = document.createElement("li");
            item.textContent = `Warning · ${warning}`;
            items.push(item);
          }
        } catch {
        }
        list.replaceChildren(...items);
      }
      const stale = this.aiProposal.revision !== ((_a = this.draft) == null ? void 0 : _a.version.revision) || this.aiProposal.generation !== this.editGeneration;
      const unresolved = this.aiProposal.value.operations.some((operation, index) => operation.type === "request_guide_target" && !this.aiResolvedTargets.has(index));
      const target = this.root.querySelector("[data-ai-target]");
      if (target) target.hidden = !this.guide || !unresolved;
      const preview = this.root.querySelector("[data-ai-preview]");
      if (preview) {
        preview.hidden = !this.guide && !this.survey;
        preview.disabled = stale || unresolved;
      }
      const apply = this.root.querySelector("[data-ai-apply]");
      if (apply) {
        apply.disabled = stale || unresolved;
        apply.title = stale ? "Draft changed; generate a fresh proposal." : unresolved ? "Select each requested website target first." : "Apply as one undoable change";
      }
      if (stale) this.setText("[data-ai-status]", "The draft changed. Discard this proposal and generate a fresh one.");
    }
    async sendAiPrompt() {
      var _a, _b, _c;
      const input = (_a = this.root) == null ? void 0 : _a.querySelector("[data-ai-prompt]");
      const prompt = input == null ? void 0 : input.value.trim();
      if (!prompt || !this.bridge || !this.draft || !this.compositionEditor || !this.compositionSelection || this.checklist) return;
      if (!this.flushContent() || this.dirty && !await this.persist()) return;
      this.cancelAiRequest();
      const generation = ++this.aiRequestGeneration;
      const abort = new AbortController();
      this.aiAbort = abort;
      const send = (_b = this.root) == null ? void 0 : _b.querySelector("[data-ai-send]");
      if (send) send.disabled = true;
      const cancel = (_c = this.root) == null ? void 0 : _c.querySelector("[data-ai-cancel]");
      if (cancel) cancel.hidden = false;
      this.setText("[data-ai-status]", "Generating a validated proposal…");
      this.discardAiPreview();
      this.aiProposal = null;
      this.aiResolvedTargets.clear();
      this.syncAiPanel();
      try {
        const context = this.guide ? guideAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, builderMode: "onsite" }, revision: this.draft.version.revision, guide: this.guide, currentStepId: this.guide.steps[this.stepIndex].id, selection: this.compositionSelection, theme: resolvedTheme(this.ensureThemeState()), scope: this.compositionSelection.kind === "step" ? "guide" : "step" }) : this.survey ? surveyAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, builderMode: "onsite" }, revision: this.draft.version.revision, definition: this.definition, currentStepId: this.survey.steps[this.stepIndex].id, selection: this.compositionSelection, scope: this.compositionSelection.kind === "step" ? "survey" : "step" }) : editorAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, widgetType: this.draft.experience.widgetType ?? null, builderMode: "onsite" }, selection: this.compositionSelection, document: this.compositionEditor.getDocument() });
        const response = await this.bridge.chat({ conversationId: this.aiConversationId, prompt, revision: this.draft.version.revision, context }, abort.signal);
        if (generation !== this.aiRequestGeneration) return;
        this.aiConversationId = response.conversationId;
        this.aiProposal = response.proposal ? { value: response.proposal, revision: response.revision, generation: this.editGeneration } : null;
        this.setText("[data-ai-status]", response.markdown);
        if (response.proposal && input) input.value = "";
        this.syncAiPanel();
      } catch (error) {
        if (generation === this.aiRequestGeneration && !abort.signal.aborted) {
          if (error instanceof DraftConflictError) this.saveState = "conflict";
          if (error instanceof EditorAiRequestError && error.conversationId) this.aiConversationId = error.conversationId;
          this.setText("[data-ai-status]", error instanceof Error ? error.message : "Movcues AI could not complete this request.");
          this.showSaveState();
        }
      } finally {
        if (generation === this.aiRequestGeneration) {
          this.aiAbort = null;
          if (send) send.disabled = false;
          if (cancel) cancel.hidden = true;
        }
      }
    }
    cancelAiRequest() {
      var _a, _b;
      if (!this.aiAbort) return;
      this.aiAbort.abort();
      this.aiAbort = null;
      this.aiRequestGeneration++;
      this.setText("[data-ai-status]", "Request canceled. Your prompt is still here.");
      const send = (_a = this.root) == null ? void 0 : _a.querySelector("[data-ai-send]");
      if (send) send.disabled = false;
      const cancel = (_b = this.root) == null ? void 0 : _b.querySelector("[data-ai-cancel]");
      if (cancel) cancel.hidden = true;
    }
    applyAiProposal() {
      var _a;
      if (!this.aiProposal || !this.draft || this.aiProposal.revision !== this.draft.version.revision || this.aiProposal.generation !== this.editGeneration) {
        this.syncAiPanel();
        return;
      }
      if (this.survey) {
        try {
          const before = cloneOnsite(this.surveyAiPreviewOriginal ?? this.definition);
          const candidate = this.surveyAiPreviewCandidate ?? applySurveyAiProposal(before, this.aiProposal.value).definition;
          this.surveyAiUndo.push(before);
          if (this.surveyAiUndo.length > 20) this.surveyAiUndo.shift();
          this.surveyAiRedo = [];
          this.setSurveyDefinition(cloneOnsite(candidate));
          this.surveyAiPreviewOriginal = null;
          this.surveyAiPreviewCandidate = null;
          this.aiPreviewReturnMode = null;
          this.aiProposal = null;
          this.changed(true, true);
          this.refreshStepBar();
          this.setText("[data-ai-status]", "Applied. Undo restores the complete Survey in one step.");
          this.syncAiPanel();
        } catch (error) {
          this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Survey proposal is invalid.");
        }
        return;
      }
      if (!this.guide) {
        if ((_a = this.compositionEditor) == null ? void 0 : _a.applyAiProposal(this.aiProposal.value)) {
          this.aiProposal = null;
          this.setText("[data-ai-status]", "Applied. Use Undo to revert the entire proposal.");
          this.syncAiPanel();
        }
        return;
      }
      try {
        const before = cloneOnsite(this.aiPreviewOriginal ?? this.guide);
        const candidate = this.aiPreviewCandidate ?? applyGuideAiProposal(before, this.aiProposal.value, this.aiResolvedTargets).guide;
        this.guideAiUndo.push(before);
        if (this.guideAiUndo.length > 20) this.guideAiUndo.shift();
        this.guideAiRedo = [];
        this.setGuideDefinition(cloneOnsite(candidate));
        this.aiPreviewOriginal = null;
        this.aiPreviewCandidate = null;
        this.aiPreviewReturnMode = null;
        this.aiProposal = null;
        this.aiResolvedTargets.clear();
        this.changed(true, true);
        this.refreshStepBar();
        this.setText("[data-ai-status]", "Applied. Undo restores the complete Guide in one step.");
        this.syncAiPanel();
      } catch (error) {
        this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Guide proposal is invalid.");
      }
    }
    resolveAiGuideTarget() {
      var _a;
      if (!this.aiProposal || !this.guide) return;
      this.discardAiPreview();
      const operationIndex = this.aiProposal.value.operations.findIndex((operation2, index2) => operation2.type === "request_guide_target" && !this.aiResolvedTargets.has(index2));
      const operation = this.aiProposal.value.operations[operationIndex];
      if (!operation || operation.type !== "request_guide_target") return;
      const index = this.guide.steps.findIndex((step) => step.id === operation.stepId);
      if (index < 0 || !this.flushContent()) return;
      this.stepIndex = index;
      const generation = ++this.selectionGeneration;
      this.picker.cancel();
      (_a = this.compositionEditor) == null ? void 0 : _a.destroy();
      this.compositionEditor = null;
      this.compositionSelection = null;
      this.preview.destroy();
      this.previewRendered = false;
      this.setText("[data-ai-status]", `Select the website element for this step's ${operation.targetKind === "position" ? "position" : "advance trigger"}. Escape cancels.`);
      void this.picker.pick().then((target) => {
        if (generation !== this.selectionGeneration || !target) {
          this.renderPreview();
          this.syncPanel();
          return;
        }
        this.aiResolvedTargets.set(operationIndex, { ...target, targetContext: { pagePath: currentPagePath() } });
        this.renderPreview();
        this.syncPanel();
        this.syncAiPanel();
      });
    }
    previewAiGuideProposal() {
      if (!this.aiProposal || !this.guide || !this.draft || this.aiProposal.revision !== this.draft.version.revision || this.aiProposal.generation !== this.editGeneration) return;
      try {
        this.discardAiPreview();
        const original = cloneOnsite(this.guide);
        this.aiPreviewReturnMode = this.mode;
        const result = applyGuideAiProposal(original, this.aiProposal.value, this.aiResolvedTargets);
        this.aiPreviewOriginal = original;
        this.aiPreviewCandidate = cloneOnsite(result.guide);
        this.setGuideDefinition(cloneOnsite(result.guide));
        this.stepIndex = 0;
        this.refreshStepBar();
        this.startGuidePreview();
        this.setText("[data-ai-status]", "Previewing the complete proposed Guide. Apply or Discard to finish.");
      } catch (error) {
        this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Guide proposal is invalid.");
      }
    }
    discardAiPreview() {
      if (this.surveyAiPreviewOriginal) {
        const returnMode2 = this.aiPreviewReturnMode;
        this.setSurveyDefinition(this.surveyAiPreviewOriginal);
        this.surveyAiPreviewOriginal = null;
        this.surveyAiPreviewCandidate = null;
        this.aiPreviewReturnMode = null;
        this.stepIndex = clampStep(this.stepIndex, this.survey.steps.length);
        this.refreshStepBar();
        if (returnMode2 && returnMode2 !== this.mode) this.setMode(returnMode2);
        else if (this.mode !== "navigate") this.renderPreview();
        return;
      }
      if (!this.aiPreviewOriginal) return;
      const returnMode = this.aiPreviewReturnMode;
      this.setGuideDefinition(this.aiPreviewOriginal);
      this.aiPreviewOriginal = null;
      this.aiPreviewCandidate = null;
      this.aiPreviewReturnMode = null;
      this.stepIndex = clampStep(this.stepIndex, this.guide.steps.length);
      this.refreshStepBar();
      if (returnMode && returnMode !== this.mode) this.setMode(returnMode);
      else if (this.mode !== "navigate") this.renderPreview();
    }
    discardAiProposal() {
      this.discardAiPreview();
      this.aiProposal = null;
      this.aiResolvedTargets.clear();
      this.setText("[data-ai-status]", "Proposal discarded. No draft changes were made.");
      this.syncAiPanel();
    }
    setGuideDefinition(value) {
      this.guide = value;
      this.definition = value;
    }
    setSurveyDefinition(value) {
      this.definition = value;
      this.survey = value.survey ?? null;
    }
    previewAiSurveyProposal() {
      if (!this.aiProposal || !this.survey || !this.draft || this.aiProposal.revision !== this.draft.version.revision || this.aiProposal.generation !== this.editGeneration) return;
      try {
        this.discardAiPreview();
        const original = cloneOnsite(this.definition), result = applySurveyAiProposal(original, this.aiProposal.value);
        this.aiPreviewReturnMode = this.mode;
        this.surveyAiPreviewOriginal = original;
        this.surveyAiPreviewCandidate = cloneOnsite(result.definition);
        this.setSurveyDefinition(cloneOnsite(result.definition));
        this.stepIndex = 0;
        this.refreshStepBar();
        this.setMode("preview");
        this.setText("[data-ai-status]", `Previewing the complete proposed Survey.${result.warnings.length ? ` ${result.warnings.join(" ")}` : ""} Apply or Discard to finish.`);
      } catch (error) {
        this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Survey proposal is invalid.");
      }
    }
    globalUndo() {
      var _a, _b;
      if (this.guide && this.guideAiUndo.length && this.flushContent()) {
        const previous = this.guideAiUndo.pop();
        this.guideAiRedo.push(cloneOnsite(this.guide));
        this.setGuideDefinition(previous);
        this.stepIndex = clampStep(this.stepIndex, previous.steps.length);
        this.changed(true, true);
        this.refreshStepBar();
        return;
      }
      if (this.survey && this.surveyAiUndo.length && this.flushContent()) {
        const previous = this.surveyAiUndo.pop();
        this.surveyAiRedo.push(cloneOnsite(this.definition));
        this.setSurveyDefinition(previous);
        this.stepIndex = clampStep(this.stepIndex, this.survey.steps.length);
        this.changed(true, true);
        this.refreshStepBar();
        return;
      }
      (_a = this.compositionEditor) == null ? void 0 : _a.undo();
      (_b = this.contentEditor) == null ? void 0 : _b.undo();
      this.syncContentInspector();
    }
    globalRedo() {
      var _a, _b;
      if (this.guide && this.guideAiRedo.length && this.flushContent()) {
        const next = this.guideAiRedo.pop();
        this.guideAiUndo.push(cloneOnsite(this.guide));
        this.setGuideDefinition(next);
        this.stepIndex = clampStep(this.stepIndex, next.steps.length);
        this.changed(true, true);
        this.refreshStepBar();
        return;
      }
      if (this.survey && this.surveyAiRedo.length && this.flushContent()) {
        const next = this.surveyAiRedo.pop();
        this.surveyAiUndo.push(cloneOnsite(this.definition));
        this.setSurveyDefinition(next);
        this.stepIndex = clampStep(this.stepIndex, this.survey.steps.length);
        this.changed(true, true);
        this.refreshStepBar();
        return;
      }
      (_a = this.compositionEditor) == null ? void 0 : _a.redo();
      (_b = this.contentEditor) == null ? void 0 : _b.redo();
      this.syncContentInspector();
    }
    syncPanel() {
      var _a, _b;
      if (!this.root || !this.definition || !this.draft) return;
      this.syncGuideBehavior();
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
      if (this.mode !== "design") this.root.querySelectorAll("[data-step-only]").forEach((group) => {
        group.hidden = this.mode !== "target" || group.dataset.for !== "target" || !activeGroups.has("target");
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
      this.syncThemeInspector();
      this.hideChecklistWidgetControls();
      this.setText("[data-mode-hint]", this.mode === "design" && this.draft.experience.widgetType === "cursor_follow" ? "Stationary authoring view · Preview tests cursor-follow movement" : this.mode === "design" && this.isTargetedType() && !this.currentTarget() ? "Select a page target in Target mode before editing this anchored card" : this.mode === "design" ? "Click a component to select · Double-click text to edit" : this.mode === "target" ? this.isTargetedType() ? "Select an element · Hold Shift to interact temporarily" : "This experience does not need a page target" : this.mode === "navigate" ? "Customer app interaction is enabled" : "End-user preview · analytics and actions are disabled");
    }
    hideChecklistWidgetControls() {
      if (!this.checklist || !this.root) return;
      this.root.querySelectorAll("[data-step-only],[data-edge]").forEach((node) => node.hidden = true);
      const target = this.root.querySelector("[data-mode=target]");
      if (target) {
        target.hidden = true;
        target.disabled = true;
      }
      this.setText("[data-preview-limit]", "Simulated Checklist progress only. No visitor records, Guide launches, navigation or production analytics are sent. Website JavaScript may still have side effects.");
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
      if (this.mode === "preview" && this.guide && !this.guidePreviewComplete) {
        const advance = this.guide.steps[this.stepIndex].advance;
        if (next !== this.guidePreviewEntryPath && (advance == null ? void 0 : advance.type) === "route" && matchesGuideRoute(next, advance.pageRules)) {
          this.advanceGuidePreview(1);
          return;
        }
      }
      if (this.mode !== "navigate" && !this.guidePreviewComplete) {
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
      var _a, _b;
      const element = (_a = this.root) == null ? void 0 : _a.querySelector(selector);
      if (element && element !== ((_b = this.root) == null ? void 0 : _b.activeElement)) element.value = value;
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
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
      this.lifecycle++;
      this.cancelAiRequest();
      this.aiProposal = null;
      this.aiConversationId = void 0;
      this.aiResolvedTargets.clear();
      this.aiPreviewOriginal = null;
      this.aiPreviewCandidate = null;
      this.surveyAiPreviewOriginal = null;
      this.surveyAiPreviewCandidate = null;
      this.aiPreviewReturnMode = null;
      this.guideAiUndo = [];
      this.guideAiRedo = [];
      this.surveyAiUndo = [];
      this.surveyAiRedo = [];
      clearTimeout(this.expiryTimer);
      clearInterval(this.validationTimer);
      clearTimeout(this.saveTimer);
      clearTimeout(this.targetRefreshTimer);
      this.selectionGeneration++;
      (_a = this.routeUnsubscribe) == null ? void 0 : _a.call(this);
      this.routeUnsubscribe = null;
      this.routeObserver.stop();
      window.removeEventListener("pagehide", this.persistBeforePageLeave);
      document.removeEventListener("click", this.protectPreviewNavigation, true);
      document.removeEventListener("submit", this.protectPreviewSubmission, true);
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
      (_k = this.surveyEditor) == null ? void 0 : _k.destroy();
      this.surveyEditor = null;
      (_l = this.checklistEditor) == null ? void 0 : _l.destroy();
      this.checklistEditor = null;
      this.checklist = null;
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
  const BASE_STYLE = `
:host{all:initial}*{box-sizing:border-box}aside{position:fixed;right:12px;top:12px;width:min(326px,calc(100vw - 8px));max-height:calc(100dvh - 24px);z-index:2147483647;overflow:hidden;background:#fff;color:#111827;border:1px solid #d7dce3;border-radius:12px;box-shadow:0 18px 50px rgba(15,23,42,.24);font:13px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif}aside.left-side{left:12px;right:auto}header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 12px 10px;border-bottom:1px solid #e5e7eb;cursor:move;user-select:none}.header-copy{display:grid;min-width:0}.header-copy strong{font-size:13px}.header-copy>span{overflow:hidden;color:#4b5563;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.header-copy small{margin-top:3px;color:#6b7280;font-size:11px}.header-copy i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a}.header-actions{display:flex;gap:2px}.header-actions button{width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:#64748b;font:16px/1 inherit;cursor:pointer}.header-actions button:hover{background:#f1f5f9;color:#0f172a}main{max-height:calc(100dvh - 82px);overflow:auto}.minimized{width:min(260px,calc(100vw - 8px))}.minimized main{display:none}.modebar{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px;border-bottom:1px solid #e5e7eb}.modebar button,.secondary-button,.placement-grid button,.formatbar button{border:1px solid #d7dce3;border-radius:7px;background:#fff;color:#334155;font:600 12px inherit;cursor:pointer}.modebar button{min-width:0;padding:7px 3px}.modebar button:disabled{cursor:not-allowed;opacity:.42}.modebar button.active,.placement-grid button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.notice{display:grid;gap:2px;margin:8px 10px 0;padding:8px;border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;color:#1e40af;font-size:11px}.section{display:grid;gap:8px;padding:10px 12px;border-bottom:1px solid #eef0f3}.eyebrow{color:#64748b;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.muted,.hint{color:#64748b;font-size:11px}.hint{margin:0;padding:9px 12px}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.step-navigator{position:fixed;left:50%;bottom:10px;width:min(680px,calc(100vw - 16px));transform:translateX(-50%);z-index:2147483647;border:1px solid #d7dce3;border-radius:10px;background:#fff;box-shadow:0 10px 32px rgba(15,23,42,.18)}.step-flow{display:flex;align-items:stretch;gap:4px;overflow:auto}.step{display:grid;grid-template-columns:auto minmax(54px,1fr) auto;align-items:center;gap:4px;flex:none;max-width:130px;padding:5px 7px;border:0;border-radius:6px;background:transparent;color:#64748b;font:600 11px inherit;cursor:pointer}.step small{overflow:hidden;font:10px/1.2 inherit;text-overflow:ellipsis;white-space:nowrap}.step i{font-style:normal}.step.active{background:#eff6ff;color:#1d4ed8}.step[data-step-status=found]{color:#15803d}.step[data-step-status=missing]{color:#b45309}.step.active{color:#1d4ed8}.reliability{color:#64748b;font-size:11px}.reliability[data-level=reliable]{color:#15803d}.reliability[data-level=fragile]{color:#b45309}.secondary-button{padding:7px 9px}.secondary-button.compact{padding:5px 7px}.content-heading,.history-row,.link-row,.save-recovery{display:flex;align-items:center;justify-content:space-between;gap:6px}.content-heading>div{min-width:0}.formatbar{display:flex;flex-wrap:wrap;gap:4px}.formatbar button{padding:5px 7px}.link-row input{min-width:0}.history-row{justify-content:flex-start;flex-wrap:wrap}.save-recovery{flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid #fee2e2;background:#fff7ed;color:#9a3412;font-size:11px}.placement-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.placement-grid button{padding:6px}.placement-grid button[data-placement=top]{grid-column:2}.placement-grid button[data-placement=left]{grid-column:1}.placement-grid button[data-placement=auto]{grid-column:2}.placement-grid button[data-placement=right]{grid-column:3}.placement-grid button[data-placement=bottom]{grid-column:2}label{display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:8px;color:#475569;font-size:11px}label.check{display:flex}label.check input{width:auto}input,select{min-width:0;width:100%;padding:6px 7px;border:1px solid #d7dce3;border-radius:6px;background:#fff;color:#111827;font:12px inherit}.number{display:grid;grid-template-columns:1fr auto;align-items:center;gap:5px}.number span{color:#64748b;font-size:11px}dl{display:grid;grid-template-columns:82px minmax(0,1fr);gap:5px 8px;margin:0;font-size:11px}dt{color:#64748b}dd{min-width:0;margin:0;overflow-wrap:anywhere;color:#1f2937}.live{font-size:11px}.status-ok{color:#15803d}.status-error{color:#b91c1c}.live code{display:block;overflow:hidden;padding:4px 6px;border-radius:5px;background:#f8fafc;color:#475569;font:11px/1.35 ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap}[data-missing-selector]{display:grid;gap:5px;padding-top:4px;color:#b91c1c}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #2563eb;outline-offset:2px}textarea[data-recovery-export]{box-sizing:border-box;width:100%;height:180px;font:11px monospace}[hidden]{display:none!important}@media(max-width:480px){.step-navigator{position:static;width:auto;transform:none;box-shadow:none}}@media(max-width:420px){aside{right:4px;top:4px;max-height:calc(100dvh - 8px)}aside.left-side{left:4px}main{max-height:calc(100dvh - 66px)}header{padding:9px}.section{padding:8px 10px}.modebar{padding:6px}.modebar button{font-size:10px}}
`;
  const STYLE = `${BASE_STYLE}
.editor-toolbar{position:fixed;left:50%;transform:translateX(-50%);top:12px;width:min(410px,calc(100vw - 8px));z-index:2147483647;border:1px solid #d7dce3;border-radius:10px;background:#fff;color:#111827;box-shadow:0 8px 24px rgba(15,23,42,.16);font:12px/1.3 ui-sans-serif,system-ui,sans-serif;overflow:hidden}
.devicebar{display:flex;align-items:center;gap:3px;padding:0 6px 5px;color:#64748b;font-size:9px}.devicebar span{margin-right:auto}.devicebar button{border:1px solid #d7dce3;border-radius:5px;background:#fff;color:#475569;padding:3px 5px;font:9px inherit;cursor:pointer}.devicebar button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}
.editor-toolbar header{padding:7px 8px;gap:4px;align-items:center}.header-copy>span{display:none}.header-copy strong{font-size:11px}.header-copy small{margin-top:1px;font-size:10px}.header-actions{flex-wrap:wrap;justify-content:flex-end;gap:1px}.header-actions button{width:25px;height:28px;font-size:14px}.header-actions [data-save]{width:38px;font-size:11px}.header-actions button:disabled{opacity:.4;cursor:default}
.editor-toolbar,aside,.step-navigator{pointer-events:auto}.editor-toolbar .modebar{padding:5px;border-bottom:0}.editor-toolbar .modebar button{padding:6px 3px;font-size:11px}.minimized{display:none}aside{box-shadow:0 8px 24px rgba(15,23,42,.14)}main{overscroll-behavior:contain}details.live{display:block}details.live summary{cursor:pointer;color:#64748b;font-size:11px}details.live[open]>div{margin-top:6px}.step-navigator{display:flex;align-items:center;gap:8px;width:min(680px,calc(100vw - 16px));padding:6px 8px}.step-drag-handle{flex:none;padding:2px 1px;color:#94a3b8;font-size:16px;line-height:1;cursor:move;touch-action:none;user-select:none}.step-navigator .content-heading{flex:none}.step-navigator .content-heading .eyebrow{display:none}.step-navigator .step-flow{flex:1;min-width:0}.step-navigator .history-row{gap:3px}.step-navigator .secondary-button{padding:4px;font-size:10px}.step-navigator .step-bar-action{width:24px;height:24px;padding:0;font-size:16px;line-height:1}.step-navigator .step-bar-action svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.8}.step-navigator .step-bar-delete{border-color:#fecaca;background:#fff1f2;color:#dc2626}.step-navigator .step-bar-delete:hover{border-color:#fca5a5;background:#fee2e2;color:#b91c1c}.step-navigator .step-bar-action:disabled{cursor:not-allowed;opacity:.4}.step-navigator .content-heading>.history-row{display:none}
.inspector-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:8px;border-bottom:1px solid #e5e7eb}.inspector-tabs button,.ai-suggestions button{border:1px solid #d7dce3;border-radius:7px;background:#fff;color:#475569;padding:6px;font:600 11px inherit;cursor:pointer}.inspector-tabs button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.inspector-tabs button:disabled{opacity:.4;cursor:not-allowed}main.ai-mode>:not(.inspector-tabs):not(.ai-panel){display:none!important}.ai-panel textarea{width:100%;resize:vertical;padding:7px;border:1px solid #d7dce3;border-radius:7px;font:12px/1.4 inherit}.ai-panel form{display:grid;gap:6px}.ai-suggestions{display:flex;flex-wrap:wrap;gap:4px}.ai-suggestions button{padding:5px 6px;font-weight:500}.ai-status{white-space:pre-wrap;color:#475569;font-size:11px}.ai-proposal{display:grid;gap:6px;padding:8px;border:1px solid #bfdbfe;border-radius:8px;background:#f8fbff}.ai-proposal ul{margin:0;padding-left:18px;color:#475569;font-size:11px}
[data-composition-inspector]>.history-row{display:none}
@media(max-width:800px){.editor-toolbar{width:min(350px,calc(100vw - 8px))}aside{width:min(300px,calc(100vw - 8px))}}
@media(max-width:480px){.editor-toolbar{left:4px;top:4px;transform:none}.header-copy strong{font-size:10px}.header-copy small{font-size:9px}.header-actions [data-return-dashboard],.header-actions [data-move-side]{display:none}aside{width:calc(100vw - 8px)}.step-navigator{position:fixed;left:50%;bottom:4px;transform:translateX(-50%);width:calc(100vw - 8px);box-shadow:0 4px 14px rgba(15,23,42,.12)}.step-navigator>.history-row:not([data-step-bar-actions]){display:none}.step-navigator .content-heading{display:none}}
`;
  const GUIDE_STYLE = `.guide-behavior{display:grid;gap:8px;border-top:1px solid #eef0f3;padding-top:10px;margin-top:8px}.guide-behavior [data-guide-config],.guide-behavior [data-guide-missing]{display:grid;gap:7px}.guide-behavior .muted{margin:0;overflow-wrap:anywhere}.guide-preview-controls{display:flex;align-items:center;flex-wrap:wrap;gap:4px;padding:5px 7px;border-top:1px solid #eef0f3}.guide-preview-controls button{border:1px solid #d7dce3;border-radius:5px;background:#fff;color:#334155;padding:4px 6px;font:11px ui-sans-serif,system-ui;cursor:pointer}.guide-preview-controls small{flex-basis:100%;color:#64748b;font-size:10px}.guide-preview-controls button:disabled{opacity:.4}.guide-preview-controls span{font-size:10px;margin-left:auto}`;
  function checklistEditorAdapter(value) {
    return { content: { heading: value.title, body: value.description ?? "" }, builder: value.builder, design: value.design ?? { width: "sm", theme: { background: "#fff", foreground: "#111827", primary: "#2563eb", borderRadius: "md" } }, behavior: { dismissible: false }, targeting: { ...value.targeting, trigger: { type: "page_load" }, frequency: { mode: "once" } }, visualTheme: value.visualTheme, template: value.template };
  }
  const runtime = {
    createController: (apiBase) => new EditorModeController(apiBase)
  };
  window.__movcuesEditorRuntime__ = runtime;
})();
//# sourceMappingURL=sdk-editor.js.map
