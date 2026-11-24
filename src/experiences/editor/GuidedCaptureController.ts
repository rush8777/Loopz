import { RouteObserver } from "../../dom/RouteObserver";
import type { EditorSession } from "../runtimeInterfaces";
import { ExperienceRenderer } from "../runtime/ExperienceRenderer";
import type { EditorDraft } from "../types";
import { CaptureRequestError, EditorSessionExpiredError } from "./EditorBridge";
import { captureHtml, guideCapturePanel } from "./GuideCapturePanel";
import { GuideCaptureJourney, type NewCaptureObservation } from "./GuideCaptureJourney";
import { GuideCaptureSelection } from "./GuideCaptureSelection";
import { describeCaptureTarget, guideCapturePath } from "./GuideCaptureTargets";
import type { CaptureAdvance, CaptureBridge, CapturePlan, CapturePlanStep, CapturePreview, GuideCaptureCheckpoint, StoredGuideCapture } from "./GuideCaptureTypes";

interface LocalCheckpoint {
  checkpoint: GuideCaptureCheckpoint;
  baseRevision: number;
  pending: boolean;
  sending?: GuideCaptureCheckpoint;
  prompt: string;
  navigationPath?: string | null;
}

const advanceLabels: Record<CaptureAdvance["type"], string> = {
  unconfigured: "Choose how to advance",
  button: "Guide button",
  element_click: "Website element click",
  element_hover: "Website element hover",
  route: "Observed route change",
  custom_event: "Confirmed application event",
};

export class GuidedCaptureController {
  private readonly host = document.createElement("div");
  private readonly root = this.host.attachShadow({ mode: "open" });
  private readonly route = new RouteObserver();
  private readonly preview = new ExperienceRenderer();
  private readonly key: string;
  private readonly previousKey: string;
  private readonly journey = new GuideCaptureJourney(() => this.checkpoint.targets, observation => this.recordObservation(observation));
  private navigationPath: string | null | undefined;
  private saveTimer = 0;
  private ticketRevision = -1;
  private selection: GuideCaptureSelection | undefined;
  private unsubscribe: (() => void) | undefined;
  private checkpoint: GuideCaptureCheckpoint = { mode: "select", targets: [] };
  private revision: number;
  private checkpointRevision = 0;
  private replacement: string | undefined;
  private prompt = "";
  private inFlight: Promise<boolean> | undefined;
  private pending = false;
  private sending: GuideCaptureCheckpoint | undefined;
  private localSaved = false;
  private checkpointError = false;
  private plan: CapturePlan | undefined;
  private candidate: CapturePreview | undefined;
  private index = 0;
  private request: AbortController | undefined;
  private state: "loading" | "capture" | "plan" | "preview" | "expired" = "loading";
  private busy = false;
  private destroyed = false;

  constructor(
    private readonly bridge: CaptureBridge,
    session: EditorSession,
    private readonly draft: EditorDraft,
    private readonly applied: (version: EditorDraft["version"]) => void,
    private readonly closed: () => void,
  ) {
    this.previousKey = `movcues:guide-capture:${draft.experience.id}:${session.sessionId}`;
    this.key = `movcues:guide-capture:${draft.experience.id}`;
    this.revision = draft.version.revision;
  }

  mount(): void {
    this.host.dataset.movcuesEditor = "";
    this.host.dataset.movcuesGuideCapture = "";
    this.host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    this.root.innerHTML = guideCapturePanel;
    document.documentElement.append(this.host);
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("input", this.handleInput);
    this.root.addEventListener("change", this.handleChange);
    this.root.querySelector("form")?.addEventListener("submit", event => { event.preventDefault(); void this.planGuide(); });
    this.selection = new GuideCaptureSelection(element => this.select(element));
    this.unsubscribe = this.route.onChange(() => {
      this.journey.routeChanged();
      this.selection?.refresh();
      if (this.state === "preview") this.renderPreview();
      this.writeLocal();
    });
    window.addEventListener("pagehide", this.flushCheckpoint);
    this.route.start();
    void this.restore();
  }

  expire(): void {
    if (this.state === "expired") return;
    this.request?.abort();
    this.journey.stop();
    clearTimeout(this.saveTimer);
    this.selection?.destroy();
    this.selection = undefined;
    this.preview.destroy();
    this.unsubscribe?.();
    this.route.stop();
    this.state = "expired";
    this.busy = false;
    this.message("This editor session expired. Resume Guided Capture from the dashboard to continue with your saved selections.");
    this.update();
  }

