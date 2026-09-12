(function() {
  "use strict";
  function isGuideDefinition(value) {
    return "steps" in value;
  }
  class EligibilityEngine {
    choose(experiences) {
      return [...experiences].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
    }
  }
  const ALLOWED_TAGS = /* @__PURE__ */ new Set(["DIV", "SECTION", "H1", "H2", "H3", "H4", "P", "SPAN", "BUTTON", "IMG", "HR", "LABEL"]);
  const ALLOWED_ATTRIBUTES = /* @__PURE__ */ new Set(["class", "id", "title", "role", "aria-label", "aria-live", "aria-hidden", "aria-pressed", "alt", "src", "width", "height", "type", "placeholder", "maxlength", "data-movecues-action-id", "data-movecues-content", "data-movecues-widget-type", "data-movecues-question-id", "data-movecues-question-type", "data-movecues-question-input", "data-movecues-option-id", "data-movecues-survey-action", "data-movecues-survey-controls", "data-movecues-survey-progress", "data-movecues-survey-progress-bar", "data-movecues-survey-step-id"]);
  function mountBuilderContent(root, card, builder, callbacks, allowSurveyInputs = false) {
    const html = sanitizeBuilderHtml(builder.html, allowSurveyInputs);
    const css = safeBuilderCss(builder.css);
    if (!html || css === null) return false;
    let style = root.querySelector("style[data-movecues-builder-style]");
    if (!style) {
      style = document.createElement("style");
      style.dataset.movecuesBuilderStyle = "";
      root.appendChild(style);
    }
    style.textContent = `${css}
${ISOLATION_CSS}`;
    const content = document.createElement("div");
    content.className = "builder-content";
    content.dataset.movecuesBuilderSurface = "";
    content.append(...html);
    card.appendChild(content);
    card.classList.add("builder-card");
    card.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-movecues-action-id]") : null;
      if (!target || !card.contains(target)) return;
      if (target.dataset.movecuesActionId === "primary") callbacks.onPrimary();
      if (target.dataset.movecuesActionId === "secondary") callbacks.onSecondary();
    });
    return true;
  }
  const ISOLATION_CSS = `[data-movecues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movecues-builder-surface]>.movecues-widget{position:relative!important;inset:auto!important}`;
  function sanitizeBuilderHtml(input, allowSurveyInputs = false) {
    const template = document.createElement("template");
    template.innerHTML = input;
    for (const element of Array.from(template.content.querySelectorAll("*"))) {
      const allowedTag = ALLOWED_TAGS.has(element.tagName) || allowSurveyInputs && (element.tagName === "INPUT" || element.tagName === "TEXTAREA");
      if (!allowedTag) {
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/i.test(element.tagName)) element.remove();
        else element.replaceWith(...Array.from(element.childNodes));
        continue;
      }
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (!ALLOWED_ATTRIBUTES.has(name) || name.startsWith("on") || /javascript\s*:/i.test(attribute.value)) element.removeAttribute(attribute.name);
      }
      const action = element.getAttribute("data-movecues-action-id");
      if (action && action !== "primary" && action !== "secondary") element.removeAttribute("data-movecues-action-id");
      if (element.tagName === "IMG") {
        const source = element.getAttribute("src") ?? "";
        if (source && !/^(https?:|data:image\/(?:png|gif|jpeg|webp);base64,|\/)/i.test(source)) element.removeAttribute("src");
      }
      if (element.tagName === "INPUT") {
        const type = (element.getAttribute("type") ?? "text").toLowerCase();
        if (!["text", "radio", "checkbox", "number"].includes(type)) element.setAttribute("type", "text");
      }
    }
    const root = template.content.querySelector(".movecues-widget");
    if (!root) return null;
    for (const slot of ["primary", "secondary"]) {
      const actions = Array.from(template.content.querySelectorAll(`[data-movecues-action-id="${slot}"]`));
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
      if (prelude.split(",").some((selector) => !selector.trim().includes(".movecues-widget"))) return null;
    }
    return css;
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
    card.style.overflow = "visible";
  }
  function clamp(value, min, max) {
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
    card.style.setProperty("--movecues-bg", design.theme.background);
    card.style.setProperty("--movecues-fg", design.theme.foreground);
    card.style.setProperty("--movecues-primary", design.theme.primary);
    card.dataset.width = design.width;
    card.dataset.radius = design.theme.borderRadius;
    if (widgetType) applyWidgetSizeEnvelope(card, widgetType, design);
    const close = behavior.dismissible ? `<button class="close" data-dismiss aria-label="Dismiss">×</button>` : "";
    card.innerHTML = close;
    (_a = card.querySelector("[data-dismiss]")) == null ? void 0 : _a.addEventListener("click", callbacks.onDismiss);
    if (!builder || !mountBuilderContent(root, card, builder, callbacks, widgetType === "survey")) {
      const primary = content.primaryAction ? `<button class="primary" data-primary>${escapeText(content.primaryAction.label)}</button>` : "";
      const secondary = content.secondaryAction ? `<button class="secondary" data-secondary>${escapeText(content.secondaryAction.label)}</button>` : "";
      card.insertAdjacentHTML("beforeend", `<div class="legacy-content"><h2>${escapeText(content.heading)}</h2><p>${escapeText(content.body)}</p><footer>${secondary}${primary}</footer></div>`);
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
      const update = () => {
        const rect = target.getBoundingClientRect();
        if (!isVisibleTarget(target, card, rect)) {
          card.style.visibility = "hidden";
          card.style.pointerEvents = "none";
          return;
        }
        card.style.visibility = "";
        card.style.pointerEvents = "";
        position(card, rect, behavior);
      };
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
  function isVisibleTarget(target, card, rect) {
    if (!target.isConnected || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
    if (typeof document.elementFromPoint !== "function") return true;
    const left = Math.max(0, rect.left);
    const right = Math.min(window.innerWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    const root = card.getRootNode();
    const cardHost = root instanceof ShadowRoot ? root.host : null;
    for (const horizontal of [0.2, 0.5, 0.8]) for (const vertical of [0.2, 0.5, 0.8]) {
      const hit = document.elementFromPoint(left + (right - left) * horizontal, top + (bottom - top) * vertical);
      if (!hit || hit === target || target.contains(hit) || hit === cardHost) return true;
    }
    return false;
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
  function escapeText(value) {
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
        backdrop.style.setProperty("--movecues-backdrop-opacity", String(behavior.backdropOpacity ?? 0.45));
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
        backdrop.style.setProperty("--movecues-backdrop-opacity", String(behavior.backdropOpacity ?? 0.35));
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
      beacon.style.setProperty("--movecues-hotspot", behavior.hotspotColor ?? design.theme.primary);
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
      var _a;
      const root = this.root;
      const step = this.survey.steps[this.stepIndex];
      const baseStyle = root.firstElementChild;
      Array.from(root.children).forEach((element) => {
        if (element !== baseStyle) element.remove();
      });
      const content = { heading: step.content.heading || this.content.heading, body: step.content.body || this.content.body };
      const stepDesign = step.size ? { ...this.design, size: step.size } : this.design;
      const card = this.modal.render(root, content, stepDesign, this.behavior, { onDismiss: this.callbacks.onDismiss, onPrimary: () => void 0, onSecondary: () => void 0 }, step.builder, "survey");
      let surface = card.querySelector(".movecues-widget");
      if (!surface) {
        (_a = card.querySelector(".legacy-content")) == null ? void 0 : _a.remove();
        surface = document.createElement("section");
        surface.className = "movecues-widget movecues-widget--survey";
        card.appendChild(surface);
      }
      surface.dataset.movecuesSurveyStepId = step.id;
      this.syncQuestions(surface, step.questions);
      this.syncNavigation(surface);
      return card;
    }
    syncQuestions(surface, questions) {
      var _a;
      const ids = new Set(questions.map((question) => question.id));
      surface.querySelectorAll("[data-movecues-question-id]").forEach((node) => {
        if (!ids.has(node.dataset.movecuesQuestionId ?? "")) node.remove();
      });
      let navigation = ((_a = surface.querySelector("[data-movecues-survey-action]")) == null ? void 0 : _a.parentElement) ?? null;
      for (const question of questions) {
        const matches = Array.from(surface.querySelectorAll(`[data-movecues-question-id="${cssEscape(question.id)}"]`));
        matches.slice(1).forEach((node2) => node2.remove());
        const node = matches[0] ?? createQuestionNode(question);
        if (!matches[0]) surface.insertBefore(node, navigation);
        node.dataset.movecuesQuestionType = question.type;
        node.classList.add("movecues-survey-question", `movecues-survey-question--${question.type}`);
        this.bindQuestion(node, question);
        navigation = navigation ?? node.nextElementSibling;
      }
    }
    bindQuestion(node, question) {
      var _a;
      node.classList.remove("has-error");
      if (question.type === "single_choice" || question.type === "multiple_choice" || question.type === "rating" || question.type === "nps") {
        const allowed = question.type === "rating" ? range(question.min, question.max).map(String) : question.type === "nps" ? range(0, 10).map(String) : question.options.map((option) => option.id);
        let controls = Array.from(node.querySelectorAll("[data-movecues-option-id]"));
        if (!controls.length) {
          const holder = document.createElement("div");
          holder.className = "movecues-survey-options";
          for (const value of allowed) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "movecues-survey-option";
            button.dataset.movecuesOptionId = value;
            button.textContent = question.type === "single_choice" || question.type === "multiple_choice" ? ((_a = question.options.find((option) => option.id === value)) == null ? void 0 : _a.label) ?? value : value;
            holder.appendChild(button);
          }
          node.appendChild(holder);
          controls = Array.from(holder.children);
        }
        controls.forEach((control) => {
          const optionId = control.dataset.movecuesOptionId;
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
              const value = item.dataset.movecuesOptionId;
              const answer = this.answers[question.id];
              const selected = Array.isArray(answer) ? answer.includes(value) : String(answer) === value;
              item.classList.toggle("is-selected", selected);
              item.setAttribute("aria-pressed", String(selected));
            });
          };
        });
        return;
      }
      let input = node.querySelector("[data-movecues-question-input]");
      if (!input) {
        input = question.type === "long_text" ? document.createElement("textarea") : document.createElement("input");
        input.dataset.movecuesQuestionInput = "";
        input.className = "movecues-survey-input";
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
      var _a;
      const final = this.stepIndex === this.survey.steps.length - 1;
      const step = this.survey.steps[this.stepIndex];
      const buttons = Array.from(surface.querySelectorAll("[data-movecues-survey-action]"));
      let back = buttons.find((button) => button.dataset.movecuesSurveyAction === "back");
      let next = buttons.find((button) => button.dataset.movecuesSurveyAction === "next");
      let submit = buttons.find((button) => button.dataset.movecuesSurveyAction === "submit");
      const holder = ((_a = buttons[0]) == null ? void 0 : _a.parentElement) ?? surface;
      const builderOwnsControls = Boolean(surface.querySelector("[data-movecues-survey-controls]"));
      if (builderOwnsControls) {
        if (back) {
          back.hidden = !this.survey.allowBack || this.stepIndex === 0;
          back.onclick = () => {
            if (this.stepIndex === 0) return;
            void this.callbacks.onProgress({ ...this.answers }, step.id);
            this.stepIndex--;
            this.renderStep();
          };
        }
        if (next) {
          const nextButton = next;
          nextButton.hidden = final;
          nextButton.onclick = async () => {
            if (!this.validateStep()) return;
            nextButton.disabled = true;
            try {
              await this.callbacks.onProgress({ ...this.answers }, step.id);
              this.stepIndex++;
              this.renderStep();
            } finally {
              if (nextButton.isConnected) nextButton.disabled = false;
            }
          };
        }
        if (submit) {
          const submitButton = submit;
          submitButton.hidden = !final;
          submitButton.textContent = this.survey.submitLabel;
          submitButton.onclick = async () => {
            if (this.submitting || !this.validateAll()) return;
            this.submitting = true;
            submitButton.disabled = true;
            try {
              await this.callbacks.onSubmit({ ...this.answers }, step.id);
            } finally {
              this.submitting = false;
              if (submitButton.isConnected) submitButton.disabled = false;
            }
          };
        }
        this.syncProgress(surface);
        return;
      }
      if (this.survey.allowBack && this.stepIndex > 0 && !back) {
        back = surveyButton("back", "Back");
        holder.prepend(back);
      }
      if (!final && !next) {
        next = submit ?? surveyButton("next", "Next →");
        next.dataset.movecuesSurveyAction = "next";
        holder.appendChild(next);
        submit = void 0;
      }
      if (final && !submit) {
        submit = next ?? surveyButton("submit", this.survey.submitLabel);
        submit.dataset.movecuesSurveyAction = "submit";
        holder.appendChild(submit);
        next = void 0;
      }
      if (back) {
        back.hidden = !this.survey.allowBack || this.stepIndex === 0;
        back.onclick = () => {
          if (this.stepIndex === 0) return;
          void this.callbacks.onProgress({ ...this.answers }, step.id);
          this.stepIndex--;
          this.renderStep();
        };
      }
      if (next) {
        next.hidden = final;
        next.onclick = async () => {
          if (!this.validateStep()) return;
          next.disabled = true;
          try {
            await this.callbacks.onProgress({ ...this.answers }, step.id);
            this.stepIndex++;
            this.renderStep();
          } finally {
            if (next.isConnected) next.disabled = false;
          }
        };
      }
      if (submit) {
        submit.hidden = !final;
        submit.textContent = this.survey.submitLabel;
        submit.onclick = async () => {
          if (this.submitting || !this.validateAll()) return;
          this.submitting = true;
          submit.disabled = true;
          try {
            await this.callbacks.onSubmit({ ...this.answers }, step.id);
          } finally {
            this.submitting = false;
            if (submit.isConnected) submit.disabled = false;
          }
        };
      }
      this.syncProgress(surface);
    }
    syncProgress(surface) {
      const progress = surface.querySelector("[data-movecues-survey-progress]");
      if (progress) progress.hidden = !this.survey.showProgress;
      const progressLabel = progress == null ? void 0 : progress.querySelector("span:not([data-movecues-survey-progress-bar])");
      if (progressLabel && !progressLabel.querySelector("[data-movecues-survey-progress-bar]")) progressLabel.textContent = `Step ${this.stepIndex + 1} of ${this.survey.steps.length}`;
      const bar = surface.querySelector("[data-movecues-survey-progress-bar]");
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
        const status = this.root.querySelector(".movecues-survey-validation");
        if (status) status.textContent = "Please go back and answer all required questions before submitting.";
      }
      return valid;
    }
    validateQuestions(questions, show = true) {
      const missing = questions.filter((question) => question.required && isEmpty(this.answers[question.id]));
      if (show && this.root) {
        missing.forEach((question) => {
          var _a;
          return (_a = this.root.querySelector(`[data-movecues-question-id="${cssEscape(question.id)}"]`)) == null ? void 0 : _a.classList.add("has-error");
        });
        const status = this.root.querySelector(".movecues-survey-validation");
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
    node.dataset.movecuesQuestionId = question.id;
    const label = document.createElement("p");
    label.className = "movecues-survey-question__label";
    label.textContent = `${question.label}${question.required ? " *" : ""}`;
    node.appendChild(label);
    return node;
  }
  function surveyButton(action, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `movecues-survey-button${action === "back" ? " movecues-survey-button--back" : ""}`;
    button.dataset.movecuesSurveyAction = action;
    button.textContent = label;
    return button;
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
  class ExperienceRenderer {
    constructor() {
      this.host = null;
      this.renderer = null;
      this.cancelPendingTarget = null;
      this.cleanupAdvance = null;
    }
    render(experience, callbacks, guideStepId) {
      this.destroy();
      if (isGuideDefinition(experience.definition)) return this.renderGuide(experience, experience.definition, callbacks, guideStepId);
      return this.renderWidget(experience, experience.definition, callbacks, guideStepId);
    }
    root(experienceId) {
      this.host = document.createElement("div");
      this.host.dataset.movecuesExperience = experienceId;
      this.host.dataset.movecuesExperienceRoot = experienceId;
      this.host.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:none";
      const root = this.host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLES;
      root.appendChild(style);
      document.documentElement.appendChild(this.host);
      return root;
    }
    renderWidget(experience, definition, callbacks, requestedStepId) {
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
      } else if (experience.widgetType === "survey" && definition.survey) {
        const root = this.root(experience.id);
        const renderer = new SurveyRenderer();
        this.renderer = renderer;
        renderer.render(root, definition.content, definition.design, definition.behavior, definition.survey, { onDismiss: () => callbacks.onDismiss(), onProgress: (answers, stepId) => {
          var _a;
          return (_a = callbacks.onSurveyProgress) == null ? void 0 : _a.call(callbacks, answers, stepId);
        }, onSubmit: (answers, stepId) => {
          var _a;
          return (_a = callbacks.onSurveySubmit) == null ? void 0 : _a.call(callbacks, answers, stepId);
        } }, requestedStepId);
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
    renderGuide(experience, definition, callbacks, guideStepId) {
      const stepIndex = guideStepId ? definition.steps.findIndex((item) => item.id === guideStepId) : 0;
      const step = definition.steps[stepIndex];
      if (!step) return false;
      const mount = (target2) => {
        var _a, _b, _c;
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
            var _a2, _b2;
            const action = step.content.primaryAction;
            if (action) callbacks.onAction(action);
            if ((((_a2 = step.advance) == null ? void 0 : _a2.type) ?? "button") === "button") (_b2 = callbacks.onGuideAdvance) == null ? void 0 : _b2.call(callbacks);
          }
        }, step.builder, "anchored_card");
        if (stepIndex > 0) {
          const back = document.createElement("button");
          back.className = "secondary";
          back.textContent = "Back";
          back.addEventListener("click", () => {
            var _a2;
            return (_a2 = callbacks.onGuideBack) == null ? void 0 : _a2.call(callbacks);
          });
          (_a = card.querySelector("footer")) == null ? void 0 : _a.prepend(back);
        }
        this.listenForAdvance(target2, ((_b = step.advance) == null ? void 0 : _b.type) ?? "button", ((_c = step.advance) == null ? void 0 : _c.type) === "element_hover" ? step.advance.durationMs : void 0, callbacks.onGuideAdvance);
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
      var _a, _b, _c, _d;
      (_a = this.cleanupAdvance) == null ? void 0 : _a.call(this);
      this.cleanupAdvance = null;
      (_b = this.cancelPendingTarget) == null ? void 0 : _b.call(this);
      this.cancelPendingTarget = null;
      (_c = this.renderer) == null ? void 0 : _c.destroy();
      this.renderer = null;
      (_d = this.host) == null ? void 0 : _d.remove();
      this.host = null;
    }
    destroy() {
      this.clearSurface();
    }
  }
  const STYLES = `
  :host{all:initial}.card{pointer-events:auto;position:fixed;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);padding:18px;background:var(--movecues-bg);color:var(--movecues-fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif;box-shadow:0 12px 38px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.12)}
  .card[data-width=sm]{width:260px}.card[data-width=lg]{width:400px}.card[data-radius=sm]{border-radius:6px}.card[data-radius=md]{border-radius:12px}.card[data-radius=lg]{border-radius:20px}
  .builder-card{padding:0;background:transparent;border:0;box-shadow:none}.builder-content{box-sizing:border-box;width:100%;max-width:100%;overflow:visible}.builder-card>.close{z-index:2}
  h2{font:600 17px/1.3 ui-sans-serif,system-ui,sans-serif;margin:0 24px 7px 0}p{margin:0;white-space:pre-wrap}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{border:0;border-radius:7px;padding:8px 12px;font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer}.primary{background:var(--movecues-primary);color:#fff}.secondary{background:transparent;color:inherit}.close{position:absolute;right:8px;top:7px;padding:3px 7px;background:transparent;color:inherit;font-size:20px}
  .toast{position:fixed!important}.toast[data-position=top-left]{top:16px;left:16px}.toast[data-position=top-right]{top:16px;right:16px}.toast[data-position=bottom-left]{bottom:16px;left:16px}.toast[data-position=bottom-right]{bottom:16px;right:16px}.cursor{will-change:left,top}@media(prefers-reduced-motion:reduce){.card{transition:none!important}}
  .backdrop{pointer-events:auto;position:fixed;inset:0;background:rgba(0,0,0,var(--movecues-backdrop-opacity,.45))}
  .modal{left:50%;top:50%;transform:translate(-50%,-50%)}.modal[data-layout=fullscreen],.modal[data-size-width=full]{inset:12px;width:auto!important;max-width:none!important;transform:none;display:flex;flex-direction:column;justify-content:center}.modal[data-layout=fullscreen] footer,.modal[data-size-width=full] footer{justify-content:center}
  .slideout[data-position=top-left]{top:16px;left:16px}.slideout[data-position=top-right]{top:16px;right:16px}.slideout[data-position=bottom-left]{bottom:16px;left:16px}.slideout[data-position=bottom-right]{bottom:16px;right:16px}.slideout[data-position=center-left]{left:16px;top:50%;transform:translateY(-50%)}.slideout[data-position=center-right]{right:16px;top:50%;transform:translateY(-50%)}
  .banner{left:0;right:0;width:auto!important;max-width:none;border-radius:0!important;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:center}.banner[data-position=top]{top:0}.banner[data-position=bottom]{bottom:0}.banner h2,.banner p{grid-column:1}.banner footer{grid-column:2;grid-row:1/span 2;margin:0;padding-right:24px}
  .hotspot{pointer-events:auto;position:fixed;width:18px;height:18px;padding:0;border:3px solid #fff;border-radius:50%;background:var(--movecues-hotspot);box-shadow:0 1px 5px rgba(0,0,0,.35);color:#fff;font:700 12px/12px ui-sans-serif,system-ui,sans-serif}.hotspot[data-style=pulse]::after{content:"";position:absolute;inset:-7px;border:2px solid var(--movecues-hotspot);border-radius:50%;animation:movecues-pulse 1.8s ease-out infinite}.hotspot[data-style=dot]{width:14px;height:14px}.hotspot[data-style=question]{width:22px;height:22px}@keyframes movecues-pulse{0%{transform:scale(.65);opacity:.85}100%{transform:scale(1.45);opacity:0}}@media(prefers-reduced-motion:reduce){.hotspot::after{animation:none}}
  .movecues-survey-question.has-error{outline:2px solid #fecaca;outline-offset:6px;border-radius:6px}.movecues-survey-validation{color:#b91c1c}.movecues-survey-option.is-selected{border-color:var(--movecues-primary)!important;background:color-mix(in srgb,var(--movecues-primary) 12%,white)!important}.movecues-survey-input{font:inherit}
`;
  const ONCE_KEY = "__movecues_experiences_seen__";
  const SESSION_KEY = "__movecues_experiences_session_seen__";
  const GUIDE_KEY = "__movecues_active_guide__";
  function read(storage, key) {
    try {
      return new Set(JSON.parse(storage.getItem(key) ?? "[]"));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  class ExperienceStateStore {
    hasEver(id) {
      return read(localStorage, ONCE_KEY).has(id);
    }
    hasInSession(id) {
      return read(sessionStorage, SESSION_KEY).has(id);
    }
    markSeen(id) {
      for (const [storage, key] of [[localStorage, ONCE_KEY], [sessionStorage, SESSION_KEY]]) {
        const values = read(storage, key);
        values.add(id);
        try {
          storage.setItem(key, JSON.stringify([...values]));
        } catch {
        }
      }
    }
    getGuideProgress() {
      try {
        const value = JSON.parse(sessionStorage.getItem(GUIDE_KEY) ?? "null");
        return value && typeof value.experienceId === "string" && typeof value.versionId === "string" && typeof value.currentStepId === "string" && (value.status === "active" || value.status === "paused") && (value.impressionId === void 0 || typeof value.impressionId === "string") ? value : null;
      } catch {
        return null;
      }
    }
    setGuideProgress(progress) {
      try {
        sessionStorage.setItem(GUIDE_KEY, JSON.stringify(progress));
      } catch {
      }
    }
    clearGuideProgress(experienceId) {
      var _a;
      try {
        if (!experienceId || ((_a = this.getGuideProgress()) == null ? void 0 : _a.experienceId) === experienceId) sessionStorage.removeItem(GUIDE_KEY);
      } catch {
      }
    }
  }
  class ExperienceLoader {
    constructor(apiBase, siteId, session, trackEvent) {
      this.apiBase = apiBase;
      this.siteId = siteId;
      this.session = session;
      this.trackEvent = trackEvent;
      this.renderer = new ExperienceRenderer();
      this.eligibility = new EligibilityEngine();
      this.state = new ExperienceStateStore();
      this.active = null;
      this.pausedGuide = null;
      this.queued = null;
      this.justFinishedId = null;
      this.destroyed = false;
    }
    async evaluate(trigger) {
      if (this.destroyed) return;
      try {
        const experiences = await this.fetchExperiences(trigger);
        if (this.destroyed) return;
        const candidates = [...experiences, ...this.queued ? [this.queued] : []].filter((item, index, all) => {
          var _a;
          return item.id !== ((_a = this.active) == null ? void 0 : _a.experience.id) && item.id !== this.justFinishedId && all.findIndex((candidate) => candidate.id === item.id) === index;
        });
        const chosen = this.eligibility.choose(candidates);
        this.justFinishedId = null;
        if (this.active) {
          const activeGuide = this.activeGuide();
          if (activeGuide && chosen && chosen.priority > activeGuide.experience.priority && chosen.interruptPolicy === "interrupt") {
            this.pauseGuide();
            this.show(chosen);
          } else if (chosen) this.queued = chosen;
          return;
        }
        if (this.pausedGuide) {
          if (chosen && chosen.id !== this.pausedGuide.experience.id && chosen.priority > this.pausedGuide.experience.priority && chosen.interruptPolicy === "interrupt") this.show(chosen);
          else this.resumeGuide();
          return;
        }
        if (!chosen) return;
        const stored = this.state.getGuideProgress();
        const stepId = isGuideDefinition(chosen.definition) && (stored == null ? void 0 : stored.experienceId) === chosen.id && stored.versionId === chosen.versionId ? stored.currentStepId : void 0;
        this.show(chosen, stepId, stepId ? stored ?? void 0 : void 0);
      } catch {
      }
    }
    onRouteChange() {
      if (this.destroyed) return;
      const activeGuide = this.activeGuide();
      if (activeGuide) {
        const advanced = this.advanceForRoute(activeGuide);
        if (!advanced) this.renderActiveGuide();
        else if (!this.active) return;
      } else if (this.active) {
        this.renderer.destroy();
        this.active = null;
      } else if (this.pausedGuide) this.advanceForRoute(this.pausedGuide);
      void this.evaluate();
    }
    onCustomEvent(name) {
      var _a;
      const activeGuide = this.activeGuide();
      if (activeGuide) {
        const step = this.currentGuideStep(activeGuide);
        if (((_a = step == null ? void 0 : step.advance) == null ? void 0 : _a.type) === "custom_event" && step.advance.eventName === name) {
          this.advanceGuide();
          return;
        }
      }
      void this.evaluate(name);
    }
    destroy() {
      this.destroyed = true;
      this.renderer.destroy();
      this.active = null;
      this.pausedGuide = null;
      this.queued = null;
    }
    async fetchExperiences(trigger) {
      const query = new URLSearchParams({ url: location.href, anonymousId: this.session.getAnonymousId(), sessionId: this.session.getSessionId() });
      const userId = this.session.getIdentifiedUserId();
      if (userId) query.set("trackedUserId", userId);
      if (trigger) query.set("trigger", trigger);
      const stored = this.state.getGuideProgress();
      if (stored) {
        query.set("activeGuideId", stored.experienceId);
        query.set("activeGuideVersionId", stored.versionId);
      }
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experiences?${query}`, { credentials: "omit" });
      if (!response.ok) return [];
      const manifest = await response.json();
      return Array.isArray(manifest.experiences) ? manifest.experiences : [];
    }
    show(experience, requestedStepId, progress) {
      var _a, _b;
      if (((_a = this.queued) == null ? void 0 : _a.id) === experience.id) this.queued = null;
      const definition = isGuideDefinition(experience.definition) ? experience.definition : null;
      const currentStepId = (definition == null ? void 0 : definition.steps.some((step) => step.id === requestedStepId)) ? requestedStepId : (_b = definition == null ? void 0 : definition.steps[0]) == null ? void 0 : _b.id;
      const impressionId = (progress == null ? void 0 : progress.impressionId) ?? experience.impressionId ?? null;
      const runtime2 = { experience, currentStepId, impressionId, shownRequested: Boolean(impressionId), shownPromise: null, surveyResponseId: null, surveyResponsePromise: null, surveyAnswers: {} };
      this.active = runtime2;
      if (currentStepId) this.persistGuide(runtime2, "active");
      const mounted = currentStepId ? progress && this.advanceForRoute(runtime2) ? true : (this.renderActiveGuide(), true) : this.renderer.render(experience, this.callbacks(runtime2), currentStepId);
      if (!mounted && this.active === runtime2) {
        this.active = null;
        if (currentStepId) this.state.clearGuideProgress(experience.id);
      }
    }
    callbacks(runtime2) {
      return {
        onVisible: () => this.shown(runtime2),
        onDismiss: () => void this.finish(runtime2, "dismissed"),
        onAction: (action) => this.handleAction(runtime2, action),
        onComplete: () => void this.finish(runtime2, "completed"),
        onGuideAdvance: () => this.advanceGuide(),
        onGuideBack: () => this.backGuide(),
        onUnavailable: () => {
          if (this.active !== runtime2) return;
          this.active = null;
          if (runtime2.currentStepId) {
            this.pausedGuide = runtime2;
            this.persistGuide(runtime2, "paused");
          }
        },
        onSurveyProgress: (answers, stepId) => this.persistSurvey(runtime2, answers, stepId),
        onSurveySubmit: async (answers, stepId) => {
          await this.persistSurvey(runtime2, answers, stepId, "submitted");
          await this.finish(runtime2, "completed", true);
        }
      };
    }
    shown(runtime2) {
      if (runtime2.shownRequested) return;
      runtime2.shownRequested = true;
      this.state.markSeen(runtime2.experience.id);
      runtime2.shownPromise = this.post(runtime2, "shown").then((result) => {
        runtime2.impressionId = (result == null ? void 0 : result.impressionId) ?? null;
        if (this.active === runtime2) this.persistGuide(runtime2, "active");
        else if (this.pausedGuide === runtime2) this.persistGuide(runtime2, "paused");
      });
      if (runtime2.experience.widgetType === "survey") void runtime2.shownPromise.then(() => this.ensureSurveyResponse(runtime2));
    }
    handleAction(runtime2, action) {
      var _a;
      void this.recordAction(runtime2, action.type);
      if (action.type === "open_url" && action.url) window.location.assign(action.url);
      if (action.type === "track_event" && action.eventName) (_a = this.trackEvent) == null ? void 0 : _a.call(this, action.eventName);
    }
    async recordAction(runtime2, action) {
      await runtime2.shownPromise;
      await this.post(runtime2, "action", action);
    }
    async finish(runtime2, event, surveyAlreadyPersisted = false) {
      if (this.active === runtime2) {
        this.renderer.destroy();
        this.active = null;
      }
      if (runtime2.currentStepId) this.state.clearGuideProgress(runtime2.experience.id);
      if (runtime2.experience.widgetType === "survey" && event === "dismissed" && !surveyAlreadyPersisted) await this.persistSurvey(runtime2, runtime2.surveyAnswers, null, "abandoned");
      await runtime2.shownPromise;
      await this.post(runtime2, event);
      this.justFinishedId = runtime2.experience.id;
      if (!this.destroyed) void this.evaluate();
    }
    advanceGuide() {
      const runtime2 = this.activeGuide();
      if (!runtime2) return;
      const definition = runtime2.experience.definition;
      const index = definition.steps.findIndex((step) => step.id === runtime2.currentStepId);
      if (index < 0) return;
      if (index === definition.steps.length - 1) {
        void this.finish(runtime2, "completed");
        return;
      }
      runtime2.currentStepId = definition.steps[index + 1].id;
      this.persistGuide(runtime2, "active");
      this.renderActiveGuide();
    }
    backGuide() {
      const runtime2 = this.activeGuide();
      if (!runtime2) return;
      const definition = runtime2.experience.definition;
      const index = definition.steps.findIndex((step) => step.id === runtime2.currentStepId);
      if (index <= 0) return;
      runtime2.currentStepId = definition.steps[index - 1].id;
      this.persistGuide(runtime2, "active");
      this.renderActiveGuide();
    }
    renderActiveGuide() {
      const runtime2 = this.activeGuide();
      if (!runtime2) return;
      this.renderer.destroy();
      if (!this.currentGuideStepMatchesPage(runtime2)) return;
      this.renderer.render(runtime2.experience, this.callbacks(runtime2), runtime2.currentStepId);
    }
    currentGuideStepMatchesPage(runtime2) {
      var _a, _b, _c;
      const pagePath = (_c = (_b = (_a = this.currentGuideStep(runtime2)) == null ? void 0 : _a.target) == null ? void 0 : _b.targetContext) == null ? void 0 : _c.pagePath;
      return !pagePath || pagePath === currentPagePath();
    }
    pauseGuide() {
      const runtime2 = this.activeGuide();
      if (!runtime2) return;
      this.renderer.destroy();
      this.active = null;
      this.pausedGuide = runtime2;
      this.persistGuide(runtime2, "paused");
    }
    resumeGuide() {
      const runtime2 = this.pausedGuide;
      if (!runtime2) return;
      this.pausedGuide = null;
      this.active = runtime2;
      this.persistGuide(runtime2, "active");
      this.renderActiveGuide();
    }
    advanceForRoute(runtime2) {
      var _a;
      const step = this.currentGuideStep(runtime2);
      if (((_a = step == null ? void 0 : step.advance) == null ? void 0 : _a.type) !== "route" || !matchesRules(currentPagePath(), step.advance.pageRules)) return false;
      if (runtime2 === this.active) this.advanceGuide();
      else {
        const definition = runtime2.experience.definition;
        const index = definition.steps.findIndex((item) => item.id === runtime2.currentStepId);
        if (index >= 0 && index < definition.steps.length - 1) {
          runtime2.currentStepId = definition.steps[index + 1].id;
          this.persistGuide(runtime2, "paused");
        }
      }
      return true;
    }
    currentGuideStep(runtime2) {
      if (!runtime2 || !isGuideDefinition(runtime2.experience.definition)) return void 0;
      return runtime2.experience.definition.steps.find((step) => step.id === runtime2.currentStepId);
    }
    activeGuide() {
      const runtime2 = this.active;
      return (runtime2 == null ? void 0 : runtime2.currentStepId) && isGuideDefinition(runtime2.experience.definition) ? runtime2 : null;
    }
    persistGuide(runtime2, status) {
      if (runtime2.currentStepId) this.state.setGuideProgress({ experienceId: runtime2.experience.id, versionId: runtime2.experience.versionId, currentStepId: runtime2.currentStepId, status, ...runtime2.impressionId ? { impressionId: runtime2.impressionId } : {} });
    }
    async post(runtime2, event, action) {
      const experience = runtime2.experience;
      try {
        const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experience-events`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify({ experienceId: experience.id, versionId: experience.versionId, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? void 0, sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), impressionId: runtime2.impressionId ?? void 0, event, action }) });
        return response.ok && response.status !== 204 ? await response.json() : null;
      } catch {
        return null;
      }
    }
    async ensureSurveyResponse(runtime2) {
      if (runtime2.surveyResponseId) return runtime2.surveyResponseId;
      if (runtime2.surveyResponsePromise) return runtime2.surveyResponsePromise;
      runtime2.surveyResponsePromise = (async () => {
        if (!runtime2.shownRequested) this.shown(runtime2);
        await runtime2.shownPromise;
        if (!runtime2.impressionId) return null;
        try {
          const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/survey-responses`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify(this.surveyIdentity(runtime2)) });
          if (!response.ok) return null;
          const body = await response.json();
          runtime2.surveyResponseId = body.responseId ?? null;
          return runtime2.surveyResponseId;
        } catch {
          return null;
        }
      })();
      const result = await runtime2.surveyResponsePromise;
      runtime2.surveyResponsePromise = null;
      return result;
    }
    async persistSurvey(runtime2, answers, currentStepId, state) {
      const responseId = await this.ensureSurveyResponse(runtime2);
      if (!responseId || !runtime2.impressionId) return;
      runtime2.surveyAnswers = { ...answers };
      try {
        await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/survey-responses/${encodeURIComponent(responseId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify({ ...this.surveyIdentity(runtime2), currentStepId, answers, ...state === "submitted" ? { submitted: true } : {}, ...state === "abandoned" ? { abandoned: true } : {} }) });
      } catch {
      }
    }
    surveyIdentity(runtime2) {
      return { experienceId: runtime2.experience.id, versionId: runtime2.experience.versionId, impressionId: runtime2.impressionId, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? void 0, sessionId: this.session.getSessionId() };
    }
  }
  function currentPagePath() {
    return `${location.pathname}${location.search}${location.hash}`;
  }
  function matchesRules(pagePath, rules) {
    const matches = (rule) => {
      if (rule.operator === "equals") return pagePath === rule.value;
      if (rule.operator === "starts_with") return pagePath.startsWith(rule.value);
      if (rule.operator === "ends_with") return pagePath.endsWith(rule.value);
      if (rule.operator === "contains") return pagePath.includes(rule.value);
      const escaped = rule.value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(pagePath);
    };
    const includes = rules.filter((rule) => rule.kind === "include");
    return includes.length > 0 && !rules.some((rule) => rule.kind === "exclude" && matches(rule)) && includes.some(matches);
  }
  const runtime = {
    createLoader: (apiBase, siteId, session, trackEvent) => new ExperienceLoader(apiBase, siteId, session, trackEvent)
  };
  window.__movcuesExperienceRuntime__ = runtime;
})();
//# sourceMappingURL=sdk-experiences.js.map
