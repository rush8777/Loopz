(function() {
  "use strict";
  function getGuideStepPattern(step) {
    return step.pattern ?? "anchored_card";
  }
  function guideStepRequiresTarget(step) {
    return getGuideStepPattern(step) === "anchored_card";
  }
  function isGuideDefinition(value) {
    return "steps" in value;
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
  const BUILDER_ALLOWED_TAGS = /* @__PURE__ */ new Set(["DIV", "SECTION", "HEADER", "H1", "H2", "H3", "H4", "P", "SPAN", "BR", "BUTTON", "IMG", "HR", "LABEL", "STRONG", "EM", "U", "A", "UL", "OL", "LI"]);
  const BUILDER_SURVEY_INPUT_TAGS = /* @__PURE__ */ new Set(["INPUT", "TEXTAREA"]);
  const BUILDER_ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "id", "title", "role", "aria-label", "aria-live", "aria-hidden", "aria-pressed", "alt", "src", "href", "target", "rel", "width", "height", "type", "placeholder", "maxlength", "data-movcues-action-id", "data-movcues-content", "data-movcues-widget-type", "data-movcues-question-id", "data-movcues-question-type", "data-movcues-question-input", "data-movcues-option-id", "data-movcues-survey-action", "data-movcues-survey-controls", "data-movcues-survey-progress", "data-movcues-survey-progress-bar", "data-movcues-survey-step-id", "data-movcues-checklist-role", "data-movcues-checklist-item-id", "data-movcues-checklist-item-role", "data-movcues-checklist-view"]);
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
      const target = event.target instanceof Element ? event.target.closest("[data-movcues-action-id]") : null;
      if (!target || !card.contains(target)) return;
      if (target.dataset.movcuesActionId === "primary") callbacks.onPrimary();
      if (target.dataset.movcuesActionId === "secondary") callbacks.onSecondary();
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
      if (action && action !== "primary" && action !== "secondary") element.removeAttribute("data-movcues-action-id");
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
  function safeBuilderCss(input) {
    return safeScopedBuilderCss(input);
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
  function findTarget(target) {
    if (!target) return null;
    for (const selector of [target.primarySelector, ...target.fallbackSelectors]) {
      try {
        const matches = document.querySelectorAll(selector);
        if (matches.length === 1) return matches[0];
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
      };
      const update = () => {
        if (destroyed) return;
        if (!target.isConnected) {
          setHidden(true);
          return;
        }
        const rect = target.getBoundingClientRect();
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
        }
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
      this.submitting = false;
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
      return this.renderStep();
    }
    renderStep() {
      var _a, _b, _c;
      const root = this.root;
      const step = this.survey.steps[this.stepIndex];
      (_b = (_a = this.callbacks).onStepChange) == null ? void 0 : _b.call(_a, step.id);
      const baseStyle = root.firstElementChild;
      Array.from(root.children).forEach((element) => {
        if (element !== baseStyle) element.remove();
      });
      const content = { heading: step.content.heading || this.content.heading, body: step.content.body || this.content.body };
      const stepDesign = step.size ? { ...this.design, size: step.size } : this.design;
      const card = this.modal.render(root, content, stepDesign, this.behavior, { onDismiss: this.callbacks.onDismiss, onPrimary: this.callbacks.onDismiss, onSecondary: this.callbacks.onDismiss }, step.builder, "survey");
      let surface = card.querySelector(".movcues-widget");
      if (!surface) {
        (_c = card.querySelector(".legacy-content")) == null ? void 0 : _c.remove();
        surface = document.createElement("section");
        surface.className = "movcues-widget movcues-widget--survey";
        card.appendChild(surface);
      }
      surface.dataset.movcuesSurveyStepId = step.id;
      this.syncQuestions(surface, step.questions);
      this.syncNavigation(surface);
      return card;
    }
    syncQuestions(surface, questions) {
      var _a;
      const ids = new Set(questions.map((question) => question.id));
      surface.querySelectorAll("[data-movcues-question-id]").forEach((node) => {
        if (!ids.has(node.dataset.movcuesQuestionId ?? "")) node.remove();
      });
      let navigation = ((_a = surface.querySelector("[data-movcues-survey-action]")) == null ? void 0 : _a.parentElement) ?? null;
      for (const question of questions) {
        const matches = Array.from(surface.querySelectorAll(`[data-movcues-question-id="${cssEscape(question.id)}"]`));
        matches.slice(1).forEach((node2) => node2.remove());
        const node = matches[0] ?? createQuestionNode(question);
        if (!matches[0]) surface.insertBefore(node, navigation);
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
            if (!allowed.includes(optionId)) return;
            if (question.type === "multiple_choice") {
              const current = Array.isArray(this.answers[question.id]) ? this.answers[question.id] : [];
              this.answers[question.id] = current.includes(optionId) ? current.filter((value) => value !== optionId) : [...current, optionId];
            } else this.answers[question.id] = question.type === "rating" || question.type === "nps" ? Number(optionId) : optionId;
            node.classList.remove("has-error");
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
        this.answers[question.id] = input.value.slice(0, question.maxLength ?? 1e4);
        node.classList.remove("has-error");
      };
    }
    syncNavigation(surface) {
      const final = this.stepIndex === this.survey.steps.length - 1;
      const step = this.survey.steps[this.stepIndex];
      const buttons = Array.from(surface.querySelectorAll("[data-movcues-survey-action]"));
      const back = buttons.filter((button) => button.dataset.movcuesSurveyAction === "back");
      const next = buttons.filter((button) => button.dataset.movcuesSurveyAction === "next");
      const submit = buttons.filter((button) => button.dataset.movcuesSurveyAction === "submit");
      const legacyControls = Boolean(surface.querySelector("[data-movcues-survey-controls]"));
      for (const button of back) {
        button.hidden = !this.survey.allowBack || this.stepIndex === 0;
        button.onclick = () => {
          if (!this.survey.allowBack || this.stepIndex === 0) return;
          void this.callbacks.onProgress({ ...this.answers }, step.id, "back");
          this.stepIndex--;
          this.renderStep();
        };
      }
      for (const button of next) {
        button.hidden = final;
        button.onclick = async () => {
          if (!this.validateStep()) return;
          this.setDisabled(next, true);
          try {
            await this.callbacks.onProgress({ ...this.answers }, step.id, "next");
            this.stepIndex++;
            this.renderStep();
          } finally {
            this.setDisabled(next, false);
          }
        };
      }
      for (const button of submit) {
        button.hidden = !final;
        if (legacyControls) button.textContent = this.survey.submitLabel;
        button.onclick = async () => {
          if (this.submitting || !this.validateAll()) return;
          this.submitting = true;
          this.setDisabled(submit, true);
          try {
            await this.callbacks.onSubmit({ ...this.answers }, step.id);
          } finally {
            this.submitting = false;
            this.setDisabled(submit, false);
          }
        };
      }
      this.syncProgress(surface);
    }
    setDisabled(buttons, disabled) {
      buttons.forEach((button) => {
        if (button.isConnected) button.disabled = disabled;
      });
    }
    syncProgress(surface) {
      const progress = surface.querySelector("[data-movcues-survey-progress]");
      if (progress) progress.hidden = !this.survey.showProgress;
      const progressLabel = progress == null ? void 0 : progress.querySelector("span:not([data-movcues-survey-progress-bar])");
      if (progressLabel && !progressLabel.querySelector("[data-movcues-survey-progress-bar]")) progressLabel.textContent = `Step ${this.stepIndex + 1} of ${this.survey.steps.length}`;
      const bar = surface.querySelector("[data-movcues-survey-progress-bar]");
      if (bar) bar.style.width = `${(this.stepIndex + 1) / this.survey.steps.length * 100}%`;
    }
    validateStep() {
      return this.validateQuestions(this.survey.steps[this.stepIndex].questions);
    }
    validateAll() {
      let valid = true;
      let currentValid = true;
      for (const step of this.survey.steps) {
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
      this.modal.destroy();
      this.root = null;
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
        const matches = document.querySelectorAll(selector);
        if (matches.length === 1) return matches[0];
      } catch {
      }
    }
    return null;
  }
  function bounded(value) {
    return Math.max(-2147483648, Math.min(2147483647, value));
  }
  class ExperienceRenderer {
    constructor() {
      this.host = null;
      this.renderer = null;
      this.cancelPendingTarget = null;
      this.cleanupAdvance = null;
      this.appliedLayer = null;
      this.layerManager = new LayerManager();
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
        renderer.render(root, definition.content, definition.design, definition.behavior, definition.survey, { onDismiss: () => callbacks.onDismiss(), onProgress: (answers, stepId, direction) => {
          var _a2;
          return (_a2 = callbacks.onSurveyProgress) == null ? void 0 : _a2.call(callbacks, answers, stepId, direction);
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
      var _a;
      const stepIndex = guideStepId ? definition.steps.findIndex((item) => item.id === guideStepId) : 0;
      const step = definition.steps[stepIndex];
      if (!step) return false;
      const stepDesign = step.size ? { ...definition.design, size: step.size } : definition.design;
      const stepCallbacks = {
        onDismiss: () => {
          callbacks.onDismiss();
          this.destroy();
        },
        onSecondary: () => {
          callbacks.onDismiss();
          this.destroy();
        },
        onPrimary: () => {
          var _a2, _b;
          const action = step.content.primaryAction;
          if (action) callbacks.onAction(action);
          if ((((_a2 = step.advance) == null ? void 0 : _a2.type) ?? "button") === "button") (_b = callbacks.onGuideAdvance) == null ? void 0 : _b.call(callbacks);
        }
      };
      const addBack = (card) => {
        var _a2;
        if (stepIndex === 0) return;
        const back = document.createElement("button");
        back.className = "secondary";
        back.textContent = "Back";
        back.addEventListener("click", () => {
          var _a3;
          return (_a3 = callbacks.onGuideBack) == null ? void 0 : _a3.call(callbacks);
        });
        (_a2 = card.querySelector("footer")) == null ? void 0 : _a2.prepend(back);
      };
      if (getGuideStepPattern(step) === "modal") {
        const root = this.root(experience.id, { layer: step.behavior.layer ?? ((_a = definition.behavior) == null ? void 0 : _a.layer) });
        const renderer = new ModalRenderer();
        this.renderer = renderer;
        const behavior = { dismissible: step.behavior.dismissible ?? true };
        const card = renderer.render(root, step.content, stepDesign, behavior, stepCallbacks, step.builder);
        addBack(card);
        requestAnimationFrame(callbacks.onVisible);
        return true;
      }
      const mount = (target2) => {
        var _a2, _b, _c;
        ensureGuideTargetInView(target2);
        const root = this.root(experience.id, { layer: step.behavior.layer ?? ((_a2 = definition.behavior) == null ? void 0 : _a2.layer) }, target2);
        const renderer = new AnchoredCardRenderer();
        this.renderer = renderer;
        const behavior = { dismissible: step.behavior.dismissible ?? true, placement: step.behavior.placement, alignment: step.behavior.alignment, offset: step.behavior.offset, pointer: step.behavior.pointer };
        const card = renderer.render(root, target2, step.content, stepDesign, behavior, stepCallbacks, step.builder, "anchored_card");
        addBack(card);
        this.listenForAdvance(target2, ((_b = step.advance) == null ? void 0 : _b.type) ?? "button", ((_c = step.advance) == null ? void 0 : _c.type) === "element_hover" ? step.advance.durationMs : void 0, callbacks.onGuideAdvance);
        requestAnimationFrame(callbacks.onVisible);
      };
      const target = findTarget(step.target);
      if (target) mount(target);
      else this.cancelPendingTarget = waitForTarget(step.target, (element) => {
        this.cancelPendingTarget = null;
        mount(element);
      }, () => {
        var _a2;
        this.cancelPendingTarget = null;
        (_a2 = callbacks.onUnavailable) == null ? void 0 : _a2.call(callbacks);
      });
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
        }
      };
    }
    clearSurface() {
      var _a, _b, _c, _d, _e;
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
          const range2 = document.createRange();
          range2.selectNodeContents(this.selected);
          const selection = this.getSelection();
          selection == null ? void 0 : selection.removeAllRanges();
          selection == null ? void 0 : selection.addRange(range2);
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
        const text = (_a = paste.clipboardData) == null ? void 0 : _a.getData("text/plain");
        if (text === void 0) return;
        paste.preventDefault();
        const selection = this.getSelection();
        if (!(selection == null ? void 0 : selection.rangeCount)) return;
        const range2 = selection.getRangeAt(0);
        if (!((_b = this.selected) == null ? void 0 : _b.contains(range2.commonAncestorContainer))) return;
        this.beforeOperation();
        range2.deleteContents();
        const node = document.createTextNode(text);
        range2.insertNode(node);
        range2.setStartAfter(node);
        range2.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range2);
        this.savedRange = range2.cloneRange();
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
      const range2 = (selection == null ? void 0 : selection.rangeCount) ? selection.getRangeAt(0) : null;
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
      selection == null ? void 0 : selection.removeAllRanges();
      range2.selectNodeContents(anchor);
      selection == null ? void 0 : selection.addRange(range2);
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
      const range2 = (selection == null ? void 0 : selection.rangeCount) ? selection.getRangeAt(0) : null;
      if (!range2 || range2.collapsed || !((_a = this.selected) == null ? void 0 : _a.contains(range2.commonAncestorContainer))) return;
      if (range2.cloneContents().querySelector("ul,ol,li,div,p,button,img")) return;
      this.beforeOperation();
      const wrapper = document.createElement(tag);
      wrapper.append(range2.extractContents());
      range2.insertNode(wrapper);
      range2.selectNodeContents(wrapper);
      selection == null ? void 0 : selection.removeAllRanges();
      selection == null ? void 0 : selection.addRange(range2);
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
      const range2 = selection.getRangeAt(0);
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
        for (const text of nodes) {
          if (offset <= text.length) return [text, offset];
          offset -= text.length;
        }
        const last = nodes[nodes.length - 1];
        return [last, last.length];
      };
      const range2 = document.createRange();
      range2.setStart(...locate(start));
      range2.setEnd(...locate(end));
      const selection = this.getSelection();
      selection == null ? void 0 : selection.removeAllRanges();
      selection == null ? void 0 : selection.addRange(range2);
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
  const runtime = {
    createController: (apiBase) => new EditorModeController(apiBase)
  };
  window.__movcuesEditorRuntime__ = runtime;
})();
//# sourceMappingURL=sdk-editor.js.map