  destroy(): void {
    window.removeEventListener("pagehide", this.flushCheckpoint);
    this.journey.stop();
    clearTimeout(this.saveTimer);
    this.destroyed = true;
    this.request?.abort();
    this.selection?.destroy();
    this.preview.destroy();
    this.unsubscribe?.();
    this.route.stop();
    this.host.remove();
  }

  private async restore(discardLocal = false): Promise<void> {
    this.toggle("[data-reload]", false);
    this.journey.stop();
    this.preview.destroy();
    this.candidate = undefined;
    this.message("Restoring capture…");
    const local = discardLocal ? null : this.readLocal();
    try {
      const remote = await this.bridge.loadCapture();
      if (this.destroyed || this.state === "expired") return;
      this.adopt(remote);
      this.state = "capture";
      this.navigationPath = local?.navigationPath;
      if (local?.pending && !sameCheckpoint(local.checkpoint, this.checkpoint)) {
        if (local.baseRevision === remote.checkpointRevision || (local.sending && sameCheckpoint(local.sending, this.checkpoint))) {
          this.checkpoint = local.checkpoint;
          this.pending = true;
          void this.syncCheckpoint();
        } else {
          this.checkpoint = local.checkpoint;
          this.pending = true;
          this.checkpointError = true;
          this.message("A newer checkpoint is available. Load it to continue, or keep this tab open to review your local selections.");
        }
      }
      const workflow = this.checkpoint.workflow;
      this.prompt = workflow?.prompt ?? local?.prompt ?? "";
      const field = this.root.querySelector<HTMLTextAreaElement>("[data-prompt]");
      if (field) field.value = this.prompt;
      this.plan = workflow?.plan ? structuredClone(workflow.plan) : undefined;
      if (this.plan && workflow?.stage !== "capture") {
        this.state = "plan";
        this.renderPlan();
      }
      if (!this.checkpointError) this.message("");
      this.renderTargets();
      this.update();
      this.writeLocal();
      if (this.plan && workflow?.draftRevision !== this.revision) {
        this.message("The guide draft changed. Review your restored plan before generating a fresh preview.");
      } else if (workflow?.stage === "preview" && !this.checkpointError && !this.busy) {
        await this.compile(workflow.previewStepId);
      }
    } catch (error) {
      if (this.destroyed) return;
      this.report(error);
      if (this.state !== "expired") this.toggle("[data-reload]", true);
    }
  }

  private adopt(remote: StoredGuideCapture): void {
    this.checkpoint = { mode: remote.mode, targets: remote.targets, observations: remote.observations, workflow: remote.workflow };
    this.revision = remote.revision;
    this.checkpointRevision = remote.checkpointRevision;
    this.pending = false;
    this.checkpointError = false;
    this.sending = undefined;
  }

  private readLocal(): LocalCheckpoint | null {
    try {
      const item = JSON.parse(sessionStorage.getItem(this.key) ?? sessionStorage.getItem(this.previousKey) ?? "null") as LocalCheckpoint | null;
      if (item && typeof item.prompt === "string" && Number.isInteger(item.baseRevision) && Array.isArray(item.checkpoint?.targets)) return item;
    } catch { /* A server checkpoint is also available. */ }
    return null;
  }

  private writeLocal(): void {
    try {
      const local: LocalCheckpoint = { checkpoint: this.checkpoint, baseRevision: this.checkpointRevision, pending: this.pending, sending: this.sending, prompt: this.prompt,
        navigationPath: this.state === "capture" && this.checkpoint.mode === "navigate" ? guideCapturePath() : undefined };
      sessionStorage.setItem(this.key, JSON.stringify(local));
      this.localSaved = true;
    } catch { this.localSaved = false; }
  }

  private flushCheckpoint = () => { if (this.state !== "loading") this.writeLocal(); void this.syncCheckpoint(); };

  private recordObservation(observation: NewCaptureObservation): number {
    const history = this.checkpoint.observations ?? [];
    const sequence = (history[history.length - 1]?.sequence ?? 0) + 1;
    this.checkpoint = { ...this.checkpoint, observations: [...history.slice(-31), { ...observation, sequence }] };
    this.queueCheckpoint();
    return sequence;
  }

