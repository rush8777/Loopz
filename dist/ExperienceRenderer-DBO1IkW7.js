function isGuideDefinition(value) {
  return "steps" in value;
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
function buildCard(root, content, design, behavior, callbacks) {
  var _a, _b, _c;
  const card = document.createElement("section");
  card.className = "card";
  card.style.setProperty("--loopz-bg", design.theme.background);
  card.style.setProperty("--loopz-fg", design.theme.foreground);
  card.style.setProperty("--loopz-primary", design.theme.primary);
  card.dataset.width = design.width;
  card.dataset.radius = design.theme.borderRadius;
  const close = behavior.dismissible ? `<button class="close" data-dismiss aria-label="Dismiss">×</button>` : "";
  const primary = content.primaryAction ? `<button class="primary" data-primary>${escapeText(content.primaryAction.label)}</button>` : "";
  const secondary = content.secondaryAction ? `<button class="secondary" data-secondary>${escapeText(content.secondaryAction.label)}</button>` : "";
  card.innerHTML = `${close}<h2>${escapeText(content.heading)}</h2><p>${escapeText(content.body)}</p><footer>${secondary}${primary}</footer>`;
  (_a = card.querySelector("[data-dismiss]")) == null ? void 0 : _a.addEventListener("click", callbacks.onDismiss);
  (_b = card.querySelector("[data-primary]")) == null ? void 0 : _b.addEventListener("click", callbacks.onPrimary);
  (_c = card.querySelector("[data-secondary]")) == null ? void 0 : _c.addEventListener("click", callbacks.onSecondary);
  root.appendChild(card);
  return card;
}
class AnchoredCardRenderer {
  constructor() {
    this.cleanup = [];
  }
  render(root, target, content, design, behavior, callbacks) {
    const card = buildCard(root, content, design, behavior, callbacks);
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
function escapeText(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}
class ToastRenderer {
  constructor() {
    this.timer = null;
  }
  render(root, content, design, behavior, callbacks) {
    const card = buildCard(root, content, design, behavior, callbacks);
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
  render(root, content, design, behavior, callbacks) {
    const card = buildCard(root, content, design, behavior, callbacks);
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
class ExperienceRenderer {
  constructor() {
    this.host = null;
    this.renderer = null;
    this.step = 0;
  }
  render(experience, callbacks) {
    this.destroy();
    this.step = 0;
    if (isGuideDefinition(experience.definition)) return this.renderGuide(experience, experience.definition, callbacks);
    return this.renderWidget(experience, experience.definition, callbacks);
  }
  root() {
    this.host = document.createElement("div");
    this.host.dataset.loopzExperience = "";
    this.host.style.cssText = "position:fixed;inset:0;z-index:2147483000;pointer-events:none";
    const root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);
    document.documentElement.appendChild(this.host);
    return root;
  }
  renderWidget(experience, definition, callbacks) {
    if (experience.widgetType === "anchored_card") {
      const target = findTarget(definition.target);
      if (!target) return false;
      const root = this.root();
      const renderer = new AnchoredCardRenderer();
      this.renderer = renderer;
      renderer.render(root, target, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else if (experience.widgetType === "toast") {
      const root = this.root();
      const renderer = new ToastRenderer();
      this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else if (experience.widgetType === "cursor_follow") {
      const root = this.root();
      const renderer = new CursorFollowRenderer();
      this.renderer = renderer;
      renderer.render(root, definition.content, definition.design, definition.behavior, this.callbacks(definition.content, callbacks));
    } else return false;
    requestAnimationFrame(callbacks.onVisible);
    return true;
  }
  renderGuide(experience, definition, callbacks) {
    var _a;
    const step = definition.steps[this.step];
    const target = findTarget(step == null ? void 0 : step.target);
    if (!step || !target) return false;
    const root = this.root();
    const renderer = new AnchoredCardRenderer();
    this.renderer = renderer;
    const behavior = { dismissible: step.behavior.dismissible ?? true, placement: step.behavior.placement, alignment: step.behavior.alignment, offset: step.behavior.offset };
    const card = renderer.render(root, target, step.content, definition.design, behavior, {
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
    var _a, _b;
    (_a = this.renderer) == null ? void 0 : _a.destroy();
    this.renderer = null;
    (_b = this.host) == null ? void 0 : _b.remove();
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
  h2{font:600 17px/1.3 ui-sans-serif,system-ui,sans-serif;margin:0 24px 7px 0}p{margin:0;white-space:pre-wrap}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{border:0;border-radius:7px;padding:8px 12px;font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer}.primary{background:var(--loopz-primary);color:#fff}.secondary{background:transparent;color:inherit}.close{position:absolute;right:8px;top:7px;padding:3px 7px;background:transparent;color:inherit;font-size:20px}
  .toast{position:fixed!important}.toast[data-position=top-left]{top:16px;left:16px}.toast[data-position=top-right]{top:16px;right:16px}.toast[data-position=bottom-left]{bottom:16px;left:16px}.toast[data-position=bottom-right]{bottom:16px;right:16px}.cursor{will-change:left,top}@media(prefers-reduced-motion:reduce){.card{transition:none!important}}
`;
export {
  ExperienceRenderer as E,
  isGuideDefinition as i
};
//# sourceMappingURL=ExperienceRenderer-DBO1IkW7.js.map
