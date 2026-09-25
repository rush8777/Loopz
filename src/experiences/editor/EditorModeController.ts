import type {
  EditorDefinition,
  EditorDraft,
  ExperienceBehavior,
  ExperienceLayer,
  ExperienceTarget,
  ExperienceTargeting,
  GuideAdvance,
  PageRule,
  RuntimeGuideDefinition,
  RuntimeWidgetDefinition,
  SurveyConfig,
} from "../types";
import { getGuideStepPattern, guideStepRequiresTarget, isGuideDefinition } from "../types";
import type { EditorAuthoringState, EditorContinuation, EditorSession } from "../runtimeInterfaces";
import { clearEditorContinuation, storeEditorContinuation } from "../editorContinuation";
import { RouteObserver } from "../../dom/RouteObserver";
import { ExperienceRenderer } from "../runtime/ExperienceRenderer";
import { findTarget } from "../runtime/AnchoredCardRenderer";
import { EditorBridge } from "./EditorBridge";
import { ElementPicker } from "./ElementPicker";

type EditorMode = "select" | "navigate";
type TargetStatus = "found" | "off-page" | "missing" | "unconfigured";

export class EditorModeController {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private picker = new ElementPicker();
  private preview = new ExperienceRenderer();
  private routeObserver = new RouteObserver();
  private routeUnsubscribe: (() => void) | null = null;
  private mutationObserver: MutationObserver | null = null;
  private dragCleanup: (() => void) | null = null;
  private expiryTimer = 0;
  private validationTimer = 0;
  private saveTimer = 0;
  private saveInFlight: Promise<boolean> | null = null;
  private targetRefreshTimer = 0;
  private selectionGeneration = 0;
  private bridge: EditorBridge | null = null;
  private session: EditorSession | null = null;
  private draft: EditorDraft | null = null;
  private definition: EditorDefinition | null = null;
  private guide: RuntimeGuideDefinition | null = null;
  private survey: SurveyConfig | null = null;
  private stepIndex = 0;
  private mode: EditorMode = "select";
  private dirty = false;
  private previewRendered = false;
  private currentPath = "";
  private persistBeforePageLeave = () => this.updateContinuation();

  constructor(private apiBase: string) {}

