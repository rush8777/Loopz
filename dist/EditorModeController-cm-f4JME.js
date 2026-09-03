import { E as ExperienceRenderer, i as isGuideDefinition } from "./ExperienceRenderer-BmIv5ih_.js";
import { S as SelectorGenerator } from "./module-BMniKAbn.js";
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
      const clean = new URL(location.href);
      const requestedStep = Number(clean.searchParams.get("loopz_editor_step") ?? "0");
      clean.searchParams.delete("loopz_editor_token");
      clean.searchParams.delete("loopz_editor_step");
      history.replaceState(history.state, "", clean.toString());
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
    var _a, _b;
    this.host = document.createElement("div");
    this.host.dataset.loopzEditor = "";
    const root = this.host.attachShadow({ mode: "open" });
    const definition = draft.version.definition;
    const guide = isGuideDefinition(definition) ? definition : null;
    let stepIndex = guide ? Math.max(0, Math.min(requestedStep, guide.steps.length - 1)) : 0;
    const stepTabs = guide ? `<div class="steps"><b data-step-label>Editing step 1 of ${guide.steps.length}</b><div>${guide.steps.map((_, index) => `<button data-step="${index}" class="${index === 0 ? "active" : ""}">Step ${index + 1}</button>`).join("")}</div></div>` : "";
    root.innerHTML = `<style>${STYLE}</style><aside><header><b>Loopz visual editor</b><small>${escapeText(draft.experience.name)}</small></header><nav>${["Content", "Design", "Behavior", "Targeting", "Publish"].map((x, i) => `<button data-tab="${i}" class="${i === 0 ? "active" : ""}">${x}</button>`).join("")}</nav><main>${stepTabs}<section data-panel="0"><label>Heading<input data-heading></label><label>Body<textarea data-body></textarea></label></section><section data-panel="1" hidden><label>Width<select data-width><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label><label>Background<input data-background type="color"></label><label>Text color<input data-foreground type="color"></label><label>Primary color<input data-primary type="color"></label></section><section data-panel="2" hidden><label>Placement<select data-placement><option value="auto">Auto</option><option value="top">Top</option><option value="right">Right</option><option value="bottom">Bottom</option><option value="left">Left</option></select></label><label>Offset<input data-offset type="number" min="0" max="100"></label><label class="row"><input data-dismissible type="checkbox"> Dismissible</label><button data-pick>Reselect target</button><p data-reliability></p></section><section data-panel="3" hidden><label>Frequency<select data-frequency><option value="once">Once ever</option><option value="once_per_session">Once per session</option><option value="every_time">Every qualifying time</option></select></label><label>Priority<input data-priority type="number" min="-1000" max="1000"></label><p>Saved Page, Segment, and event targeting are configured securely in the Loopz dashboard.</p></section><section data-panel="4" hidden><p>Preview is live on this page. Save the draft here, then return to Loopz to publish or pause it.</p><button data-save>Save draft</button></section><p data-status>Draft autosaves as you edit.</p></main></aside>`;
    document.documentElement.appendChild(this.host);
    const currentContent = () => guide ? guide.steps[stepIndex].content : definition.content;
    const currentBehavior = () => guide ? guide.steps[stepIndex].behavior : definition.behavior;
    const heading = root.querySelector("[data-heading]");
    const body = root.querySelector("[data-body]");
    const placement = root.querySelector("[data-placement]");
    const offset = root.querySelector("[data-offset]");
    const dismissible = root.querySelector("[data-dismissible]");
    const status = root.querySelector("[data-status]");
    const syncStep = () => {
      var _a2;
      const content = currentContent(), behavior = currentBehavior();
      heading.value = content.heading;
      body.value = content.body;
      placement.value = behavior.placement ?? "auto";
      offset.value = String(behavior.offset ?? 8);
      dismissible.checked = behavior.dismissible ?? true;
      (_a2 = root.querySelector("[data-step-label]")) == null ? void 0 : _a2.replaceChildren(`Editing step ${stepIndex + 1} of ${(guide == null ? void 0 : guide.steps.length) ?? 1}`);
      root.querySelectorAll("[data-step]").forEach((button) => button.classList.toggle("active", Number(button.dataset.step) === stepIndex));
    };
    let saveTimer = 0;
    const renderPreview = () => this.preview.render({ id: draft.experience.id, versionId: draft.version.id, kind: draft.experience.kind, widgetType: draft.experience.widgetType, priority: 0, definition }, { onVisible: () => void 0, onDismiss: () => window.setTimeout(renderPreview, 0), onAction: () => void 0, onComplete: () => window.setTimeout(renderPreview, 0) });
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
    (_a = root.querySelector("[data-pick]")) == null ? void 0 : _a.addEventListener("click", async () => {
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
    (_b = root.querySelector("[data-save]")) == null ? void 0 : _b.addEventListener("click", () => void persist());
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
export {
  EditorModeController
};
//# sourceMappingURL=EditorModeController-cm-f4JME.js.map