  private workflowChanged(): void {
    if (this.state === "expired" || this.state === "loading") return;
    this.checkpoint = { ...this.checkpoint, workflow: {
      stage: this.state, prompt: this.prompt, draftRevision: this.revision, plan: this.plan ? structuredClone(this.plan) : undefined,
      previewStepId: this.state === "preview" ? this.candidate?.definition.steps[this.index]?.id : undefined,
    } };
    this.queueCheckpoint();
  }

  private queueCheckpoint(): void {
    this.pending = true;
    this.writeLocal();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.syncCheckpoint(), 200);
  }

  private checkpointChanged(checkpoint: GuideCaptureCheckpoint): void {
    this.checkpoint = checkpoint;
    this.pending = true;
    this.writeLocal();
    this.renderTargets();
    this.update();
    void this.syncCheckpoint();
  }

  private async syncCheckpoint(): Promise<boolean> {
    clearTimeout(this.saveTimer);
    if (this.checkpointError || this.destroyed || this.state === "expired") return false;
    if (this.inFlight) {
      const saved = await this.inFlight;
      return saved && (this.pending ? this.syncCheckpoint() : true);
    }
    if (!this.pending) return true;
    const snapshot = this.checkpoint;
    this.sending = snapshot;
    this.writeLocal();
    const operation = this.bridge.saveCapture(snapshot, this.checkpointRevision).then(remote => {
      this.checkpointRevision = remote.checkpointRevision;
      this.pending = snapshot !== this.checkpoint;
      this.sending = undefined;
      this.writeLocal();
      return true;
    }).catch(error => {
      if (!this.destroyed) {
        this.checkpointError = true;
        this.report(error);
      }
      return false;
    });
    this.inFlight = operation;
    this.update();
    const saved = await operation;
    this.inFlight = undefined;
    if (!this.destroyed) this.update();
    return saved && (this.pending ? this.syncCheckpoint() : true);
  }

  private async retryCheckpoint(): Promise<void> {
    try {
      const remote = await this.bridge.loadCapture();
      if (this.destroyed || this.state === "expired") return;
      if (sameCheckpoint(remote, this.checkpoint)) {
        this.adopt(remote);
        this.writeLocal();
      } else if (remote.checkpointRevision === this.checkpointRevision || (this.sending && sameCheckpoint(this.sending, remote))) {
        this.revision = remote.revision;
        this.checkpointRevision = remote.checkpointRevision;
        this.checkpointError = false;
        await this.syncCheckpoint();
      } else {
        this.message("A newer checkpoint exists. Load it before making further changes.");
        return;
      }
      if (!this.checkpointError && this.state === "capture") this.message("");
      this.update();
    } catch (error) { this.report(error); }
  }

  private select(element: Element): void {
    const path = guideCapturePath();
    if (!path) { this.message("This URL contains a route that Guided Capture cannot store safely. Choose another page."); return; }
    const selected = this.checkpoint.targets;
    if (selected.length >= 20 && !this.replacement) { this.message("You can capture up to 20 elements. Remove an element to continue."); return; }
    try {
      const id = this.replacement ?? "c-" + Array.from(crypto.getRandomValues(new Uint32Array(3)), part => part.toString(36)).join("-");
      const target = describeCaptureTarget(element, id, path);
      if (selected.some(item => item.id !== id && item.target.targetContext.pagePath === path && item.target.primarySelector === target.target.primarySelector)) {
        this.message("This element is already in your capture."); return;
      }
      const targets = this.replacement ? selected.map(item => item.id === id ? target : item) : [...selected, target];
      this.replacement = undefined;
      this.message("");
      this.checkpointChanged({ ...this.checkpoint, targets });
      this.recordObservation({ type: "target", path, targetId: id });
    } catch (error) { this.report(error); }
  }

  private moveTarget(id: string, offset: number): void {
    const list = [...this.checkpoint.targets];
    const from = list.findIndex(item => item.id === id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    this.checkpointChanged({ ...this.checkpoint, targets: list });
    this.root.querySelector<HTMLButtonElement>(`[data-${offset < 0 ? "earlier" : "later"}="${id}"]:not(:disabled)`)?.focus();
  }

  private renderTargets(): void {
    const { targets } = this.checkpoint;
    const list = this.root.querySelector("[data-targets]");
    if (!list) return;
    list.innerHTML = targets.length ? targets.map(({ id, target }, index) => {
      const name = captureHtml(target.label ?? target.role ?? target.tagName);
      const warning = target.reliability !== "reliable";
      return `<li><div class="list-head"><span class="number">${index + 1}</span><strong>${name}</strong></div>
        <small>${captureHtml(target.targetContext.pagePath)}</small>
        <small class="${warning ? "warning" : ""}">${target.reliability === "fragile" ? "Fragile selector · page layout changes may break this target" : target.reliability === "moderate" ? "Moderate reliability · verify after layout changes" : "Reliable selector"}</small>
        <div class="row">
          <button type="button" data-earlier="${id}" aria-label="Move element ${index + 1} earlier" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-later="${id}" aria-label="Move element ${index + 1} later" ${index === targets.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" data-replace="${id}" aria-label="Replace element ${index + 1}">Replace</button>
          <button type="button" data-remove="${id}" aria-label="Remove element ${index + 1}">Remove</button>
        </div></li>`;
    }).join("") : '<li class="muted">Select the first element in the workflow.</li>';
  }

  private handleClick = (event: Event) => {
    const button = (event.target as Element).closest("button");
    if (!button) return;
    const action = button.dataset;
    if ("close" in action) { if (!this.busy || this.request) { this.flushCheckpoint(); this.closed(); } return; }
    if ("collapse" in action) {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      button.textContent = expanded ? "Expand" : "Minimize";
      this.toggle("main", !expanded);
      return;
    }
    if ("cancel" in action) { this.request?.abort(); return; }
    if (this.busy) return;
    if ("reload" in action) { void this.restore(); return; }
    if ("refresh" in action) { this.plan = undefined; this.candidate = undefined; void this.restore(true); return; }
    if ("retry" in action) { void this.retryCheckpoint(); return; }
    if (action.mode === "select" || action.mode === "navigate") {
      if (action.mode === this.checkpoint.mode) return;
      if (action.mode === "navigate") this.replacement = undefined;
      this.checkpointChanged({ ...this.checkpoint, mode: action.mode });
    }
    if (action.earlier) this.moveTarget(action.earlier, -1);
    if (action.later) this.moveTarget(action.later, 1);
    if (action.remove) {
      if (this.replacement === action.remove) this.replacement = undefined;
      this.checkpointChanged({ ...this.checkpoint, targets: this.checkpoint.targets.filter(item => item.id !== action.remove) });
    }
    if (action.replace) {
      this.replacement = action.replace;
      this.checkpointChanged({ ...this.checkpoint, mode: "select" });
      this.message("Select the replacement element on this page.");
    }
    if ("compile" in action) void this.compile();
    if ("editCapture" in action) { this.state = "capture"; this.plan = undefined; this.message(""); this.workflowChanged(); this.update(); }
    if ("editPlan" in action) { this.state = "plan"; this.candidate = undefined; this.preview.destroy(); this.message(""); this.workflowChanged(); this.update(); }
    if ("previous" in action) this.previewStep(-1);
    if ("next" in action) this.previewStep(1);
    if ("apply" in action) void this.apply();
  };

  private handleInput = (event: Event) => {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement;
    const { prompt, heading, body, eventName, delay, timeout, hoverDuration } = input.dataset;
    if (prompt !== undefined) { this.prompt = input.value; this.workflowChanged(); return; }
    const row = input.closest<HTMLElement>("[data-plan-step]");
    const step = row && this.plan?.steps[Number(row.dataset.planStep)];
    if (!step) return;
    if (heading !== undefined) step.heading = input.value;
    if (body !== undefined) step.body = input.value;
    if (eventName !== undefined && step.advance.type === "custom_event") step.advance.eventName = input.value;
    if (input instanceof HTMLInputElement) {
      if (delay !== undefined) step.delayMs = input.valueAsNumber;
      if (timeout !== undefined && step.missingTarget) step.missingTarget.timeoutMs = input.valueAsNumber;
      if (hoverDuration !== undefined && step.advance.type === "element_hover") step.advance.durationMs = input.valueAsNumber;
    }
    this.workflowChanged();
  };

  private handleChange = (event: Event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const row = select.closest<HTMLElement>("[data-plan-step]");
    const index = row ? Number(row.dataset.planStep) : -1;
    const step = this.plan?.steps[index];
    if (!step) return;
    const type = select.value as CaptureAdvance["type"];
    if ("advance" in select.dataset) {
      const firstOther = this.checkpoint.targets.find(item => item.target.targetContext.pagePath !== this.pathFor(step.targetId));
      step.advance = type === "route" ? { type, targetId: firstOther?.id ?? "" }
        : type === "custom_event" ? { type, eventName: "" }
        : type === "element_hover" ? { type, durationMs: 500 }
        : type === "element_click" ? { type } : { type: "button" };
    }
    if ("routeTarget" in select.dataset && step.advance.type === "route") step.advance.targetId = select.value;
    if ("missing" in select.dataset) {
      const action = select.value;
      step.missingTarget = action === "wait" || action === "skip" || action === "dismiss" ? { action, timeoutMs: step.missingTarget?.timeoutMs ?? 5000 } : null;
    }
    this.workflowChanged();
    this.renderPlan();
    this.root.querySelector<HTMLSelectElement>(`[data-plan-step="${index}"] [data-${Object.keys(select.dataset)[0].replace(/[A-Z]/g, letter => "-" + letter.toLowerCase())}]`)?.focus();
  };

  private async planGuide(): Promise<void> {
    if (this.busy || this.state !== "capture" || !this.checkpoint.targets.length || !this.prompt.trim()) return;
    await this.run("Geo is planning your guide…", async signal => {
      if (!await this.syncCheckpoint() || signal.aborted) return;
      const { plan } = await this.bridge.planCapture({ ...this.revisions(), prompt: this.prompt.trim() }, signal);
      if (signal.aborted || this.destroyed) return;
      this.plan = plan;
      this.state = "plan";
      this.workflowChanged();
      this.renderPlan();
      this.message("");
    });
  }

  private revisions() { return { revision: this.revision, checkpointRevision: this.checkpointRevision }; }

  private renderPlan(): void {
    const container = this.root.querySelector("[data-plan-steps]");
    if (!container || !this.plan) return;
    container.innerHTML = this.plan.steps.map((step, index) => {
      const target = this.checkpoint.targets.find(target => target.id === step.targetId);
      const name = target ? `Anchored tooltip · ${target.target.label ?? target.target.tagName} · ${target.target.targetContext.pagePath}` : "Modal";
      const advance = step.advance;
      const types: CaptureAdvance["type"][] = ["button", "route", "custom_event"];
      if (step.pattern === "anchored_card" && index < this.plan!.steps.length - 1) types.splice(1, 0, "element_click", "element_hover");
      if (advance.type === "unconfigured") types.unshift("unconfigured");
      return `<fieldset data-plan-step="${index}"><legend>${index + 1}. ${captureHtml(name)}</legend>
        <small>${captureHtml(step.purpose)}</small>
        <label>Heading <input maxlength="140" data-heading value="${captureHtml(step.heading)}"></label>
        <label>Description <textarea maxlength="500" rows="2" data-body>${captureHtml(step.body)}</textarea></label>
        ${advance.type === "unconfigured" ? `<small class="warning">${captureHtml(advance.reason)}</small>` : ""}
        <label>Advance when <select data-advance>${types.map(type => `<option value="${type}" ${advance.type === type ? "selected" : ""}>${advanceLabels[type]}</option>`).join("")}</select></label>
        ${advance.type === "route" ? this.routeOptions(step, advance.targetId) : ""}
        ${advance.type === "custom_event" ? `<label>Verified event name <input maxlength="200" data-event-name value="${captureHtml(advance.eventName)}"></label>` : ""}
        ${advance.type === "element_hover" ? `<label>Hover duration (ms) <input type="number" min="100" max="60000" data-hover-duration value="${advance.durationMs ?? 500}"></label>` : ""}
        <label>Delay (ms) <input type="number" min="0" max="30000" data-delay value="${step.delayMs}"></label>
        ${step.pattern === "anchored_card" ? this.missingTargetOptions(step) : ""}
        </fieldset>`;
    }).join("");
  }

  private routeOptions(step: CapturePlanStep, targetId: string): string {
    const routes = this.checkpoint.targets.filter(target => target.target.targetContext.pagePath !== this.pathFor(step.targetId));
    const options = routes.map(({ id, target }) => `<option value="${id}" ${id === targetId ? "selected" : ""}>${captureHtml(target.targetContext.pagePath)}</option>`);
    return `<label>Destination <select data-route-target><option value="">Choose a captured page</option>${options.join("")}</select></label>`;
  }

  private missingTargetOptions(step: CapturePlanStep): string {
    const options = ["", "wait", "skip", "dismiss"].map(action => `<option value="${action}" ${action === (step.missingTarget?.action ?? "") ? "selected" : ""}>${action || "Use default"}</option>`);
    return `<label>If the element is missing <select data-missing>${options.join("")}</select></label>
      ${step.missingTarget ? `<label>Target timeout (ms) <input type="number" min="100" max="60000" data-timeout value="${step.missingTarget.timeoutMs}"></label>` : ""}`;
  }

  private pathFor(id: string | null): string | undefined {
    return this.checkpoint.targets.find(item => item.id === id)?.target.targetContext.pagePath;
  }

  private async compile(restoredStepId?: string): Promise<void> {
    const plan = this.plan;
    if (!plan || this.busy) return;
    if (plan.steps.some(step => step.advance.type === "unconfigured")) { this.message("Choose how to advance each step marked for configuration."); return; }
    await this.run("Generating an editable guide…", async signal => {
      if (!await this.syncCheckpoint() || signal.aborted) return;
      const revisions = this.revisions();
      const candidate = await this.bridge.previewCapture({ ...revisions, plan }, signal);
      if (signal.aborted || this.destroyed) return;
      this.candidate = candidate;
      this.ticketRevision = revisions.checkpointRevision;
      this.index = Math.max(0, candidate.definition.steps.findIndex(step => step.id === restoredStepId));
      this.state = "preview";
      if (!restoredStepId) this.workflowChanged();
      this.message("");
      this.renderPreview();
    });
  }

  private previewStep(offset: number): void {
    const index = this.index + offset;
    if (!this.candidate || index < 0 || index >= this.candidate.definition.steps.length) return;
    this.index = index;
    this.workflowChanged();
    this.renderPreview();
    this.update();
  }

  private renderPreview(): void {
    if (!this.candidate) return;
    const { definition } = this.candidate;
    const step = definition.steps[this.index];
    const path = step.target?.targetContext?.pagePath;
    const position = this.root.querySelector("[data-preview-position]");
    if (position) position.textContent = `${this.index + 1} of ${definition.steps.length} · ${step.label ?? step.content.heading}`;
    this.preview.destroy();
    if (path && guideCapturePath() !== path) {
      this.message(`Navigate to ${path} in your application to see this tooltip.`);
      return;
    }
    this.message("");
    const noop = () => {};
    this.preview.render({ id: this.draft.experience.id, versionId: this.draft.version.id, kind: "guide", widgetType: null, priority: 0, definition }, {
      onVisible: noop, onDismiss: noop, onAction: noop, onComplete: noop,
      onGuideAdvance: () => this.previewStep(1), onGuideBack: () => this.previewStep(-1),
      onUnavailable: () => this.message("The target is missing on this page. You can return to capture and replace it."),
    }, step.id);
  }

  private async apply(): Promise<void> {
    const candidate = this.candidate;
    const plan = this.plan;
    if (!candidate || !plan || this.busy) return;
    this.busy = true;
    this.message("Applying the guide to your draft…");
    this.update();
    try {
      if (!await this.syncCheckpoint() || this.destroyed) return;
      const revisions = this.revisions();
      if (this.ticketRevision !== revisions.checkpointRevision) {
        const fresh = await this.bridge.previewCapture({ ...revisions, plan }, AbortSignal.timeout(15_000));
        this.candidate = fresh;
        this.ticketRevision = revisions.checkpointRevision;
      }
      const { version } = await this.bridge.applyCapture({ ...revisions, plan, previewTicket: this.candidate!.previewTicket });
      if (!this.destroyed) this.finish(version);
    } catch (error) {
      if (this.destroyed) return;
      let latest;
      try { latest = await this.bridge.load(); } catch { /* Keep the preview available for retry. */ }
      if (latest && !latest.guidedCapture && latest.version.revision === this.revision + 1 && JSON.stringify(latest.version.definition) === JSON.stringify(candidate.definition)) {
        this.finish(latest.version);
        return;
      }
      this.report(error);
      if (error instanceof CaptureRequestError && ["capture_conflict", "draft_conflict", "stale_preview"].includes(error.code ?? "")) {
        this.preview.destroy();
        this.candidate = undefined;
        this.plan = undefined;
        await this.restore();
        this.message("The draft or checkpoint changed. Review the recovered work before generating a fresh preview.");
      }
    } finally { this.busy = false; if (!this.destroyed) this.update(); }
  }

  private finish(version: EditorDraft["version"]): void {
    try { sessionStorage.removeItem(this.key); sessionStorage.removeItem(this.previousKey); } catch { /* The server has committed the guide. */ }
    this.applied(version);
  }

  private async run(message: string, task: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const request = new AbortController();
    this.request = request;
    this.busy = true;
    this.message(message);
    this.update();
    try {
      await task(request.signal);
      if (request.signal.aborted && this.state !== "expired" && !this.destroyed) this.message("Request canceled. Your capture is still available.");
    } catch (error) {
      if (!this.destroyed) {
        if (request.signal.aborted && this.state !== "expired") this.message("Request canceled. Your capture is still available.");
        else if (!request.signal.aborted) {
          if (error instanceof CaptureRequestError && error.code === "capture_conflict") {
            this.plan = undefined;
            this.candidate = undefined;
            await this.restore();
            this.message("The draft or checkpoint changed. Review the recovered work before generating a fresh preview.");
          } else this.report(error);
        }
      }
    } finally {
      this.request = undefined;
      this.busy = false;
      if (!this.destroyed) this.update();
    }
  }

  private report(error: unknown): void {
    if (error instanceof EditorSessionExpiredError) { this.expire(); return; }
    this.message(error instanceof Error ? error.message : "Guided Capture could not continue. Try again.");
  }

  private toggle(selector: string, shown: boolean): void {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (element) element.hidden = !shown;
  }

  private message(text: string): void {
    const status = this.root.querySelector("[data-message]");
    if (status) status.textContent = text;
    this.toggle("[data-message]", Boolean(text));
  }

  private update(): void {
    this.toggle("[data-capture]", this.state === "capture");
    this.toggle("[data-plan-panel]", this.state === "plan");
    this.toggle("[data-preview]", this.state === "preview");
    this.toggle("[data-retry]", this.checkpointError);
    this.toggle("[data-refresh]", this.checkpointError);
    this.toggle("[data-cancel]", Boolean(this.request));
    const active = this.state === "capture" && this.checkpoint.mode === "select" && !this.busy;
    this.selection?.setEnabled(active);
    this.selection?.setTargets(this.state === "capture" ? this.checkpoint.targets : []);
    if (this.state === "capture" && this.checkpoint.mode === "navigate" && !this.busy) {
      const path = this.navigationPath;
      this.navigationPath = undefined;
      this.journey.activate(path);
    } else this.journey.stop();
    const instructions = this.root.querySelector("[data-instructions]");
    if (instructions) instructions.textContent = this.checkpoint.mode === "select"
      ? "Click an element to capture it. Switch to Navigate to use your application."
      : "Use your application as usual. Switch to Select Elements when you reach the next screen.";
    this.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === this.checkpoint.mode));
      button.disabled = this.busy;
    });
    const checkpoint = this.root.querySelector("[data-checkpoint]");
    if (checkpoint) checkpoint.textContent = this.checkpointError
      ? this.localSaved ? "Saved in this tab. The server checkpoint needs attention." : "The latest selection could not be saved. Keep this tab open and retry."
      : this.inFlight ? "Saving capture…" : this.checkpoint.targets.length ? "Capture saved" : "";
    const planButton = this.root.querySelector<HTMLButtonElement>("[data-plan]");
    if (planButton) planButton.disabled = this.busy || !this.checkpoint.targets.length || this.checkpointError;
    this.root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-apply],[data-edit-plan],[data-compile],[data-edit-capture],[data-prompt],[data-plan-steps] input,[data-plan-steps] textarea,[data-plan-steps] select").forEach(control => { control.disabled = this.busy || control.matches("[data-apply],[data-compile]") && this.checkpointError; });
    const previous = this.root.querySelector<HTMLButtonElement>("[data-previous]");
    const next = this.root.querySelector<HTMLButtonElement>("[data-next]");
    if (previous) previous.disabled = this.busy || this.index === 0;
    if (next) next.disabled = this.busy || this.index >= (this.candidate?.definition.steps.length ?? 0) - 1;
  }
}

function sameCheckpoint(left: GuideCaptureCheckpoint, right: GuideCaptureCheckpoint): boolean {
  const canonical = (state: GuideCaptureCheckpoint) => JSON.stringify(
    { mode: state.mode, targets: state.targets, observations: state.observations, workflow: state.workflow },
    (_key, value) => value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
      : value,
  );
  return canonical(left) === canonical(right);
}