  async start(rawToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBase}/public/experience-editor/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ token: rawToken }),
      });
      if (!response.ok) return false;
      const session = await response.json() as EditorSession;
      if (!validSession(session)) return false;

      const clean = new URL(location.href);
      const requestedStep = Number(clean.searchParams.get("movecues_editor_step") ?? "0");
      clean.searchParams.delete("movecues_editor_token");
      clean.searchParams.delete("movecues_editor_step");
      history.replaceState(history.state, "", clean.toString());
      return await this.activate(session, { requestedStep });
    } catch {
      this.destroy();
      return false;
    }
  }

  async resume(continuation: EditorContinuation): Promise<boolean> {
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

  private async activate(session: EditorSession, options: { requestedStep?: number; restoredState?: EditorAuthoringState }): Promise<boolean> {
    this.teardown(false);
    const bridge = new EditorBridge(this.apiBase, session.sessionId, session.accessToken);
    let draft: EditorDraft;
    try { draft = await bridge.load(); }
    catch { clearEditorContinuation(); return false; }
    if (draft.experience.kind === "checklist") { clearEditorContinuation(); return false; }

    this.bridge = bridge;
    this.session = session;
    this.draft = draft;
    this.definition = draft.version.definition;
    this.guide = isGuideDefinition(this.definition) ? this.definition : null;
    this.survey = !this.guide && draft.experience.widgetType === "survey" ? (this.definition as RuntimeWidgetDefinition).survey ?? null : null;
    const selectableSteps = this.guide?.steps ?? this.survey?.steps;
    const restored = options.restoredState?.experienceId === draft.experience.id ? options.restoredState : undefined;
    const restoredIndex = selectableSteps && restored?.selectedStepId ? selectableSteps.findIndex(step => step.id === restored.selectedStepId) : -1;
    this.stepIndex = selectableSteps ? restoredIndex >= 0 ? restoredIndex : clampStep(options.requestedStep ?? 0, selectableSteps.length) : 0;
    this.currentPath = currentPagePath();
    this.mode = restored?.mode ?? "select";
    this.updateContinuation();
    this.mount();
    this.expiryTimer = window.setTimeout(() => this.destroy(), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    this.validationTimer = window.setInterval(() => { void bridge.load().catch(() => this.destroy()); }, 15_000);
    return true;
  }

  private mount(): void {
    if (!this.draft || !this.definition) return;
    this.host = document.createElement("div");
    this.host.dataset.movecuesEditor = "";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLE}</style>${this.panelMarkup(this.draft)}`;
    document.documentElement.appendChild(this.host);

    this.bindPanel();
    this.syncPanel();
    if (this.mode === "select") { this.renderPreview(); this.startPicker(); }

    this.routeUnsubscribe = this.routeObserver.onChange(() => this.onRouteChange());
    this.routeObserver.start();
    window.addEventListener("pagehide", this.persistBeforePageLeave);
    if (typeof MutationObserver !== "undefined") {
      this.mutationObserver = new MutationObserver(() => this.scheduleTargetRefresh());
      this.mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["id", "class", "data-testid", "data-test", "data-qa", "data-cy", "aria-label", "role", "name", "href", "hidden"] });
    }
  }

  private panelMarkup(draft: EditorDraft): string {
    const selectableSteps = this.guide?.steps ?? this.survey?.steps;
    const guideMarkup = selectableSteps ? `<section class="section" data-guide><div class="eyebrow">${this.guide ? "Guide" : "Survey"}</div><div class="step-flow">${selectableSteps.map((_, index) => `<button class="step" type="button" data-step="${index}" aria-label="Open step ${index + 1}">${index + 1} <span data-step-icon>○</span></button>`).join('<span class="arrow">→</span>')}</div><div class="muted" data-step-label></div></section>` : "";
    return `<aside>
      <header data-drag-handle>
        <div class="header-copy"><strong>Movcues Live Editor</strong><span>${escapeText(draft.experience.name)}</span><small><i></i> Connected · <span data-save-state>Draft saved</span></small></div>
        <div class="header-actions"><button type="button" data-minimize aria-label="Minimize editor">—</button><button type="button" data-close aria-label="Close editor">×</button></div>
      </header>
      <main>
        <div class="modebar"><button type="button" data-mode="select">Select</button><button type="button" data-mode="navigate">Navigate</button></div>
        <div class="notice" data-route-notice hidden><b>Page changed</b><span data-route-change></span></div>
        ${guideMarkup}
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
        <p class="hint" data-mode-hint></p>
      </main>
    </aside>`;
  }

  private bindPanel(): void {
    const root = this.root!;
    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => button.addEventListener("click", () => this.setMode(button.dataset.mode as EditorMode)));
    root.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach(button => button.addEventListener("click", () => { if (this.mode === "navigate") this.setMode("select"); else this.startPicker(); }));
    root.querySelector<HTMLButtonElement>("[data-pick-layer]")?.addEventListener("click", () => this.startLayerPicker());
    root.querySelectorAll<HTMLButtonElement>("[data-step]").forEach(button => button.addEventListener("click", () => this.switchStep(Number(button.dataset.step))));
    root.querySelector<HTMLButtonElement>("[data-minimize]")?.addEventListener("click", () => {
      const aside = root.querySelector("aside")!; aside.classList.toggle("minimized");
      const button = root.querySelector<HTMLButtonElement>("[data-minimize]")!; button.textContent = aside.classList.contains("minimized") ? "+" : "—";
    });
    root.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", () => void this.close());
    this.bindDrag();

    this.onSelect("[data-alignment]", value => { this.currentBehavior().alignment = value as NonNullable<ExperienceBehavior["alignment"]>; });
    this.onSelect("[data-layer-mode]", value => {
      if (value === "relative") { this.startLayerPicker(); return; }
      if (value === "auto") this.setLayer({ mode: "auto" });
      else if (value === "always_on_top") this.setLayer({ mode: "always_on_top" });
      else { const current = this.currentLayer(); this.setLayer({ mode: "custom", zIndex: current?.mode === "custom" ? current.zIndex : 1000 }); }
    });
    this.onSelect("[data-layer-relation]", value => { const layer = this.currentLayer(); if (layer?.mode === "relative") this.setLayer({ ...layer, relation: value as "above" | "below" }); });
    this.onInput("[data-layer-z-index]", value => { this.setLayer({ mode: "custom", zIndex: Math.max(1, Math.min(2_147_483_647, Math.trunc(numberValue(value, 1000)))) }); });
    this.onInput("[data-offset]", value => { this.currentBehavior().offset = numberValue(value, 8); });
    root.querySelectorAll<HTMLButtonElement>("[data-placement]").forEach(button => button.addEventListener("click", () => { this.currentBehavior().placement = button.dataset.placement as NonNullable<ExperienceBehavior["placement"]>; this.changed(); }));
    this.onSelect("[data-toast-position]", value => { this.currentBehavior().toastPosition = value as NonNullable<ExperienceBehavior["toastPosition"]>; });
    this.onInput("[data-auto-dismiss]", value => { this.currentBehavior().autoDismissMs = value ? numberValue(value, 0) : null; });
    this.onSelect("[data-modal-layout]", value => { this.currentBehavior().modalLayout = value as NonNullable<ExperienceBehavior["modalLayout"]>; });
    this.onCheck("[data-backdrop]", value => { this.currentBehavior().backdrop = value; });
    this.onInput("[data-backdrop-opacity]", value => { this.currentBehavior().backdropOpacity = numberValue(value, 0.45); });
    this.onCheck("[data-close-backdrop]", value => { this.currentBehavior().closeOnBackdrop = value; });
    this.onSelect("[data-slideout-position]", value => { this.currentBehavior().slideoutPosition = value as NonNullable<ExperienceBehavior["slideoutPosition"]>; });
    this.onSelect("[data-banner-position]", value => { this.currentBehavior().bannerPosition = value as NonNullable<ExperienceBehavior["bannerPosition"]>; });
    this.onInput("[data-cursor-x]", value => { this.currentBehavior().cursorOffset = { x: numberValue(value, 16), y: this.currentBehavior().cursorOffset?.y ?? 16 }; });
    this.onInput("[data-cursor-y]", value => { this.currentBehavior().cursorOffset = { x: this.currentBehavior().cursorOffset?.x ?? 16, y: numberValue(value, 16) }; });
    this.onSelect("[data-hotspot-style]", value => { this.currentBehavior().hotspotStyle = value as NonNullable<ExperienceBehavior["hotspotStyle"]>; });
    this.onInput("[data-hotspot-color]", value => { this.currentBehavior().hotspotColor = value; });
  }

  private bindDrag(): void {
    const handle = this.root?.querySelector<HTMLElement>("[data-drag-handle]");
    const aside = this.root?.querySelector<HTMLElement>("aside");
    if (!handle || !aside) return;
    handle.addEventListener("pointerdown", event => {
      if ((event.target as Element).closest("button")) return;
      const rect = aside.getBoundingClientRect();
      const startX = event.clientX; const startY = event.clientY;
      const move = (next: PointerEvent) => {
        aside.style.right = "auto";
        aside.style.left = `${Math.max(4, Math.min(innerWidth - rect.width - 4, rect.left + next.clientX - startX))}px`;
        aside.style.top = `${Math.max(4, Math.min(innerHeight - 48, rect.top + next.clientY - startY))}px`;
      };
      const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); this.dragCleanup = null; };
      this.dragCleanup?.(); this.dragCleanup = stop;
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
    });
  }

  private onSelect(selector: string, update: (value: string) => void): void {
    this.root?.querySelector<HTMLSelectElement>(selector)?.addEventListener("change", event => { update((event.currentTarget as HTMLSelectElement).value); this.changed(); });
  }

  private onInput(selector: string, update: (value: string) => void): void {
    this.root?.querySelector<HTMLInputElement>(selector)?.addEventListener("input", event => { update((event.currentTarget as HTMLInputElement).value); this.changed(); });
  }

  private onCheck(selector: string, update: (value: boolean) => void): void {
    this.root?.querySelector<HTMLInputElement>(selector)?.addEventListener("change", event => { update((event.currentTarget as HTMLInputElement).checked); this.changed(); });
  }

  private switchStep(index: number): void {
    const steps = this.guide?.steps ?? this.survey?.steps;
    if (!steps || index < 0 || index >= steps.length || index === this.stepIndex) return;
    this.selectionGeneration++;
    this.picker.cancel();
    this.stepIndex = index;
    this.updateContinuation();
    this.syncPanel();
    if (this.mode === "select") { this.renderPreview(); this.startPicker(); }
  }

  private setMode(mode: EditorMode): void {
    if (this.mode === mode && (mode !== "select" || this.pickerIsSelecting())) return;
    this.selectionGeneration++;
    this.picker.cancel();
    this.mode = mode;
    this.updateContinuation();
    if (mode === "navigate") {
      this.preview.destroy();
      this.previewRendered = false;
      this.syncPanel();
      if (!this.dirty) this.setText("[data-save-state]", "Draft saved");
      return;
    }
    this.renderPreview();
    this.syncPanel();
    this.startPicker();
  }

  private startPicker(): void {
    if (!this.isTargetedType() || this.mode !== "select") return;
    const generation = ++this.selectionGeneration;
    this.setText("[data-mode-hint]", "Select an element · Hold Shift to interact temporarily");
    void this.picker.pick().then(target => {
      if (generation !== this.selectionGeneration || !this.definition || !target) return;
      this.setTarget(target);
      this.updateContinuation();
      this.changed();
    });
  }

  private startLayerPicker(): void {
    if (this.mode === "navigate") this.mode = "select";
    const generation = ++this.selectionGeneration;
    this.picker.cancel();
    this.setText("[data-mode-hint]", "Select the page element this experience should appear above or below");
    void this.picker.pick().then(target => {
      if (generation !== this.selectionGeneration || !this.definition || !target) return;
      const current = this.currentLayer();
      this.setLayer({ mode: "relative", relation: current?.mode === "relative" ? current.relation : "above", target: { ...target, targetContext: { pagePath: currentPagePath() } } });
      this.changed();
    });
  }

  private pickerIsSelecting(): boolean {
    return !!document.querySelector("[data-movecues-picker-overlay]");
  }

  private changed(): void {
    this.dirty = true;
    this.updateContinuation();
    this.syncPanel();
    if (this.mode === "select") this.renderPreview();
    this.setText("[data-save-state]", "Saving…");
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.persist(), 350);
  }

  private async persist(): Promise<boolean> {
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    if (this.saveInFlight) {
      const saved = await this.saveInFlight;
      return saved && this.dirty ? this.persist() : saved;
    }
    if (!this.dirty || !this.bridge || !this.definition) return true;
    this.dirty = false;
    const bridge = this.bridge; const definition = this.definition;
    const request = bridge.save(definition).then(() => {
      this.setText("[data-save-state]", this.dirty ? "Saving…" : "Draft saved");
      return true;
    }).catch(() => {
      this.setText("[data-save-state]", "Session expired");
      this.destroy();
      return false;
    });
    this.saveInFlight = request;
    const saved = await request;
    if (this.saveInFlight === request) this.saveInFlight = null;
    if (saved && this.dirty && !this.saveTimer) this.saveTimer = window.setTimeout(() => void this.persist(), 350);
    return saved;
  }

  private async close(): Promise<void> {
    if (this.dirty && !await this.persist()) return;
    this.destroy();
  }

  private renderPreview(): void {
    if (!this.definition || !this.draft || this.mode === "navigate") return;
    this.previewRendered = false;
    const definition = this.guide ? { ...this.definition, steps: [this.guide.steps[this.stepIndex]] } as EditorDefinition : this.definition;
    const selectedStepId = this.survey?.steps[this.stepIndex]?.id;
    this.preview.render({
      id: this.draft.experience.id,
      versionId: this.draft.version.id,
      kind: this.draft.experience.kind,
      widgetType: this.draft.experience.widgetType,
      priority: 0,
      definition,
    }, {
      onVisible: () => { this.previewRendered = true; this.updateDiagnostics(); },
      onDismiss: () => window.setTimeout(() => this.renderPreview(), 0),
      onAction: () => void 0,
      onComplete: () => window.setTimeout(() => this.renderPreview(), 0),
      onUnavailable: () => { this.previewRendered = false; this.updateDiagnostics(); },
    }, selectedStepId);
    this.updateDiagnostics();
  }

  private syncPanel(): void {
    if (!this.root || !this.definition || !this.draft) return;
    const behavior = this.currentBehavior();
    const widgetType = this.draft.experience.widgetType;
    const guidePattern = this.guide ? getGuideStepPattern(this.guide.steps[this.stepIndex]) : null;
    const activeGroups = new Set<string>(guidePattern === "anchored_card" || (!this.guide && widgetType === "anchored_card") ? ["target", "anchored"] : guidePattern === "modal" ? [] : widgetType === "hotspot" ? ["target", "anchored", "hotspot"] : widgetType === "toast" ? ["toast"] : widgetType === "modal" || widgetType === "survey" ? ["modal"] : widgetType === "slideout" ? ["slideout"] : widgetType === "banner" ? ["banner"] : ["cursor"]);
    this.root.querySelectorAll<HTMLElement>("[data-for]").forEach(group => { group.hidden = !activeGroups.has(group.dataset.for!); });
    const placementSection = this.root.querySelector<HTMLElement>("[data-placement-section]"); if (placementSection) placementSection.hidden = Boolean(this.guide && guidePattern === "modal");
    this.root.querySelector<HTMLElement>("[data-step-summary]")!.hidden = !this.guide;
    this.root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === this.mode));
    this.root.querySelectorAll<HTMLButtonElement>("[data-placement]").forEach(button => button.classList.toggle("active", button.dataset.placement === (behavior.placement ?? "auto")));

    const layer = this.currentLayer();
    const layerMode = layer?.mode ?? "always_on_top";
    this.setValue("[data-layer-mode]", layerMode);
    const relative = this.root.querySelector<HTMLElement>("[data-layer-relative]"); if (relative) relative.hidden = layer?.mode !== "relative";
    const custom = this.root.querySelector<HTMLElement>("[data-layer-custom]"); if (custom) custom.hidden = layer?.mode !== "custom";
    this.setText("[data-layer-description]", layerMode === "auto" ? "Respect the application's UI layers." : layerMode === "relative" ? "Place this experience around a selected page element." : layerMode === "custom" ? "Use an advanced numeric layer." : layer ? "Keep this experience above normal application UI." : "Legacy compatibility: keep this experience above normal application UI.");
    if (layer?.mode === "relative") { this.setText("[data-layer-target]", layer.target.label ?? layer.target.primarySelector); this.setValue("[data-layer-relation]", layer.relation); }
    if (layer?.mode === "custom") this.setValue("[data-layer-z-index]", String(layer.zIndex));

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
    this.setValue("[data-cursor-x]", String(behavior.cursorOffset?.x ?? 16));
    this.setValue("[data-cursor-y]", String(behavior.cursorOffset?.y ?? 16));
    this.setValue("[data-hotspot-style]", behavior.hotspotStyle ?? "pulse");
    this.setValue("[data-hotspot-color]", behavior.hotspotColor ?? this.definition.design.theme.primary);

    if (this.guide) {
      const step = this.guide.steps[this.stepIndex];
      this.setText("[data-step-label]", `Step ${this.stepIndex + 1} of ${this.guide.steps.length}`);
      this.setText("[data-advance]", formatAdvance(step.advance));
      this.setText("[data-dismissible]", (step.behavior.dismissible ?? true) ? "Yes" : "No");
    }
    if (this.survey) this.setText("[data-step-label]", `Step ${this.stepIndex + 1} of ${this.survey.steps.length}`);
    this.renderConfigured(this.definition.targeting);
    this.updateDiagnostics();
    this.setText("[data-mode-hint]", this.mode === "navigate" ? "Customer app interaction is enabled" : this.isTargetedType() ? "Select an element · Hold Shift to interact temporarily" : "Live placement preview");
  }

  private renderConfigured(targeting: ExperienceTargeting): void {
    const items: Array<[string, string]> = [];
    items.push(["Trigger", targeting.trigger.type === "custom_event" ? `Custom event · ${targeting.trigger.eventName}` : "Page load"]);
    items.push(["Page", formatPageRules(targeting.pageRules)]);
    items.push(["Frequency", formatFrequency(targeting.frequency)]);
    items.push(["Priority", String(targeting.priority)]);
    items.push(["Interrupt", targeting.interruptPolicy === "interrupt" ? "Interrupt" : "Wait"]);
    if (this.guide) items.push(["Advance", formatAdvance(this.guide.steps[this.stepIndex].advance)]);
    const configured = this.root?.querySelector<HTMLElement>("[data-configured]");
    if (configured) configured.innerHTML = items.map(([label, value]) => `<dt>${escapeText(label)}</dt><dd>${escapeText(value)}</dd>`).join("");
  }

  private updateDiagnostics(): void {
    if (!this.root) return;
    const target = this.currentTarget();
    const targeted = this.isTargetedType();
    const targetStatus = targeted ? this.targetStatus(target) : "unconfigured";
    const found = targetStatus === "found";
    this.setText("[data-current-path]", this.currentPath || currentPagePath());
    this.setText("[data-preview-status]", `${this.previewRendered ? "✓" : "○"} Preview ${this.previewRendered ? "rendered" : this.mode === "navigate" ? "paused for navigation" : "waiting"}`);
    const previewStatus = this.root.querySelector<HTMLElement>("[data-preview-status]");
    previewStatus?.classList.toggle("status-ok", this.previewRendered);
    const liveTarget = this.root.querySelector<HTMLElement>("[data-live-target]");
    if (liveTarget) {
      liveTarget.hidden = !targeted;
      liveTarget.textContent = targetStatus === "found" ? "✓ Found on current page" : targetStatus === "off-page" ? "○ Configured on another page" : targetStatus === "missing" ? "⚠ Expected on current page but not found" : "○ Not configured";
      liveTarget.className = found ? "status-ok" : targetStatus === "missing" ? "status-error" : "muted";
    }
    this.setText("[data-target-label]", target?.label || target?.primarySelector || "Not selected");
    this.setText("[data-reliability]", target ? `${reliabilityIcon(target.reliability)} ${capitalize(target.reliability)} selector` : "○ No selector configured");
    const reliability = this.root.querySelector<HTMLElement>("[data-reliability]");
    if (reliability) reliability.dataset.level = target?.reliability ?? "none";
    const missing = this.root.querySelector<HTMLElement>("[data-missing-selector]");
    if (missing) {
      missing.hidden = targetStatus !== "missing";
      const code = missing.querySelector("code"); if (code) code.textContent = target?.primarySelector ?? "";
    }
    if (this.guide) this.root.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((button, index) => {
      const guideStep = this.guide!.steps[index];
      const stepTarget = guideStep.target;
      const state = index === this.stepIndex ? "current" : guideStepRequiresTarget(guideStep) ? this.targetStatus(stepTarget) : "found";
      button.dataset.stepStatus = state;
      const icon = button.querySelector("[data-step-icon]"); if (icon) icon.textContent = state === "current" ? "●" : state === "found" ? "✓" : state === "missing" ? "⚠" : "○";
      button.classList.toggle("active", index === this.stepIndex);
    });
    else if (this.survey) this.root.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((button, index) => {
      button.dataset.stepStatus = index === this.stepIndex ? "current" : "found";
      button.classList.toggle("active", index === this.stepIndex);
      const icon = button.querySelector("[data-step-icon]"); if (icon) icon.textContent = index === this.stepIndex ? "●" : "✓";
    });
  }

  private scheduleTargetRefresh(): void {
    clearTimeout(this.targetRefreshTimer);
    this.targetRefreshTimer = window.setTimeout(() => this.updateDiagnostics(), 80);
  }

  private onRouteChange(): void {
    const previous = this.currentPath;
    const next = currentPagePath();
    if (next === previous) return;
    this.currentPath = next;
    this.updateContinuation();
    const notice = this.root?.querySelector<HTMLElement>("[data-route-notice]");
    if (notice) notice.hidden = false;
    this.setText("[data-route-change]", `${previous} → ${next}`);
    this.updateDiagnostics();
    if (this.mode === "select") this.renderPreview();
  }

  private currentTarget(): ExperienceTarget | undefined {
    if (!this.definition) return undefined;
    if (this.guide) { const step = this.guide.steps[this.stepIndex]; return step && guideStepRequiresTarget(step) ? step.target : undefined; }
    return (this.definition as RuntimeWidgetDefinition).target;
  }

  private targetStatus(target?: ExperienceTarget): TargetStatus {
    if (!target) return "unconfigured";
    if (target.targetContext?.pagePath && target.targetContext.pagePath !== (this.currentPath || currentPagePath())) return "off-page";
    return findTarget(target) ? "found" : "missing";
  }

  private currentBehavior(): ExperienceBehavior {
    if (!this.definition) return { dismissible: true };
    return (this.guide ? this.guide.steps[this.stepIndex].behavior : (this.definition as RuntimeWidgetDefinition).behavior) as ExperienceBehavior;
  }

  private currentLayer(): ExperienceLayer | undefined {
    if (!this.definition) return undefined;
    return this.guide ? this.guide.behavior?.layer : (this.definition as RuntimeWidgetDefinition).behavior.layer;
  }

  private setLayer(layer: ExperienceLayer): void {
    if (!this.definition) return;
    if (this.guide) this.guide.behavior = { ...this.guide.behavior, layer };
    else (this.definition as RuntimeWidgetDefinition).behavior.layer = layer;
  }

  private setTarget(target: ExperienceTarget): void {
    if (!this.definition) return;
    const contextualTarget: ExperienceTarget = { ...target, targetContext: { pagePath: currentPagePath() } };
    if (this.guide) { const step = this.guide.steps[this.stepIndex]; if (!guideStepRequiresTarget(step)) return; step.target = contextualTarget; }
    else (this.definition as RuntimeWidgetDefinition).target = contextualTarget;
  }

  private updateContinuation(): void {
    if (!this.session || !this.draft) return;
    storeEditorContinuation({
      session: this.session,
      editorState: {
        experienceId: this.draft.experience.id,
        selectedStepId: this.guide?.steps[this.stepIndex]?.id ?? this.survey?.steps[this.stepIndex]?.id,
        mode: this.mode,
      },
    });
  }

  private isTargetedType(): boolean {
    const type = this.draft?.experience.widgetType;
    return this.guide ? guideStepRequiresTarget(this.guide.steps[this.stepIndex]) : type === "anchored_card" || type === "hotspot";
  }

  private setText(selector: string, value: string): void { const element = this.root?.querySelector<HTMLElement>(selector); if (element) element.textContent = value; }
  private setValue(selector: string, value: string): void { const element = this.root?.querySelector<HTMLInputElement | HTMLSelectElement>(selector); if (element) element.value = value; }
  private setChecked(selector: string, value: boolean): void { const element = this.root?.querySelector<HTMLInputElement>(selector); if (element) element.checked = value; }

  destroy(): void { this.teardown(true); }

  private teardown(clearContinuation: boolean): void {
    clearTimeout(this.expiryTimer);
    clearInterval(this.validationTimer);
    clearTimeout(this.saveTimer);
    clearTimeout(this.targetRefreshTimer);
    this.selectionGeneration++;
    this.routeUnsubscribe?.(); this.routeUnsubscribe = null;
    this.routeObserver.stop();
    window.removeEventListener("pagehide", this.persistBeforePageLeave);
    this.mutationObserver?.disconnect(); this.mutationObserver = null;
    this.dragCleanup?.(); this.dragCleanup = null;
    this.preview.destroy();
    this.picker.cancel();
    this.host?.remove();
    this.host = null; this.root = null; this.bridge = null; this.session = null; this.draft = null; this.definition = null; this.guide = null; this.survey = null;
    this.dirty = false; this.previewRendered = false; this.saveInFlight = null;
    if (clearContinuation) clearEditorContinuation();
  }
}

function placementButton(value: NonNullable<ExperienceBehavior["placement"]>, label: string): string { return `<button type="button" data-placement="${value}">${label}</button>`; }
function clampStep(value: number, length: number): number { return Number.isFinite(value) && length ? Math.max(0, Math.min(Math.trunc(value), length - 1)) : 0; }
function validSession(value: Partial<EditorSession> | null): value is EditorSession { return !!value && typeof value.sessionId === "string" && !!value.sessionId && typeof value.accessToken === "string" && !!value.accessToken && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) > Date.now(); }
function numberValue(value: string, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function currentPagePath(): string { return `${location.pathname}${location.search}${location.hash}`; }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function reliabilityIcon(value: ExperienceTarget["reliability"]): string { return value === "reliable" ? "✓" : value === "moderate" ? "●" : "⚠"; }
function formatFrequency(value: ExperienceTargeting["frequency"]): string {
  const mode = value.mode === "once" ? "Once ever" : value.mode === "once_per_session" ? "Once per session" : "Every qualifying time";
  const limits = [value.maxImpressions ? `max ${value.maxImpressions}` : "", value.cooldownHours ? `${value.cooldownHours}h cooldown` : ""].filter(Boolean);
  return limits.length ? `${mode} · ${limits.join(" · ")}` : mode;
}
function formatPageRules(rules: PageRule[]): string {
  if (!rules.length) return "All pages";
  return rules.map(rule => `${rule.kind === "exclude" ? "Exclude" : "Include"} ${rule.value}`).join(" · ");
}
function formatAdvance(advance?: GuideAdvance): string {
  if (!advance || advance.type === "button") return "Button click";
  if (advance.type === "element_click") return "Target element click";
  if (advance.type === "element_hover") return `Target element hover${advance.durationMs ? ` · ${advance.durationMs}ms` : ""}`;
  if (advance.type === "custom_event") return `Custom event · ${advance.eventName}`;
  return `Route · ${formatPageRules(advance.pageRules)}`;
}
function escapeText(value: string): string { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }

const STYLE = `
:host{all:initial}*{box-sizing:border-box}aside{position:fixed;right:12px;top:12px;width:312px;max-height:calc(100vh - 24px);z-index:2147483647;overflow:hidden;background:#fff;color:#111827;border:1px solid #d7dce3;border-radius:12px;box-shadow:0 18px 50px rgba(15,23,42,.24);font:13px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif}header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 12px 10px;border-bottom:1px solid #e5e7eb;cursor:move;user-select:none}.header-copy{display:grid;min-width:0}.header-copy strong{font-size:13px}.header-copy>span{overflow:hidden;color:#4b5563;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.header-copy small{margin-top:3px;color:#6b7280;font-size:11px}.header-copy i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a}.header-actions{display:flex;gap:2px}.header-actions button{width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:#64748b;font:16px/1 inherit;cursor:pointer}.header-actions button:hover{background:#f1f5f9;color:#0f172a}main{max-height:calc(100vh - 82px);overflow:auto}.minimized{width:260px}.minimized main{display:none}.modebar{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:8px;border-bottom:1px solid #e5e7eb}.modebar button,.secondary-button,.placement-grid button{border:1px solid #d7dce3;border-radius:7px;background:#fff;color:#334155;font:600 12px inherit;cursor:pointer}.modebar button{padding:7px}.modebar button.active,.placement-grid button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.notice{display:grid;gap:2px;margin:8px 10px 0;padding:8px;border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;color:#1e40af;font-size:11px}.section{display:grid;gap:8px;padding:10px 12px;border-bottom:1px solid #eef0f3}.eyebrow{color:#64748b;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.muted,.hint{color:#64748b;font-size:11px}.hint{margin:0;padding:9px 12px}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.step-flow{display:flex;align-items:center;overflow:auto}.step{flex:none;padding:4px 6px;border:0;border-radius:6px;background:transparent;color:#64748b;font:600 11px inherit;cursor:pointer}.step.active{background:#eff6ff;color:#1d4ed8}.step[data-step-status=found]{color:#15803d}.step[data-step-status=missing]{color:#b45309}.step.active{color:#1d4ed8}.arrow{color:#cbd5e1;font-size:10px}.reliability{color:#64748b;font-size:11px}.reliability[data-level=reliable]{color:#15803d}.reliability[data-level=fragile]{color:#b45309}.secondary-button{padding:7px 9px}.placement-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.placement-grid button{padding:6px}.placement-grid button[data-placement=top]{grid-column:2}.placement-grid button[data-placement=left]{grid-column:1}.placement-grid button[data-placement=auto]{grid-column:2}.placement-grid button[data-placement=right]{grid-column:3}.placement-grid button[data-placement=bottom]{grid-column:2}label{display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:8px;color:#475569;font-size:11px}label.check{display:flex}label.check input{width:auto}input,select{min-width:0;width:100%;padding:6px 7px;border:1px solid #d7dce3;border-radius:6px;background:#fff;color:#111827;font:12px inherit}.number{display:grid;grid-template-columns:1fr auto;align-items:center;gap:5px}.number span{color:#64748b;font-size:11px}dl{display:grid;grid-template-columns:82px minmax(0,1fr);gap:5px 8px;margin:0;font-size:11px}dt{color:#64748b}dd{min-width:0;margin:0;overflow-wrap:anywhere;color:#1f2937}.live{font-size:11px}.status-ok{color:#15803d}.status-error{color:#b91c1c}.live code{display:block;overflow:hidden;padding:4px 6px;border-radius:5px;background:#f8fafc;color:#475569;font:11px/1.35 ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap}[data-missing-selector]{display:grid;gap:5px;padding-top:4px;color:#b91c1c}[hidden]{display:none!important}
`;
