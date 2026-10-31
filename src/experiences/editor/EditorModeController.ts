import { ChecklistEditor } from "./ChecklistEditor";
import type { EditorChecklistDefinition } from "../types";
import { isChecklistDefinition } from "../types";
import { SurveyEditor } from "./SurveyEditor";
import { surveyBranchErrors } from "../survey/SurveyLogic";
import type {
  EditorDefinition,
  EditorDraft,
  ExperienceBehavior,
  ExperienceContent,
  ExperienceLayer,
  ExperienceTarget,
  ExperienceTargeting,
  GuideAdvance,
  PageRule,
  RuntimeGuideDefinition,
  RuntimeWidgetDefinition,
  SurveyConfig,
  WidgetBuilderState,
} from "../types";
import { getGuideStepPattern, guideStepRequiresTarget, isGuideDefinition } from "../types";
import type { EditorAuthoringState, EditorContinuation, EditorSession } from "../runtimeInterfaces";
import { clearEditorContinuation, storeEditorContinuation } from "../editorContinuation";
import { RouteObserver } from "../../dom/RouteObserver";
import { ExperienceRenderer } from "../runtime/ExperienceRenderer";
import { findTarget } from "../runtime/AnchoredCardRenderer";
import { DraftConflictError, EditorAiRequestError, EditorBridge, EditorSessionExpiredError } from "./EditorBridge";
import { ElementPicker } from "./ElementPicker";
import { OnsiteContentEditor, type OnsiteComponentSelection } from "./OnsiteContentEditor";
import { OnsiteCompositionEditor, type CompositionSelection } from "./OnsiteCompositionEditor";
import { applyOnsiteDocument, cloneOnsite, createOnsiteDocument, duplicateDocument, onsiteDocumentFromBuilder, type OnsiteBlock, type OnsiteCell } from "../onsite/OnsiteDocument";
import { guideInteractionTarget, guideStepConfigurationErrors, matchesGuideRoute } from "../runtime/GuideStepLogic";
import type { SiteThemeTokens, VisualPresetId, VisualThemeState } from "../../themes/types";
import { EXPERIENCE_PRESETS, resolvedTheme } from "../../themes/ExperienceTheme";
import { applyGuideAiProposal, editorAiContext, guideAiContext, type EditorAiProposal } from "./AiEditing";
import { applySurveyAiProposal, surveyAiContext, type SurveyAiProposal } from "./SurveyAiEditing";
import { applyChecklistAiProposal, checklistAiContext, type ChecklistAiProposal } from "./ChecklistAiEditing";
import { applySourceMarkup, isSourceAuthored, type ReplaceMarkupOperation } from "./SourceAuthoring";

type EditorMode = "design" | "target" | "navigate" | "preview";
type TargetStatus = "found" | "off-page" | "missing" | "unconfigured";
type AiChatMessage = { role: "user" | "assistant"; text: string };

export class EditorModeController {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private picker = new ElementPicker();
  private preview = new ExperienceRenderer();
  private contentEditor: OnsiteContentEditor | null = null;
  private compositionEditor: OnsiteCompositionEditor | null = null;
  private componentSelection: OnsiteComponentSelection | null = null;
  private compositionSelection: CompositionSelection | null = null;
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
  private surveyEditor: SurveyEditor | null = null;
  private checklist: EditorChecklistDefinition | null = null;
  private checklistEditor: ChecklistEditor | null = null;
  private stepIndex = 0;
  private mode: EditorMode = "design";
  private dirty = false;
  private editGeneration = 0;
  private saveState: "clean" | "dirty" | "saving" | "failed" | "conflict" | "expired" = "clean";
  private recoveryDraft: string | null = null;
  private lifecycle = 0;
  private previewRendered = false;
  private previewGeneration = 0;
  private currentPath = "";
  private guidePreviewComplete = false;
  private guidePreviewEntryPath = "";
  private previewDevice: "desktop" | "tablet" | "mobile" = "desktop";
  private aiConversationId: string | undefined;
  private aiMessages: AiChatMessage[] = [];
  private aiProposal: { value: EditorAiProposal | SurveyAiProposal | ChecklistAiProposal; revision: number; generation: number; selectionKey: string } | null = null;
  private aiResolvedTargets = new Map<number, ExperienceTarget>();
  private aiPreviewOriginal: (RuntimeGuideDefinition & { targeting: ExperienceTargeting }) | null = null;
  private aiPreviewCandidate: (RuntimeGuideDefinition & { targeting: ExperienceTargeting }) | null = null;
  private aiPreviewReturnMode: EditorMode | null = null;
  private guideAiUndo: Array<RuntimeGuideDefinition & { targeting: ExperienceTargeting }> = [];
  private guideAiRedo: Array<RuntimeGuideDefinition & { targeting: ExperienceTargeting }> = [];
  private surveyAiPreviewOriginal: (RuntimeWidgetDefinition & { targeting: ExperienceTargeting }) | null = null;
  private surveyAiPreviewCandidate: (RuntimeWidgetDefinition & { targeting: ExperienceTargeting }) | null = null;
  private surveyAiUndo: Array<RuntimeWidgetDefinition & { targeting: ExperienceTargeting }> = [];
  private surveyAiRedo: Array<RuntimeWidgetDefinition & { targeting: ExperienceTargeting }> = [];
  private checklistAiPreviewOriginal: EditorChecklistDefinition | null = null;
  private checklistAiPreviewCandidate: EditorChecklistDefinition | null = null;
  private checklistAiUndo: EditorChecklistDefinition[] = [];
  private checklistAiRedo: EditorChecklistDefinition[] = [];
  private widgetAiPreviewOriginal: (RuntimeWidgetDefinition & { targeting: ExperienceTargeting }) | null = null;
  private widgetAiPreviewCandidate: (RuntimeWidgetDefinition & { targeting: ExperienceTargeting }) | null = null;
  private widgetAiUndo: Array<RuntimeWidgetDefinition & { targeting: ExperienceTargeting }> = [];
  private widgetAiRedo: Array<RuntimeWidgetDefinition & { targeting: ExperienceTargeting }> = [];
  private aiAbort: AbortController | null = null;
  private aiRequestGeneration = 0;
  private persistBeforePageLeave = () => this.updateContinuation();
  private protectUnsavedChanges = (event: BeforeUnloadEvent) => { if (!this.dirty && !this.saveInFlight && !this.contentEditor?.isComposing() && !this.compositionEditor?.isComposing()) return; event.preventDefault(); event.returnValue = ""; };

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
    if (draft.experience.kind === "checklist" && draft.experience.builderMode !== "onsite") { clearEditorContinuation(); return false; }

    this.bridge = bridge;
    this.session = session;
    this.draft = draft;
    this.checklist = isChecklistDefinition(draft.version.definition) ? draft.version.definition : null;
    this.definition = this.checklist ? checklistEditorAdapter(this.checklist) : draft.version.definition as EditorDefinition;
    this.guide = isGuideDefinition(this.definition) ? this.definition : null;
    this.survey = !this.guide && draft.experience.widgetType === "survey" ? (this.definition as RuntimeWidgetDefinition).survey ?? null : null;
    const selectableSteps = this.guide?.steps ?? this.survey?.steps;
    const restored = options.restoredState?.experienceId === draft.experience.id ? options.restoredState : undefined;
    const restoredIndex = selectableSteps && restored?.selectedStepId ? selectableSteps.findIndex(step => step.id === restored.selectedStepId) : -1;
    this.stepIndex = selectableSteps ? restoredIndex >= 0 ? restoredIndex : clampStep(options.requestedStep ?? 0, selectableSteps.length) : 0;
    this.currentPath = currentPagePath();
    const restoredMode = (restored as { mode?: string } | undefined)?.mode;
    this.mode = restoredMode === "select" ? "target" : restoredMode === "design" || restoredMode === "target" || restoredMode === "navigate" || restoredMode === "preview" ? restoredMode : draft.experience.builderMode === "onsite" ? "design" : "target";
    this.updateContinuation();
    this.mount();
    this.expiryTimer = window.setTimeout(() => this.expireSession(), Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    this.validationTimer = window.setInterval(() => { void bridge.load().catch(error => { if (this.bridge === bridge && error instanceof EditorSessionExpiredError) this.expireSession(); }); }, 15_000);
    return true;
  }

  private mount(): void {
    if (!this.draft || !this.definition) return;
    this.host = document.createElement("div");
    this.host.dataset.movcuesEditor = "";
    this.host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLE}${GUIDE_STYLE}</style>${this.panelMarkup(this.draft)}`;
    if (this.guide) this.root.querySelector('[data-inspector="step"]')?.insertAdjacentHTML("beforeend", this.guideBehaviorMarkup());
    if (this.guide) this.root.querySelectorAll("[data-guide] .history-row:not([data-step-bar-actions])").forEach(actions => this.root!.querySelector('[data-inspector="step"]')?.append(actions));
    (document.body ?? document.documentElement).appendChild(this.host);

    if (this.survey && this.draft.experience.builderMode === "onsite") this.surveyEditor = new SurveyEditor(this.root, this.survey, {
      index: () => this.stepIndex, composer: () => this.compositionEditor, canEdit: () => this.mode === "design" && this.saveState !== "expired",
      flush: () => this.flushContent(), changed: () => this.changed(false), error: errors => this.showValidation(errors),
      stepsChanged: index => { this.compositionEditor?.destroy(); this.compositionEditor = null; this.compositionSelection = null; this.stepIndex = index; this.changed(); this.refreshStepBar(); },
    });
    if(this.checklist)this.checklistEditor=new ChecklistEditor(this.root,this.checklist,this.draft.references??{guides:[],segments:[]},{
      composer:()=>this.compositionEditor,canEdit:()=>this.mode==="design"&&this.saveState!=="expired",flush:()=>this.flushContent(),changed:()=>this.changed(false),render:()=>{this.renderPreview();this.syncPanel();},error:errors=>this.showValidation(errors)
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
    window.visualViewport?.addEventListener("resize", this.fitPanel);
    window.visualViewport?.addEventListener("scroll", this.fitPanel);
    window.addEventListener("resize", this.fitPanel);
    this.fitPanel();
  }

  private panelMarkup(draft: EditorDraft): string {
    const selectableSteps = this.guide?.steps ?? this.survey?.steps;
    const aiEligible = draft.experience.builderMode === "onsite" && ["guide", "widget", "checklist"].includes(draft.experience.kind);
    const guideMarkup = selectableSteps ? `<section class="section step-navigator" data-guide><span class="step-drag-handle" data-step-drag-handle title="Drag step bar" aria-hidden="true">⠿</span><div class="content-heading"><div><div class="eyebrow">${this.guide ? "Guide steps" : "Survey steps"}</div><div class="muted" data-step-label></div></div>${this.guide ? '<div class="history-row"><button type="button" class="secondary-button compact" data-add-step="modal">＋ Modal</button><button type="button" class="secondary-button compact" data-add-step="anchored_card">＋ Anchored</button></div>' : ""}</div><div class="step-flow" data-step-flow>${this.stepButtons()}</div>${this.guide ? `<div class="history-row" data-step-bar-actions><button type="button" class="secondary-button compact step-bar-action" data-add-current-step aria-label="Add step" title="Add a ${getGuideStepPattern(this.guide.steps[this.stepIndex]) === "modal" ? "Modal" : "Anchored"} step">＋</button><button type="button" class="secondary-button compact step-bar-action step-bar-delete" data-delete-step aria-label="Delete selected step" title="Delete selected step"${this.guide.steps.length <= 1 ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M9 7l1-2h4l1 2m-9 0 1 13h10l1-13"/></svg></button></div><div class="history-row"><button type="button" class="secondary-button compact" data-duplicate-step>Duplicate</button><button type="button" class="secondary-button compact" data-step-left>←</button><button type="button" class="secondary-button compact" data-step-right>→</button></div>` : ""}</section>` : "";
    const designDisabled = draft.experience.builderMode !== "onsite" ? " disabled title=\"Content is edited in the GrapesJS Dashboard Builder\"" : "";
    return `<div class="editor-toolbar" data-editor-toolbar role="region" aria-label="Movcues editing controls">
      <header data-drag-handle>
        <div class="header-copy"><strong>Movcues Live Editor</strong><span>${escapeText(draft.experience.name)}</span><small><i></i> Connected · <span data-save-state>Draft saved</span></small></div>
        <div class="header-actions"><button type="button" data-global-undo aria-label="Undo">↶</button><button type="button" data-global-redo aria-label="Redo">↷</button><button type="button" data-save aria-label="Save draft">Save</button><button type="button" data-move-side aria-label="Move inspector to other side">⇄</button><button type="button" data-return-dashboard aria-label="Return to dashboard">↗</button><button type="button" data-minimize aria-label="Toggle inspector" aria-expanded="true">☷</button><button type="button" data-close aria-label="Close editor">×</button></div>
      </header>
        <div class="modebar"><button type="button" data-mode="design"${designDisabled}>Design</button><button type="button" data-mode="target">Target</button><button type="button" data-mode="navigate">Navigate</button><button type="button" data-mode="preview">Preview</button></div>
        <div class="guide-preview-controls" data-guide-preview hidden><button type="button" data-preview-start>Start Guide</button><button type="button" data-preview-back aria-label="Previous preview step">←</button><button type="button" data-preview-next aria-label="Next preview step">→</button><button type="button" data-preview-reset>Reset</button><button type="button" data-preview-test hidden>Test event</button><span data-preview-step></span><small data-trigger-status role="status" aria-live="polite"></small></div>
      </div>
      ${guideMarkup}
      <aside aria-label="Contextual inspector"><main>
        <nav class="inspector-tabs" aria-label="Inspector mode"><button type="button" class="active" data-inspector-tab="properties">Properties</button><button type="button" data-inspector-tab="theme">Theme</button><button type="button" data-inspector-tab="ai"${aiEligible ? "" : " disabled"}>AI</button></nav>
        <section class="section ai-panel" data-ai-panel hidden>
          <div class="content-heading"><div><div class="eyebrow">Movcues AI</div><strong>Design assistant</strong></div><button type="button" class="secondary-button compact" data-ai-cancel hidden>Stop</button></div>
          <p class="muted" data-ai-context>Choose an element or ask about the whole widget.</p>
          <div class="ai-chat-history" data-ai-history aria-label="AI chat history" aria-live="polite"></div>
          <form class="ai-composer" data-ai-form><textarea data-ai-prompt maxlength="4000" rows="3" placeholder="Describe the change…"></textarea><button type="submit" class="secondary-button" data-ai-send>Send</button></form>
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
        <section class="section theme-panel" data-theme-section hidden>
          <div class="content-heading"><div><div class="eyebrow">Design system</div><strong>Experience theme</strong></div><button type="button" class="secondary-button compact" data-theme-reset>Reset to theme</button></div>
          <label>Base style<select data-theme-source><option value="template">Template defaults</option><option value="site">Match my website</option><option value="preset" disabled>Saved style</option><option value="minimal">Minimal</option><option value="modern">Modern</option><option value="soft">Soft</option><option value="dark">Dark</option></select></label>
          <label>Saved style<select data-saved-style><option value="">Choose saved style…</option>${(draft.references?.stylePresets??[]).map(style=>`<option value="${escapeText(style.id)}">${escapeText(style.name)}</option>`).join("")}</select></label>
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

  private stepButtons(): string {
    const steps = this.guide?.steps ?? this.survey?.steps ?? [];
    return steps.map((step, index) => `<button class="step" type="button" data-step="${index}" aria-label="Open step ${index + 1}"><span>${index + 1}</span><small>${escapeText("label" in step && typeof step.label === "string" && step.label.trim() ? step.label : "content" in step && step.content.heading.trim() ? step.content.heading : `Step ${index + 1}`)}</small><i data-step-icon>○</i></button>`).join("");
  }

  private bindPanel(): void {
    const root = this.root!;
    root.querySelectorAll<HTMLButtonElement>("[data-inspector-tab]").forEach(button => button.addEventListener("click", () => this.setInspectorTab(button.dataset.inspectorTab as "properties" | "theme" | "ai")));
    root.querySelector<HTMLFormElement>("[data-ai-form]")?.addEventListener("submit", event => { event.preventDefault(); void this.sendAiPrompt(); });
    root.querySelector<HTMLButtonElement>("[data-ai-cancel]")?.addEventListener("click", () => this.cancelAiRequest());
    root.querySelector<HTMLButtonElement>("[data-ai-target]")?.addEventListener("click", () => this.resolveAiGuideTarget());
    root.querySelector<HTMLButtonElement>("[data-ai-preview]")?.addEventListener("click", () => this.checklist ? this.previewAiChecklistProposal() : this.survey ? this.previewAiSurveyProposal() : this.guide ? this.previewAiGuideProposal() : this.previewAiWidgetSourceProposal());
    root.querySelector<HTMLButtonElement>("[data-ai-apply]")?.addEventListener("click", () => this.applyAiProposal());
    root.querySelector<HTMLButtonElement>("[data-ai-discard]")?.addEventListener("click", () => this.discardAiProposal());
    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => button.addEventListener("click", () => this.setMode(button.dataset.mode as EditorMode)));
    root.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach(button => button.addEventListener("click", () => { if (this.mode !== "target") this.setMode("target"); else this.startPicker(); }));
    root.querySelector<HTMLButtonElement>("[data-pick-layer]")?.addEventListener("click", () => this.startLayerPicker());
    root.querySelectorAll<HTMLButtonElement>("[data-step]").forEach(button => button.addEventListener("click", () => this.switchStep(Number(button.dataset.step))));
    root.querySelector<HTMLButtonElement>("[data-minimize]")?.addEventListener("click", () => {
      const aside = root.querySelector("aside")!; aside.classList.toggle("minimized");
      root.querySelector<HTMLButtonElement>("[data-minimize]")!.setAttribute("aria-expanded", String(!aside.classList.contains("minimized")));
    });
    root.querySelector<HTMLButtonElement>("[data-save]")?.addEventListener("click", () => void this.persist());
    root.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", () => void this.close());
    root.querySelector<HTMLButtonElement>("[data-return-dashboard]")?.addEventListener("click", () => { window.opener?.focus(); void this.close(); });
    root.querySelector<HTMLButtonElement>("[data-retry-save]")?.addEventListener("click", () => void this.persist());
    root.querySelector<HTMLButtonElement>("[data-reload-draft]")?.addEventListener("click", () => { if (window.confirm("Reloading discards local edits. Copy / Export them first if you need them. Reload latest?")) { this.recoveryDraft = null; window.location.reload(); } });
    root.querySelector<HTMLButtonElement>("[data-export-draft]")?.addEventListener("click", () => this.exportRecovery());
    root.querySelector<HTMLButtonElement>("[data-discard-draft]")?.addEventListener("click", () => { if (window.confirm("Discard unsaved edits and close?")) { this.recoveryDraft = null; this.destroy(); } });
    root.querySelector<HTMLButtonElement>("[data-reset-preview]")?.addEventListener("click", () => this.guide ? this.startGuidePreview() : this.renderPreview());
    root.querySelector<HTMLButtonElement>("[data-global-undo]")?.addEventListener("click", () => this.globalUndo());
    root.querySelector<HTMLButtonElement>("[data-global-redo]")?.addEventListener("click", () => this.globalRedo());
    root.querySelector<HTMLButtonElement>("[data-move-side]")?.addEventListener("click", () => root.querySelector("aside")?.classList.toggle("left-side"));
    root.querySelector<HTMLButtonElement>("[data-select-step]")?.addEventListener("click", () => this.compositionEditor?.selectStep());
    root.querySelectorAll<HTMLButtonElement>("[data-edge]").forEach(button => button.addEventListener("click", () => this.compositionEditor?.addEdge(button.dataset.edge as "top" | "right" | "bottom" | "left")));
    root.querySelectorAll<HTMLButtonElement>("[data-add-step]").forEach(button => button.addEventListener("click", () => this.addGuideStep(button.dataset.addStep as "modal" | "anchored_card")));
    root.querySelector<HTMLButtonElement>("[data-add-current-step]")?.addEventListener("click", () => this.addGuideStep(getGuideStepPattern(this.guide!.steps[this.stepIndex])));
    root.querySelector<HTMLButtonElement>("[data-duplicate-step]")?.addEventListener("click", () => this.duplicateGuideStep());
    root.querySelector<HTMLButtonElement>("[data-delete-step]")?.addEventListener("click", () => this.deleteGuideStep());
    root.querySelector<HTMLButtonElement>("[data-step-left]")?.addEventListener("click", () => this.moveGuideStep(-1));
    root.querySelector<HTMLButtonElement>("[data-step-right]")?.addEventListener("click", () => this.moveGuideStep(1));
    root.querySelector<HTMLInputElement>("[data-step-name]")?.addEventListener("change", event => { if (!this.guide) return; this.guide.steps[this.stepIndex].label = (event.currentTarget as HTMLInputElement).value.trim().slice(0, 80) || undefined; this.changed(); this.refreshStepBar(); });
    root.querySelector<HTMLButtonElement>("[data-edit-component]")?.addEventListener("click", () => { this.compositionEditor?.editSelected(); this.contentEditor?.editSelected(); });
    root.querySelectorAll<HTMLButtonElement>("[data-format]").forEach(button => button.addEventListener("click", () => { this.compositionEditor?.formatInline(button.dataset.format as "strong" | "em" | "u"); this.contentEditor?.formatInline(button.dataset.format as "strong" | "em" | "u"); this.syncContentInspector(); }));
    root.querySelectorAll<HTMLButtonElement>("[data-list]").forEach(button => button.addEventListener("click", () => { this.compositionEditor?.toggleList(button.dataset.list as "ul" | "ol"); this.contentEditor?.toggleList(button.dataset.list as "ul" | "ol"); this.syncContentInspector(); }));
    root.querySelector<HTMLSelectElement>("[data-text-align]")?.addEventListener("change", event => { const value = (event.currentTarget as HTMLSelectElement).value as "left" | "center" | "right"; this.compositionEditor?.setAlignment(value); this.contentEditor?.setAlignment(value); this.syncContentInspector(); });
    root.querySelector<HTMLButtonElement>("[data-apply-link]")?.addEventListener("click", () => { const input = root.querySelector<HTMLInputElement>("[data-link-url]"); const applied = input ? (this.compositionEditor?.applyLink(input.value) ?? this.contentEditor?.applyLink(input.value)) : false; if (input && !applied) { input.setCustomValidity("Select text in a heading or body and use an HTTP(S), email, phone, relative, or hash URL."); input.reportValidity(); } else input?.setCustomValidity(""); this.syncContentInspector(); });
    root.querySelector<HTMLButtonElement>("[data-apply-image]")?.addEventListener("click", () => { const source = root.querySelector<HTMLInputElement>("[data-image-src]"); const alt = root.querySelector<HTMLInputElement>("[data-image-alt]"); if (source && alt && !this.contentEditor?.updateImage(source.value, alt.value)) source.setCustomValidity("Use an HTTP(S), relative, or supported data image URL."); else source?.setCustomValidity(""); this.syncContentInspector(); });
    root.querySelector<HTMLButtonElement>("[data-undo]")?.addEventListener("click", () => { this.contentEditor?.undo(); this.syncContentInspector(); });
    root.querySelector<HTMLButtonElement>("[data-redo]")?.addEventListener("click", () => { this.contentEditor?.redo(); this.syncContentInspector(); });
    root.addEventListener("pointerdown", event => { this.contentEditor?.rememberSelection(); this.compositionEditor?.rememberSelection(); if (event.target instanceof Element && event.target.closest("[data-v2-format],[data-v2-list]")) event.preventDefault(); }, true);
    root.addEventListener("focusin", () => { this.contentEditor?.rememberSelection(); this.compositionEditor?.rememberSelection(); }, true);
    root.addEventListener("keydown", rawEvent => {
      const event = rawEvent as KeyboardEvent;
      if (event.key === "Escape") { this.contentEditor?.editSelected(); event.preventDefault(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void this.persist(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); if (event.shiftKey) this.globalRedo(); else this.globalUndo(); }
    });
    this.bindDrag();
    this.bindStepBarDrag();
    this.bindThemeControls();

    this.bindCompositionInspector(); this.bindGuideBehavior();

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

  private bindCompositionInspector(): void {
    const root = this.root!;
    const change = (selector: string, run: (value: string) => void) => root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.addEventListener("change", event => run((event.currentTarget as HTMLInputElement | HTMLSelectElement).value));
    const number = (value: string, fallback: number) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; };
    change("[data-cell-direction]", value => this.compositionEditor?.updateCell({ direction: value as OnsiteCell["direction"] }));
    change("[data-cell-size]", value => { const cell = this.compositionEditor?.getSelectedCell(); if (!cell) return; this.compositionEditor?.updateCell({ sizing: value === "fixed" ? { mode: "fixed", value: 160 } : value === "hug" ? { mode: "hug" } : { mode: "flexible", weight: 1 } }); });
    change("[data-cell-fixed]", value => this.compositionEditor?.updateCell({ sizing: { mode: "fixed", value: Math.max(24, Math.min(1_200, number(value, 160))) } }));
    change("[data-cell-align]", value => this.compositionEditor?.updateCell({ align: value as OnsiteCell["align"] }));
    change("[data-cell-gap]", value => this.compositionEditor?.updateCell({ gap: Math.max(0, Math.min(96, number(value, 0))) }));
    change("[data-cell-padding]", value => { const padding = Math.max(0, Math.min(128, number(value, 0))); this.compositionEditor?.updateCell({ padding: { top: padding, right: padding, bottom: padding, left: padding } }); });
    change("[data-cell-background]", value => { const cell = this.compositionEditor?.getSelectedCell(); this.compositionEditor?.updateCell({ style: { ...cell?.style, background: value } }); });
    change("[data-cell-border]", value => { const cell = this.compositionEditor?.getSelectedCell(); this.compositionEditor?.updateCell({ style: { ...cell?.style, borderWidth: Math.max(0, Math.min(16, number(value, 0))) } }); });
    change("[data-cell-radius]", value => { const cell = this.compositionEditor?.getSelectedCell(); this.compositionEditor?.updateCell({ style: { ...cell?.style, borderRadius: Math.max(0, Math.min(100, number(value, 0))) } }); });
    root.querySelector<HTMLInputElement>("[data-cell-stack]")?.addEventListener("change", event => this.compositionEditor?.updateCell({ responsiveStack: (event.currentTarget as HTMLInputElement).checked }));
    change("[data-block-align]", value => this.compositionEditor?.updateBlock({ align: value as "left" | "center" | "right" } as Partial<OnsiteBlock>));
    change("[data-block-font-size]", value => this.compositionEditor?.updateBlock({ fontSize: Math.max(10, Math.min(72, number(value, 15))) } as Partial<OnsiteBlock>));
    change("[data-block-line-height]", value => this.compositionEditor?.updateBlock({ lineHeight: Math.max(.9, Math.min(3, number(value, 1.5))) } as Partial<OnsiteBlock>));
    change("[data-block-weight]", value => this.compositionEditor?.updateBlock({ weight: number(value, 400) as 400 | 500 | 600 | 700 } as Partial<OnsiteBlock>));
    change("[data-block-color]", value => this.compositionEditor?.updateBlock({ color: value } as Partial<OnsiteBlock>));
    change("[data-button-label]", value => this.compositionEditor?.updateBlock({ label: value.trim().slice(0, 80) || "Button" } as Partial<OnsiteBlock>));
    change("[data-button-variant]", value => this.compositionEditor?.updateBlock({ variant: value as "primary" | "secondary" | "outline" } as Partial<OnsiteBlock>));
    change("[data-button-width]", value => this.compositionEditor?.updateBlock({ width: value as "hug" | "full" } as Partial<OnsiteBlock>));
    change("[data-button-background]", value => this.compositionEditor?.updateBlock({ background: value } as Partial<OnsiteBlock>));
    change("[data-button-color]", value => this.compositionEditor?.updateBlock({ color: value } as Partial<OnsiteBlock>));
    change("[data-button-padding-x]", value => this.compositionEditor?.updateBlock({ paddingX: Math.max(4, Math.min(48, number(value, 16))) } as Partial<OnsiteBlock>));
    change("[data-button-padding-y]", value => this.compositionEditor?.updateBlock({ paddingY: Math.max(4, Math.min(32, number(value, 9))) } as Partial<OnsiteBlock>));
    change("[data-button-radius]", value => this.compositionEditor?.updateBlock({ radius: Math.max(0, Math.min(48, number(value, 8))) } as Partial<OnsiteBlock>));
    change("[data-button-action]", value => { if (value === "open_url") this.compositionEditor?.updateButtonAction({ type: "open_url", url: "https://example.com" }); else if (value === "track_event") this.compositionEditor?.updateButtonAction({ type: "track_event", eventName: "button_clicked" }); else this.compositionEditor?.updateButtonAction({ type: value as "dismiss" | "next_step" | "previous_step" }); });
    change("[data-button-url]", value => this.compositionEditor?.updateButtonAction({ type: "open_url", url: value.trim() }));
    change("[data-button-event]", value => this.compositionEditor?.updateButtonAction({ type: "track_event", eventName: value.trim() }));
    change("[data-v2-image-src]", value => this.compositionEditor?.setImageSource(value.trim()));
    root.querySelector<HTMLButtonElement>("[data-choose-image]")?.addEventListener("click", () => this.compositionEditor?.chooseImageFile());
    change("[data-v2-image-alt]", value => this.compositionEditor?.updateBlock({ alt: value.slice(0, 500) } as Partial<OnsiteBlock>));
    change("[data-image-fit]", value => this.compositionEditor?.updateBlock({ fit: value as "cover" | "contain" } as Partial<OnsiteBlock>));
    change("[data-image-width]", value => this.compositionEditor?.updateBlock({ width: Math.max(1, Math.min(100, number(value, 100))) } as Partial<OnsiteBlock>));
    change("[data-image-radius]", value => this.compositionEditor?.updateBlock({ radius: Math.max(0, Math.min(100, number(value, 0))) } as Partial<OnsiteBlock>));
    change("[data-divider-thickness]", value => this.compositionEditor?.updateBlock({ thickness: Math.max(1, Math.min(16, number(value, 1))) } as Partial<OnsiteBlock>));
    change("[data-divider-color]", value => this.compositionEditor?.updateBlock({ color: value } as Partial<OnsiteBlock>));
    change("[data-spacer-size]", value => this.compositionEditor?.updateBlock({ size: Math.max(4, Math.min(240, number(value, 24))) } as Partial<OnsiteBlock>));
    change("[data-icon-name]", value => this.compositionEditor?.updateBlock({ icon: value as Extract<OnsiteBlock, { type: "icon" }>["icon"] } as Partial<OnsiteBlock>));
    change("[data-icon-size]", value => this.compositionEditor?.updateBlock({ size: Math.max(12, Math.min(96, number(value, 28))) } as Partial<OnsiteBlock>));
    change("[data-icon-color]", value => this.compositionEditor?.updateBlock({ color: value } as Partial<OnsiteBlock>));
    root.querySelectorAll<HTMLButtonElement>("[data-v2-format]").forEach(button => button.addEventListener("click", () => this.compositionEditor?.formatInline(button.dataset.v2Format as "strong" | "em" | "u")));
    root.querySelectorAll<HTMLButtonElement>("[data-v2-list]").forEach(button => button.addEventListener("click", () => this.compositionEditor?.toggleList(button.dataset.v2List as "ul" | "ol")));
    root.querySelector<HTMLButtonElement>("[data-v2-apply-link]")?.addEventListener("click", () => { const input = root.querySelector<HTMLInputElement>("[data-v2-link-url]"); if (input && !this.compositionEditor?.applyLink(input.value)) { input.setCustomValidity("Use an HTTP(S), email, phone, relative, or hash URL."); input.reportValidity(); } else input?.setCustomValidity(""); });
    root.querySelector<HTMLButtonElement>("[data-v2-undo]")?.addEventListener("click", () => this.compositionEditor?.undo());
    root.querySelector<HTMLButtonElement>("[data-v2-redo]")?.addEventListener("click", () => this.compositionEditor?.redo());
  }

  private ensureThemeState(): VisualThemeState {
    const owner = (this.checklist ?? this.definition!) as EditorChecklistDefinition | EditorDefinition;
    if (owner.visualTheme) return owner.visualTheme;
    const design = this.checklist?.design ?? this.definition!.design;
    const base = cloneOnsite(design.theme.siteTheme ?? EXPERIENCE_PRESETS.modern);
    base.colors.background = design.theme.background; base.colors.text = design.theme.foreground; base.colors.primary = design.theme.primary;
    owner.visualTheme = { source: "template", templateTokens: cloneOnsite(base), baseTokens: cloneOnsite(base), overrides: {} };
    if (this.checklist) this.definition!.visualTheme = owner.visualTheme;
    return owner.visualTheme;
  }

  private applyVisualTheme(render = true): void {
    const state=this.ensureThemeState(),tokens=resolvedTheme(state),radius=tokens.radii.md<=6?"sm":tokens.radii.md>=18?"lg":"md";
    const design=this.checklist?.design??this.definition!.design;
    design.theme={background:tokens.colors.background,foreground:tokens.colors.text,primary:tokens.colors.primary,borderRadius:radius,...(state.overrides.spacing!==undefined?{spacing:state.overrides.spacing}:{}),siteTheme:tokens};
    if(this.checklist){this.checklist.design=design;this.checklist.visualTheme=state;this.definition!.design=design;this.definition!.visualTheme=state;}
    if(render)this.changed();
  }

  private bindThemeControls():void{
    const root=this.root!;const state=this.ensureThemeState();this.applyVisualTheme(false);
    root.querySelector<HTMLSelectElement>('[data-theme-source]')?.addEventListener('change',event=>{const value=(event.currentTarget as HTMLSelectElement).value,state=this.ensureThemeState();if(value==='template'){state.source='template';state.baseTokens=cloneOnsite(state.templateTokens);delete state.preset;}else if(value==='site'){const site=this.draft?.references?.siteTheme;if(!site){this.setText('[data-style-status]','No captured website theme is available.');return;}state.source='site';state.baseTokens=cloneOnsite(site);delete state.preset;}else{state.source='preset';state.preset=value as VisualPresetId;state.baseTokens=cloneOnsite(EXPERIENCE_PRESETS[state.preset]);}this.applyVisualTheme();});
    const override=(key:keyof VisualThemeState['overrides'],value:string|number|undefined)=>{const next=this.ensureThemeState();if(value===''||value===undefined)delete next.overrides[key];else (next.overrides as Record<string,unknown>)[key]=value;this.applyVisualTheme();};
    const color=(selector:string,key:keyof VisualThemeState['overrides'])=>root.querySelector<HTMLInputElement>(selector)?.addEventListener('change',event=>override(key,(event.currentTarget as HTMLInputElement).value));
    const textInput=(selector:string,key:keyof VisualThemeState['overrides'])=>root.querySelector<HTMLInputElement>(selector)?.addEventListener('change',event=>override(key,(event.currentTarget as HTMLInputElement).value.trim()));
    const number=(selector:string,key:keyof VisualThemeState['overrides'],min:number,max:number)=>root.querySelector<HTMLInputElement>(selector)?.addEventListener('change',event=>{const value=Number((event.currentTarget as HTMLInputElement).value);override(key,Number.isFinite(value)?Math.max(min,Math.min(max,value)):undefined);});
    color('[data-theme-primary]','primary');color('[data-theme-secondary]','secondary');color('[data-theme-background]','background');color('[data-theme-text]','text');textInput('[data-theme-body-font]','bodyFontFamily');textInput('[data-theme-heading-font]','headingFontFamily');number('[data-theme-body-size]','bodyFontSize',8,72);number('[data-theme-heading-size]','headingFontSize',10,72);number('[data-theme-radius]','radius',0,48);number('[data-theme-button-radius]','buttonRadius',0,48);number('[data-theme-spacing]','spacing',0,64);
    root.querySelector<HTMLSelectElement>('[data-theme-shadow]')?.addEventListener('change',event=>{const mode=(event.currentTarget as HTMLSelectElement).value;if(mode==='theme')return override('shadow',undefined);if(mode==='none')return override('shadow',{x:0,y:0,blur:0,spread:0,color:'transparent'} as never);const source=this.ensureThemeState().baseTokens.shadows.md;override('shadow',{...source,y:mode==='soft'?Math.min(source.y,10):Math.max(source.y,20),blur:mode==='soft'?Math.min(source.blur,28):Math.max(source.blur,56)} as never);});
    root.querySelector('[data-theme-reset]')?.addEventListener('click',()=>{this.ensureThemeState().overrides={};this.applyVisualTheme();this.setText('[data-style-status]','Experience overrides reset. Block and cell customizations were preserved.');});
    root.querySelector<HTMLSelectElement>('[data-saved-style]')?.addEventListener('change',event=>{const style=this.draft?.references?.stylePresets?.find(item=>item.id===(event.currentTarget as HTMLSelectElement).value);if(!style)return;const next=this.ensureThemeState();next.source='preset';delete next.preset;next.baseTokens=cloneOnsite(style.tokens);this.applyVisualTheme();this.setText('[data-style-status]',`Applied ${style.name}.`);});
    root.querySelector('[data-style-save]')?.addEventListener('click',()=>void this.saveCurrentStyle());root.querySelector('[data-style-rename]')?.addEventListener('click',()=>void this.renameCurrentStyle());root.querySelector('[data-style-delete]')?.addEventListener('click',()=>void this.deleteCurrentStyle());
  }

  private async saveCurrentStyle():Promise<void>{const name=this.root?.querySelector<HTMLInputElement>('[data-style-name]')?.value.trim();if(!name||!this.bridge)return this.setText('[data-style-status]','Enter a style name.');try{const preset=await this.bridge.saveStyle(name,resolvedTheme(this.ensureThemeState()));const list=this.draft!.references!.stylePresets??(this.draft!.references!.stylePresets=[]);list.unshift(preset);this.refreshStyleOptions(preset.id);this.setText('[data-style-status]','Style saved for this site.');}catch(error){this.setText('[data-style-status]',error instanceof Error?error.message:'Style could not be saved.');}}
  private async renameCurrentStyle():Promise<void>{const select=this.root?.querySelector<HTMLSelectElement>('[data-saved-style]'),name=this.root?.querySelector<HTMLInputElement>('[data-style-name]')?.value.trim();if(!select?.value||!name||!this.bridge)return this.setText('[data-style-status]','Choose a saved style and enter a new name.');try{const updated=await this.bridge.renameStyle(select.value,name),style=this.draft!.references!.stylePresets?.find(item=>item.id===updated.id);if(style)style.name=updated.name;this.refreshStyleOptions(updated.id);this.setText('[data-style-status]','Style renamed.');}catch{this.setText('[data-style-status]','Style could not be renamed.');}}
  private async deleteCurrentStyle():Promise<void>{const select=this.root?.querySelector<HTMLSelectElement>('[data-saved-style]');if(!select?.value||!this.bridge)return this.setText('[data-style-status]','Choose a saved style first.');try{await this.bridge.deleteStyle(select.value);this.draft!.references!.stylePresets=this.draft!.references!.stylePresets?.filter(item=>item.id!==select.value)??[];this.refreshStyleOptions();this.setText('[data-style-status]','Style deleted.');}catch{this.setText('[data-style-status]','Style could not be deleted.');}}
  private refreshStyleOptions(selected=''):void{const select=this.root?.querySelector<HTMLSelectElement>('[data-saved-style]');if(!select)return;select.innerHTML='<option value="">Choose saved style…</option>'+((this.draft?.references?.stylePresets??[]).map(style=>`<option value="${escapeText(style.id)}">${escapeText(style.name)}</option>`).join(''));select.value=selected;}

  private syncThemeInspector():void{if(!this.root||!this.definition)return;const state=this.ensureThemeState(),tokens=resolvedTheme(state);this.setValue('[data-theme-source]',state.source==='preset'&&state.preset?state.preset:state.source);this.setValue('[data-theme-primary]',tokens.colors.primary);this.setValue('[data-theme-secondary]',tokens.colors.surface);this.setValue('[data-theme-background]',tokens.colors.background);this.setValue('[data-theme-text]',tokens.colors.text);this.setValue('[data-theme-body-font]',tokens.typography.bodyFontFamily);this.setValue('[data-theme-heading-font]',tokens.typography.headingFontFamily);this.setValue('[data-theme-body-size]',String(tokens.typography.bodyFontSize));this.setValue('[data-theme-heading-size]',String(tokens.typography.headingFontSize));this.setValue('[data-theme-radius]',String(state.overrides.radius??tokens.radii.md));this.setValue('[data-theme-button-radius]',String(state.overrides.buttonRadius??tokens.radii.md));this.setValue('[data-theme-shadow]',state.overrides.shadow?.color==='transparent'?'none':state.overrides.shadow?'strong':'theme');this.setValue('[data-theme-spacing]',String(state.overrides.spacing??16));this.root.querySelectorAll<HTMLButtonElement>('[data-device]').forEach(button=>button.classList.toggle('active',button.dataset.device===this.previewDevice));}

  private guideBehaviorMarkup(): string {
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

  private bindGuideBehavior(): void {
    if (!this.guide || !this.root) return;
    const change = (selector: string, run: (value: string) => void) => this.root!.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.addEventListener("change", event => { run((event.currentTarget as HTMLInputElement).value); this.changed(); });
    const bounded = (value: string, min: number, max: number, fallback: number) => Math.max(min, Math.min(max, Math.round(numberValue(value, fallback))));
    change("[data-guide-trigger]", value => {
      const step = this.guide!.steps[this.stepIndex]; if ((value === "element_click" || value === "element_hover") && !guideStepRequiresTarget(step)) return;
      const old = step.advance; const target = old?.type === "element_click" || old?.type === "element_hover" ? old.target : undefined;
      step.advance = value === "custom_event" ? { type: value, eventName: old?.type === value ? old.eventName : "" } : value === "route" ? { type: value, pageRules: old?.type === value ? old.pageRules : [{ id: editorId("rule"), kind: "include", operator: "equals", value: currentPagePath() }] } : value === "element_hover" ? { type: value, durationMs: old?.type === value ? old.durationMs : 500, ...(target ? { target } : {}) } : value === "element_click" ? { type: value, ...(target ? { target } : {}) } : { type: "button" };
    });
    change("[data-guide-hover]", value => { const advance = this.guide!.steps[this.stepIndex].advance; if (advance?.type === "element_hover") advance.durationMs = bounded(value, 100, 60_000, 500); });
    change("[data-guide-event]", value => { const advance = this.guide!.steps[this.stepIndex].advance; if (advance?.type === "custom_event") advance.eventName = value.trim(); });
    const route = () => { const advance = this.guide!.steps[this.stepIndex].advance; return advance?.type === "route" ? advance.pageRules.find(rule => rule.kind === "include") : undefined; };
    change("[data-guide-route]", value => { const rule = route(); if (rule) rule.value = value.trim(); });
    change("[data-guide-route-operator]", value => { const rule = route(); if (rule) rule.operator = value as PageRule["operator"]; });
    change("[data-guide-delay]", value => { const step = this.guide!.steps[this.stepIndex]; step.presentation = { ...step.presentation, delayMs: bounded(value, 0, 30_000, 0) }; });
    const missing = () => { const step = this.guide!.steps[this.stepIndex]; return step.presentation = { ...step.presentation, missingTarget: step.presentation?.missingTarget ?? { action: "wait", timeoutMs: 5000 } }; };
    change("[data-guide-missing-action]", value => { missing().missingTarget!.action = value as "wait" | "skip" | "dismiss"; });
    change("[data-guide-timeout]", value => { missing().missingTarget!.timeoutMs = bounded(value, 100, 60_000, 5000); });
    this.root.querySelector<HTMLInputElement>("[data-guide-use-position]")?.addEventListener("change", event => { const advance = this.guide!.steps[this.stepIndex].advance; if ((event.currentTarget as HTMLInputElement).checked && (advance?.type === "element_click" || advance?.type === "element_hover")) { delete advance.target; this.changed(); } else this.pickGuideInteraction(); });
    this.root.querySelector("[data-guide-pick-interaction]")?.addEventListener("click", () => this.pickGuideInteraction());
    this.root.querySelector<HTMLInputElement>("[data-guide-dismissible]")?.addEventListener("change", event => { this.guide!.steps[this.stepIndex].behavior.dismissible = (event.currentTarget as HTMLInputElement).checked; this.changed(); });
    this.root.querySelector("[data-preview-start]")?.addEventListener("click", () => this.startGuidePreview());
    this.root.querySelector("[data-preview-reset]")?.addEventListener("click", () => this.startGuidePreview());
    this.root.querySelector("[data-preview-next]")?.addEventListener("click", () => this.advanceGuidePreview(1));
    this.root.querySelector("[data-preview-back]")?.addEventListener("click", () => this.advanceGuidePreview(-1));
    this.root.querySelector("[data-preview-test]")?.addEventListener("click", () => { const advance = this.guide?.steps[this.stepIndex].advance; if (this.mode === "preview" && !this.guidePreviewComplete && (advance?.type === "custom_event" || advance?.type === "route")) this.advanceGuidePreview(1); });
  }

  private pickGuideInteraction(): void {
    const step = this.guide?.steps[this.stepIndex]; if (!step || !this.flushContent() || !(step.advance?.type === "element_click" || step.advance?.type === "element_hover")) return;
    const generation = ++this.selectionGeneration; this.picker.cancel();
    this.contentEditor?.destroy(); this.contentEditor = null; this.compositionEditor?.destroy(); this.compositionEditor = null; this.previewGeneration++; this.preview.destroy(); this.previewRendered = false;
    this.setText("[data-mode-hint]", "Select the website element that advances this step. Its positioning target stays unchanged. Escape cancels.");
    void this.picker.pick().then(target => {
      if (generation !== this.selectionGeneration || this.guide?.steps[this.stepIndex]?.id !== step.id) return;
      if (target && (step.advance?.type === "element_click" || step.advance?.type === "element_hover")) { step.advance.target = { ...target, targetContext: { pagePath: currentPagePath() } }; this.changed(); }
      else { this.renderPreview(); this.syncPanel(); }
    });
  }

  private syncGuideBehavior(): void {
    if (!this.root) return;
    const controls = this.root.querySelector<HTMLElement>("[data-guide-preview]"); if (controls) controls.hidden = !this.guide || this.mode !== "preview";
    if (!this.guide) return;
    const step = this.guide.steps[this.stepIndex]; const advance = step.advance; const type = advance?.type ?? "button"; const anchored = guideStepRequiresTarget(step);
    this.setValue("[data-guide-trigger]", type);
    this.root.querySelectorAll<HTMLOptionElement>('[data-guide-trigger] option').forEach(option => { option.disabled = !anchored && ["element_click", "element_hover"].includes(option.value); });
    this.setText("[data-guide-trigger-help]", type === "button" ? "Buttons configured as Next step advance this Guide. Website click and hover triggers are available on Anchored Cards." : type === "element_click" ? "A click on the selected website element advances once; the normal click still works." : type === "element_hover" ? "Keep the pointer over the selected element for the specified duration." : type === "custom_event" ? "Advance when the SDK receives this exact event name." : "Advance on a future navigation matching this path. Use * for wildcard patterns.");
    this.root.querySelectorAll<HTMLElement>("[data-guide-config]").forEach(group => { const config = group.dataset.guideConfig; group.hidden = config === "element" ? !["element_click", "element_hover"].includes(type) : config === "hover" ? type !== "element_hover" : config === "event" ? type !== "custom_event" : type !== "route"; });
    const target = guideInteractionTarget(step); const hasTarget = advance?.type === "element_click" || advance?.type === "element_hover" ? Boolean(advance.target) : false;
    this.setChecked("[data-guide-use-position]", !hasTarget); this.setText("[data-guide-interaction-label]", target?.label ?? target?.primarySelector ?? "No element selected");
    let count = 0; if (target) try { count = document.querySelectorAll(target.primarySelector).length; } catch { /* Invalid selectors remain a warning, never executable input. */ }
    this.setText("[data-guide-interaction-status]", target ? `${capitalize(target.reliability)} selector · ${count} primary matches · ${this.targetStatus(target) === "found" ? "Found" : "Missing or on another page"}` : "Select an element or configure a positioning target first.");
    this.setValue("[data-guide-hover]", String(advance?.type === "element_hover" ? advance.durationMs ?? 500 : 500)); this.setValue("[data-guide-event]", advance?.type === "custom_event" ? advance.eventName : "");
    const rule = advance?.type === "route" ? advance.pageRules.find(item => item.kind === "include") : undefined;
    this.setValue("[data-guide-route]", rule?.value ?? ""); this.setValue("[data-guide-route-operator]", rule?.operator ?? "equals");
    this.root.querySelector<HTMLElement>("[data-guide-route-extra]")!.hidden = advance?.type !== "route" || advance.pageRules.length <= 1;
    this.setValue("[data-guide-delay]", String(step.presentation?.delayMs ?? 0)); this.setValue("[data-guide-missing-action]", step.presentation?.missingTarget?.action ?? "wait"); this.setValue("[data-guide-timeout]", String(step.presentation?.missingTarget?.timeoutMs ?? 5000));
    this.root.querySelector<HTMLElement>("[data-guide-missing]")!.hidden = !anchored; this.setChecked("[data-guide-dismissible]", step.behavior.dismissible ?? true);
    this.setText("[data-preview-step]", `${this.guidePreviewComplete ? "Complete · " : ""}${this.stepIndex + 1}/${this.guide.steps.length}`);
    this.root.querySelector<HTMLButtonElement>("[data-preview-back]")!.disabled = this.stepIndex === 0;
    this.root.querySelector<HTMLButtonElement>("[data-preview-next]")!.disabled = this.guidePreviewComplete;
    const test = this.root.querySelector<HTMLButtonElement>("[data-preview-test]")!; test.hidden = !["custom_event", "route"].includes(type) || this.guidePreviewComplete; test.textContent = type === "route" ? "Simulate match" : "Test event";
  }

  private previewTriggerHint(): string {
    const advance = this.guide?.steps[this.stepIndex].advance;
    return this.guidePreviewComplete ? "Guide preview complete. Reset to start again." : advance?.type === "custom_event" ? `Waiting for “${advance.eventName}”. Test event is preview-only.` : advance?.type === "route" ? "Waiting for matching navigation. Simulate match does not navigate." : advance?.type === "element_click" ? "Click the configured website element." : advance?.type === "element_hover" ? "Hover over the configured website element." : "Click a Next step button.";
  }

  private startGuidePreview(): void {
    if (!this.guide || !this.flushContent()) return;
    this.guidePreviewComplete = false; this.stepIndex = 0;
    if (this.mode !== "preview") this.setMode("preview"); else { this.renderPreview(); this.syncPanel(); }
  }

  private advanceGuidePreview(delta: -1 | 1): void {
    if (!this.guide || this.mode !== "preview" || this.guidePreviewComplete && delta > 0) return;
    if (this.stepIndex + delta >= this.guide.steps.length) { this.guidePreviewComplete = true; this.previewGeneration++; this.preview.destroy(); this.previewRendered = false; this.syncGuideBehavior(); this.setText("[data-trigger-status]", this.previewTriggerHint()); return; }
    this.guidePreviewComplete = false; this.switchStep(this.stepIndex + delta);
  }

  private addGuideStep(pattern: "modal" | "anchored_card"): void {
    if (!this.guide || !this.flushContent()) return;
    if (this.guide.steps.length >= 20) { this.showValidation(["A Guide can contain up to 20 steps."]); return; }
    const document = createOnsiteDocument(true); const builder: WidgetBuilderState = { version: 1, projectData: {}, html: "", css: "" }; const compiled = applyOnsiteDocument(builder, document, pattern);
    const step = { id: editorId("step"), label: pattern === "modal" ? "Modal step" : "Anchored step", pattern, content: compiled.content, builder, advance: { type: "button" as const }, behavior: pattern === "modal" ? { dismissible: true, layer: { mode: "always_on_top" as const } } : { placement: "auto" as const, alignment: "center" as const, offset: 8, pointer: { enabled: true, size: 10 }, dismissible: true, layer: { mode: "auto" as const } } };
    this.guide.steps.splice(this.stepIndex + 1, 0, step); this.stepIndex++; this.changed(); this.refreshStepBar();
  }

  private duplicateGuideStep(): void {
    if (!this.guide || !this.flushContent()) return; const source = this.guide.steps[this.stepIndex]; const copy = cloneOnsite(source); copy.id = editorId("step"); copy.label = `${source.label || source.content.heading || "Step"} copy`;
    const document = onsiteDocumentFromBuilder(copy.builder); if (document && copy.builder) { const next = duplicateDocument(document); const compiled = applyOnsiteDocument(copy.builder, next, getGuideStepPattern(copy)); copy.content = compiled.content; }
    this.guide.steps.splice(this.stepIndex + 1, 0, copy); this.stepIndex++; this.changed(); this.refreshStepBar();
  }

  private deleteGuideStep(): void { if (!this.guide || this.guide.steps.length <= 1 || !window.confirm("Delete this Guide step?")) return; if (!this.flushContent()) return; this.guide.steps.splice(this.stepIndex, 1); this.stepIndex = Math.min(this.stepIndex, this.guide.steps.length - 1); this.changed(); this.refreshStepBar(); }
  private moveGuideStep(delta: -1 | 1): void { if (!this.guide || !this.flushContent()) return; const next = this.stepIndex + delta; if (next < 0 || next >= this.guide.steps.length) return; const [step] = this.guide.steps.splice(this.stepIndex, 1); this.guide.steps.splice(next, 0, step); this.stepIndex = next; this.changed(); this.refreshStepBar(); }
  private refreshStepBar(): void { const flow = this.root?.querySelector<HTMLElement>("[data-step-flow]"); if (!flow) return; flow.innerHTML = this.stepButtons(); flow.querySelectorAll<HTMLButtonElement>("[data-step]").forEach(button => button.addEventListener("click", () => this.switchStep(Number(button.dataset.step)))); const remove = this.root?.querySelector<HTMLButtonElement>("[data-step-bar-actions] [data-delete-step]"); if (remove) remove.disabled = !this.guide || this.guide.steps.length <= 1; const add = this.root?.querySelector<HTMLButtonElement>("[data-add-current-step]"); if (add && this.guide) add.title = `Add a ${getGuideStepPattern(this.guide.steps[this.stepIndex]) === "modal" ? "Modal" : "Anchored"} step`; this.syncPanel(); }

  private bindDrag(): void {
    const handle = this.root?.querySelector<HTMLElement>("[data-drag-handle]");
    const aside = this.root?.querySelector<HTMLElement>("[data-editor-toolbar]");
    if (!handle || !aside) return;
    handle.addEventListener("pointerdown", event => {
      if ((event.target as Element).closest("button")) return;
      const rect = aside.getBoundingClientRect();
      const startX = event.clientX; const startY = event.clientY;
      let frame = 0;
      const move = (next: PointerEvent) => {
        cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
        aside.style.right = "auto";
        aside.style.transform = "none";
        aside.style.left = `${Math.max(4, Math.min(innerWidth - rect.width - 4, rect.left + next.clientX - startX))}px`;
        aside.style.top = `${Math.max(4, Math.min(innerHeight - rect.height - 4, rect.top + next.clientY - startY))}px`;
        });
      };
      const stop = () => { cancelAnimationFrame(frame); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); this.dragCleanup = null; };
      this.dragCleanup?.(); this.dragCleanup = stop;
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop);
    });
  }

  private bindStepBarDrag(): void {
    const handle = this.root?.querySelector<HTMLElement>("[data-step-drag-handle]");
    const bar = this.root?.querySelector<HTMLElement>("[data-guide]");
    if (!handle || !bar) return;
    handle.addEventListener("pointerdown", event => {
      const rect = bar.getBoundingClientRect();
      const startX = event.clientX; const startY = event.clientY;
      let frame = 0;
      const move = (next: PointerEvent) => {
        cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
          bar.style.right = "auto";
          bar.style.bottom = "auto";
          bar.style.transform = "none";
          bar.style.left = `${Math.max(4, Math.min(innerWidth - rect.width - 4, rect.left + next.clientX - startX))}px`;
          bar.style.top = `${Math.max(4, Math.min(innerHeight - rect.height - 4, rect.top + next.clientY - startY))}px`;
        });
      };
      const stop = () => { cancelAnimationFrame(frame); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); this.dragCleanup = null; };
      this.dragCleanup?.(); this.dragCleanup = stop;
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop);
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
    if (!this.flushContent()) return;
    this.selectionGeneration++;
    this.picker.cancel();
    this.contentEditor?.destroy(); this.contentEditor = null; this.componentSelection = null;
    this.compositionEditor?.destroy(); this.compositionEditor = null; this.compositionSelection = null;
    if (this.dirty) void this.persist();
    this.stepIndex = index;
    this.updateContinuation();
    this.syncPanel();
    this.applyMode();
  }

  private setMode(mode: EditorMode): void {
    if (mode === "design" && this.draft?.experience.builderMode !== "onsite") return;
    if (this.mode === mode && (mode !== "target" || this.pickerIsSelecting())) return;
    if (!this.flushContent()) return;
    this.selectionGeneration++;
    this.picker.cancel();
    this.contentEditor?.destroy(); this.contentEditor = null; this.componentSelection = null;
    this.compositionEditor?.destroy(); this.compositionEditor = null; this.compositionSelection = null;
    if (this.dirty) void this.persist();
    this.mode = mode; this.guidePreviewComplete = false;
    this.configureDiagnostics();
    this.updateContinuation();
    this.applyMode();
  }

  private applyMode(): void {
    if (this.mode === "navigate") { this.previewGeneration++; this.checklistEditor?.destroyView(); this.preview.destroy(); this.previewRendered = false; this.syncPanel(); return; }
    this.renderPreview(); this.syncPanel(); if (this.mode === "target") this.startPicker();
  }

  private startPicker(): void {
    if (!this.isTargetedType() || this.mode !== "target") return;
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
    if (this.mode === "navigate" || this.mode === "preview") this.mode = "target";
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
    return !!document.querySelector("[data-movcues-picker-overlay]");
  }

  private changed(render = true, preserveAiHistory = false): void {
    if (this.saveState === "expired") return;
    if (!preserveAiHistory) { this.guideAiUndo = []; this.guideAiRedo = []; this.surveyAiUndo = []; this.surveyAiRedo = []; this.checklistAiUndo = []; this.checklistAiRedo = []; }
    this.dirty = true; this.editGeneration++;
    this.updateContinuation();
    if (render) this.syncPanel(); else { this.syncContentInspector(); this.syncCompositionInspector(); }
    if (render && this.mode !== "navigate") this.renderPreview();
    if (this.saveState !== "conflict" && this.saveState !== "failed") this.saveState = this.saveInFlight ? "saving" : "dirty";
    this.showSaveState();
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.persist(), 350);
  }

  private flushContent(): boolean {
    if (this.contentEditor && !this.contentEditor.flush()) {
      this.setText("[data-save-state]", "Finish composing text before continuing"); return false;
    }
    const errors = this.contentEditor?.getValidation() ?? [];
    if (this.compositionEditor && !this.compositionEditor.flush()) { const compositionErrors = this.compositionEditor.getValidation(); this.showValidation(compositionErrors); return false; }
    const allErrors = [...errors, ...(this.compositionEditor?.getValidation() ?? []), ...(this.guide?.steps.flatMap(guideStepConfigurationErrors) ?? []), ...(this.survey ? surveyBranchErrors(this.survey) : [])];
    this.showValidation(allErrors); return !allErrors.length;
  }

  private showValidation(errors: string[]): void {
    const element = this.root?.querySelector<HTMLElement>("[data-content-error]");
    if (element) { element.hidden = !errors.length; element.textContent = errors.join(" "); }
  }

  private showSaveState(): void {
    const labels = { clean: "Draft saved", dirty: "Unsaved", saving: "Saving…", failed: "Save failed", conflict: "Conflict · reload required", expired: "Session expired · export unsaved edits" };
    this.setText("[data-save-state]", labels[this.saveState]);
    const save = this.root?.querySelector<HTMLButtonElement>("[data-save]"); if (save) save.disabled = !this.dirty || ["saving", "conflict", "expired"].includes(this.saveState);
    const recovering = ["failed", "conflict", "expired"].includes(this.saveState);
    const recovery = this.root?.querySelector<HTMLElement>("[data-save-recovery]"); if (recovery) recovery.hidden = !recovering;
    const retry = this.root?.querySelector<HTMLButtonElement>("[data-retry-save]"); if (retry) retry.hidden = this.saveState !== "failed";
    const reload = this.root?.querySelector<HTMLButtonElement>("[data-reload-draft]"); if (reload) reload.hidden = !["conflict", "expired"].includes(this.saveState);
    this.setText("[data-recovery-message]", "Local edits remain in memory in this tab. Export before reloading or leaving.");
  }

  private captureRecovery(): void {
    if (!this.definition || (!this.dirty && !this.contentEditor?.isComposing() && !this.compositionEditor?.isComposing())) return;
    // Contains only authored data, never the session or access token. No website storage.
    const definition = JSON.parse(JSON.stringify(this.checklist ?? this.definition)) as EditorDefinition | EditorChecklistDefinition;
    const snapshot = this.compositionEditor?.snapshot() ?? this.contentEditor?.snapshot();
    if (snapshot) {
      const part = isGuideDefinition(definition as EditorDefinition) ? (definition as RuntimeGuideDefinition).steps[this.stepIndex] : "survey" in definition && definition.survey ? definition.survey.steps[this.stepIndex] : definition;
      (part as {builder?:WidgetBuilderState}).builder = snapshot.builder; if(!isChecklistDefinition(part as EditorDefinition | EditorChecklistDefinition)) (part as {content:ExperienceContent}).content = snapshot.content;
    }
    this.recoveryDraft = JSON.stringify({ experienceId: this.draft?.experience.id, revision: this.draft?.version.revision, definition }, null, 2);
  }

  private exportRecovery(): void {
    this.contentEditor?.flush();
    if (this.saveState !== "expired" || !this.recoveryDraft) this.captureRecovery();
    if (!this.recoveryDraft) return;
    let output = this.root?.querySelector<HTMLTextAreaElement>("[data-recovery-export]");
    if (!output && this.root) { output = document.createElement("textarea"); output.dataset.recoveryExport = ""; output.setAttribute("aria-label", "Unsaved draft JSON; copy and save before leaving"); output.readOnly = true; this.root.querySelector("main")?.append(output); }
    if (output) { output.value = this.recoveryDraft; output.focus(); output.select(); }
  }

  private expireSession(): void {
    if (this.saveState === "expired") return;
    this.contentEditor?.flush(); this.compositionEditor?.flush(); this.captureRecovery();
    this.dirty = this.dirty || !!this.contentEditor?.isComposing() || !!this.compositionEditor?.isComposing();
    this.saveState = "expired"; this.lifecycle++;
    clearTimeout(this.saveTimer); clearTimeout(this.expiryTimer); clearInterval(this.validationTimer);
    this.contentEditor?.destroy(); this.contentEditor = null; this.compositionEditor?.destroy(); this.compositionEditor = null;
    this.previewGeneration++; this.preview.destroy(); this.previewRendered = false; this.picker.cancel();
    this.mutationObserver?.disconnect(); this.routeUnsubscribe?.(); this.routeObserver.stop();
    this.bridge = null; this.session = null; clearEditorContinuation();
    this.root?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button,input,select").forEach(control => { if (!control.matches("[data-export-draft],[data-discard-draft],[data-reload-draft],[data-minimize],[data-close]")) control.disabled = true; });
    this.showSaveState();
  }

  private async persist(): Promise<boolean> {
    clearTimeout(this.saveTimer); this.saveTimer = 0;
    if (!this.flushContent()) return false;
    if (this.saveState === "conflict" || this.saveState === "expired") return false;
    if (this.saveInFlight) {
      const saved = await this.saveInFlight;
      return saved && this.dirty ? this.persist() : saved;
    }
    if (!this.dirty || !this.bridge || !this.definition) return true;
    const bridge = this.bridge; const generation = this.editGeneration; const lifecycle = this.lifecycle;
    const definition = JSON.parse(JSON.stringify(this.checklist ?? this.definition)) as EditorDefinition | EditorChecklistDefinition;
    const revision = this.draft?.version.revision ?? 1;
    this.saveState = "saving"; this.showSaveState();
    const request = bridge.save(definition, revision).then(version => {
      if (lifecycle !== this.lifecycle) return false;
      if (this.draft) this.draft.version.revision = version.revision;
      this.dirty = this.editGeneration !== generation;
      this.saveState = this.dirty ? "dirty" : "clean";
      if (!this.dirty) { this.recoveryDraft = null; this.root?.querySelector("[data-recovery-export]")?.remove(); }
      this.showSaveState(); return true;
    }).catch(error => {
      if (lifecycle !== this.lifecycle) return false;
      this.dirty = true; this.captureRecovery();
      if (error instanceof EditorSessionExpiredError) { this.expireSession(); return false; }
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

  private async close(): Promise<void> {
    if (!this.flushContent()) return;
    if ((this.dirty || this.saveInFlight) && !await this.persist()) return;
    this.destroy();
  }

  private renderPreview(): void {
    if (!this.definition || !this.draft || this.mode === "navigate" || this.saveState === "expired") return;
    if (!this.flushContent()) return;
    const generation = ++this.previewGeneration;
    if (this.mode === "preview" && this.guide) this.guidePreviewEntryPath = currentPagePath();
    this.previewRendered = false;
    this.contentEditor?.destroy(); this.contentEditor = null; this.componentSelection = null;
    this.compositionEditor?.destroy(); this.compositionEditor = null; this.compositionSelection = null;
    if(this.checklist && this.checklistEditor){
      this.preview.destroy();this.previewRendered=this.checklistEditor.render(this.draft.experience.id,this.draft.version.id,this.mode==="preview");
      this.applyPreviewDevice();if(this.mode==="design"&&this.previewRendered)this.attachContentEditor();this.updateDiagnostics();return;
    }
    const definition = this.definition;
    // Editor-only behavior overrides; production renderers and definitions stay unchanged.
    const rendered = JSON.parse(JSON.stringify(definition)) as EditorDefinition;
    if (this.mode !== "preview") {
      if (isGuideDefinition(rendered)) rendered.steps.forEach(step => { step.behavior.dismissible = false; step.advance = { type: "button" }; delete step.presentation; });
      else { rendered.behavior = { ...rendered.behavior, autoDismissMs: null, dismissible: false, closeOnBackdrop: false }; }
    }
    if (this.mode === "target") {
      if (isGuideDefinition(rendered)) rendered.steps.forEach(step => { step.behavior.backdrop = false; });
      else if (this.draft.experience.widgetType === "anchored_card") rendered.behavior.backdrop = false;
    }
    const selectedStepId = this.guide?.steps[this.stepIndex]?.id ?? (this.mode === "preview" ? undefined : this.survey?.steps[this.stepIndex]?.id);
    this.preview.render({
      id: this.draft.experience.id,
      versionId: this.draft.version.id,
      kind: this.draft.experience.kind,
      // Freeze cursor-follow cards using the stationary toast shell only while authoring.
      widgetType: this.mode !== "preview" && this.draft.experience.widgetType === "cursor_follow" ? "toast" : this.draft.experience.widgetType,
      priority: 0,
      definition: rendered,
    }, {
      onVisible: () => {
        if (generation !== this.previewGeneration || this.saveState === "expired" || !this.root) return;
        const host = Array.from(document.querySelectorAll<HTMLElement>("[data-movcues-experience]")).find(element => element.dataset.movcuesExperience === this.draft?.experience.id);
        host?.shadowRoot?.addEventListener("click", event => { if ((event.target as Element)?.closest?.("a")) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
        this.previewRendered = true; this.applyPreviewDevice(); if (this.mode === "design") this.attachContentEditor(); this.updateDiagnostics(); },
      onDismiss: () => { this.previewRendered = false; this.setText("[data-trigger-status]", "Preview closed. Start or Reset to try again."); this.updateDiagnostics(); },
      onAction: () => void 0,
      onGuideAdvance: () => { if (this.mode === "preview" && this.guide) this.advanceGuidePreview(1); },
      onGuideBack: () => { if (this.mode === "preview" && this.guide) this.advanceGuidePreview(-1); },
      onGuideStatus: status => { if (generation === this.previewGeneration && this.mode === "preview") this.setText("[data-trigger-status]", status === "delay" ? "Waiting for presentation delay…" : status === "waiting" ? "Waiting for a website element…" : status === "unavailable" ? "Target missing; use Next, Reset or reselect the target." : this.previewTriggerHint()); },
      onSurveySubmit: this.mode === "preview" && this.survey ? () => { this.setText("[data-preview-limit]", "Preview complete. No response or production analytics were sent. Website interactions can still run your site's JavaScript."); } : undefined,
      onComplete: () => { this.previewRendered = false; this.updateDiagnostics(); },
      onUnavailable: () => { this.previewRendered = false; this.updateDiagnostics(); },
    }, selectedStepId);
    this.updateDiagnostics();
  }

  private applyPreviewDevice():void{
    if(!this.draft)return;const host=Array.from(document.querySelectorAll<HTMLElement>('[data-movcues-experience],[data-movcues-checklist]')).find(element=>(element.dataset.movcuesExperience??element.dataset.movcuesChecklist)===this.draft!.experience.id),surface=host?.shadowRoot?.querySelector<HTMLElement>('.card,.movcues-widget');if(!surface)return;
    if(surface.dataset.movcuesOriginalMaxWidth===undefined)surface.dataset.movcuesOriginalMaxWidth=surface.style.maxWidth;
    const width=this.previewDevice==='mobile'?360:this.previewDevice==='tablet'?720:null;
    if(width){surface.style.maxWidth=`min(${width}px, calc(100vw - 16px))`;surface.dataset.movcuesViewportPreview=this.previewDevice;}else{surface.style.maxWidth=surface.dataset.movcuesOriginalMaxWidth;delete surface.dataset.movcuesViewportPreview;}
  }

  private attachContentEditor(): void {
    if (this.draft?.experience.builderMode !== "onsite" || this.mode !== "design") return;
    const host = Array.from(document.querySelectorAll<HTMLElement>("[data-movcues-experience],[data-movcues-checklist]")).find(
      element => (element.dataset.movcuesExperience ?? element.dataset.movcuesChecklist) === this.draft!.experience.id,
    );
    const builder = this.currentBuilder(); const content = this.currentContent();
    if (!host?.shadowRoot || !builder || !content) return;
    // Gecko/WebKit cannot reliably edit a shadow tree mounted outside <body>.
    // Only the authoring instance moves; visitor rendering and positioning stay intact.
    if (document.body && !document.body.contains(host)) document.body.appendChild(host);
    this.contentEditor?.destroy(); this.compositionEditor?.destroy();
    if (isSourceAuthored(builder)) {
      this.contentEditor = null; this.compositionEditor = null; this.componentSelection = null;
      this.compositionSelection = { kind: "step", label: "Source-authored widget" };
      this.root?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('main button:not([data-inspector-tab]):not([data-ai-panel] *),main input:not([data-ai-panel] *),main select:not([data-ai-panel] *)').forEach(control => { if (!control.disabled) { control.disabled = true; control.dataset.movcuesSourceDisabled = ""; } });
      this.setText("[data-mode-hint]", "Source mode · full HTML/CSS is preserved exactly; use Movcues AI to redesign it."); this.syncAiPanel(); return;
    }
    this.root?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('[data-movcues-source-disabled]').forEach(control => { control.disabled = false; delete control.dataset.movcuesSourceDisabled; });
    try {
        this.compositionEditor = new OnsiteCompositionEditor(host.shadowRoot, builder, content, this.checklist ? "checklist" : this.guide ? getGuideStepPattern(this.guide.steps[this.stepIndex]) : this.draft.experience.widgetType ?? "modal", Boolean(this.guide), {
          onPatch: () => { this.checklistEditor?.applyDesign(this.draft!.experience.id); },
          onChange: () => { this.syncOnsiteAnchoredPointer(host.shadowRoot!, builder); this.changed(false); },
          onValidation: errors => this.showValidation(errors),
          onImageStatus: message => this.setText("[data-image-status]", message),
          onSelectionChange: selection => { if(this.checklist && selection.kind !== "step"){this.root?.querySelector("aside")?.classList.remove("minimized");this.root?.querySelector("[data-minimize]")?.setAttribute("aria-expanded","true");} this.compositionSelection = selection; this.syncCompositionInspector(); this.syncAiPanel(); },
        }, this.survey ? { config: this.survey, step: this.survey.steps[this.stepIndex] } : undefined, this.checklist ?? undefined);
        this.compositionEditor.start(); this.syncOnsiteAnchoredPointer(host.shadowRoot, builder); return;
    } catch (error) { this.showValidation([error instanceof Error ? error.message : "This layout could not be converted safely."]); this.compositionEditor = null; }
    this.contentEditor = new OnsiteContentEditor(host.shadowRoot, builder, content, {
      onChange: () => this.changed(false),
      onValidation: errors => this.showValidation(errors),
      onSelectionChange: selection => { this.componentSelection = selection; this.syncContentInspector(); },
    });
    this.contentEditor.start();
  }

  private syncOnsiteAnchoredPointer(root: ShadowRoot, builder: WidgetBuilderState): void {
    const pointer = root.querySelector<HTMLElement>(".movcues-anchor-pointer"); if (!pointer) return;
    const color = onsiteDocumentFromBuilder(builder)?.root.style?.background;
    if (color) {
      if (pointer.dataset.movcuesAuthoringPointerColor === undefined) pointer.dataset.movcuesAuthoringPointerColor = pointer.style.color;
      pointer.style.setProperty("color", color, "important");
    } else if (pointer.dataset.movcuesAuthoringPointerColor !== undefined) {
      pointer.style.setProperty("color", pointer.dataset.movcuesAuthoringPointerColor);
      delete pointer.dataset.movcuesAuthoringPointerColor;
    }
  }

  private currentBuilder(): WidgetBuilderState | undefined {
    if (!this.definition) return undefined;
    if (this.guide) return this.guide.steps[this.stepIndex]?.builder;
    if (this.survey) return this.survey.steps[this.stepIndex]?.builder;
    return (this.definition as RuntimeWidgetDefinition).builder;
  }

  private currentContent(): ExperienceContent | undefined {
    if (!this.definition) return undefined;
    if (this.guide) return this.guide.steps[this.stepIndex]?.content;
    if (this.survey) return this.survey.steps[this.stepIndex]?.content;
    return (this.definition as RuntimeWidgetDefinition).content;
  }

  private syncContentInspector(): void {
    if (!this.root) return; const selection = this.componentSelection; const inspector = this.root.querySelector<HTMLElement>("[data-content-inspector]");
    if (!inspector) return; inspector.hidden = this.mode !== "design" || !selection;
    if (!selection) return; this.setText("[data-component-label]", `${capitalize(selection.label)}${selection.editing ? " · Editing" : ""}`);
    this.root.querySelectorAll<HTMLElement>("[data-text-controls]").forEach(element => { element.hidden = selection.kind === "image"; });
    const imageControls = this.root.querySelector<HTMLElement>("[data-image-controls]"); if (imageControls) imageControls.hidden = selection.kind !== "image";
    const edit = this.root.querySelector<HTMLButtonElement>("[data-edit-component]"); if (edit) edit.hidden = selection.kind === "image";
    this.root.querySelectorAll<HTMLButtonElement>("[data-list]").forEach(button => { button.disabled = selection.kind !== "text" || selection.label !== "body"; });
    const link = this.root.querySelector<HTMLButtonElement>("[data-apply-link]"); if (link) link.disabled = selection.kind !== "text";
    if (selection.kind === "image") { this.setValue("[data-image-src]", selection.src ?? ""); this.setValue("[data-image-alt]", selection.alt ?? ""); }
    const undo = this.root.querySelector<HTMLButtonElement>("[data-undo]"); if (undo) undo.disabled = !this.contentEditor?.canUndo();
    const redo = this.root.querySelector<HTMLButtonElement>("[data-redo]"); if (redo) redo.disabled = !this.contentEditor?.canRedo();
  }

  private syncCompositionInspector(): void {
    this.surveyEditor?.sync();this.checklistEditor?.sync();
    if (!this.root) return; const editor = this.compositionEditor; const selection = this.compositionSelection; const inspector = this.root.querySelector<HTMLElement>("[data-composition-inspector]"); if (!inspector) return;
    const globalUndo = this.root.querySelector<HTMLButtonElement>("[data-global-undo]"); const globalRedo = this.root.querySelector<HTMLButtonElement>("[data-global-redo]");
    if (globalUndo) globalUndo.disabled = !this.guideAiUndo.length && !this.surveyAiUndo.length && !this.checklistAiUndo.length && !this.widgetAiUndo.length && !editor?.canUndo() && !this.contentEditor?.canUndo();
    if (globalRedo) globalRedo.disabled = !this.guideAiRedo.length && !this.surveyAiRedo.length && !this.checklistAiRedo.length && !this.widgetAiRedo.length && !editor?.canRedo() && !this.contentEditor?.canRedo();
    inspector.hidden = this.mode !== "design" || !editor || !selection; this.root.querySelector<HTMLElement>("[data-content-inspector]")!.hidden = Boolean(editor) || this.mode !== "design" || !this.componentSelection;
    if (!editor || !selection) return; if (selection.kind === "step") this.syncGuideBehavior(); this.setText("[data-composition-label]", selection.label);
    this.root.querySelectorAll<HTMLElement>("[data-step-only]").forEach(group => { if (selection.kind !== "step") group.hidden = true; });
    if (selection.kind === "step") this.root.querySelectorAll<HTMLElement>("[data-step-only]").forEach(group => { group.hidden = group.hasAttribute("data-for") ? !this.isTargetedType() : group.hasAttribute("data-step-summary") ? !this.guide : group.hasAttribute("data-placement-section") ? Boolean(this.guide && getGuideStepPattern(this.guide.steps[this.stepIndex]) === "modal") : false; });
    const stepName = this.root.querySelector<HTMLInputElement>("[data-step-name]")?.closest("label"); if (stepName) stepName.hidden = !this.guide;
    this.root.querySelectorAll<HTMLElement>("[data-inspector]").forEach(group => { group.hidden = group.dataset.inspector !== selection.kind; });
    const step = this.guide?.steps[this.stepIndex]; this.setValue("[data-step-name]", step?.label ?? step?.content.heading ?? "");
    const cell = editor.getSelectedCell(); if (cell) { this.setValue("[data-cell-direction]", cell.direction); this.setValue("[data-cell-size]", cell.sizing.mode); this.setValue("[data-cell-fixed]", String(cell.sizing.mode === "fixed" ? cell.sizing.value : 160)); this.root.querySelector<HTMLElement>("[data-fixed-size]")!.hidden = cell.sizing.mode !== "fixed"; this.setValue("[data-cell-align]", cell.align); this.setValue("[data-cell-gap]", String(cell.gap)); this.setValue("[data-cell-padding]", String(cell.padding.top)); this.setValue("[data-cell-background]", cell.style?.background && /^#[0-9a-f]{6}$/i.test(cell.style.background) ? cell.style.background : "#ffffff"); this.setValue("[data-cell-border]", String(cell.style?.borderWidth ?? 0)); this.setValue("[data-cell-radius]", String(cell.style?.borderRadius ?? 0)); this.setChecked("[data-cell-stack]", Boolean(cell.responsiveStack)); }
    const block = editor.getSelectedBlock(); this.root.querySelectorAll<HTMLElement>("[data-block]").forEach(group => { group.hidden = !block || !group.dataset.block!.split(",").includes(block.type); });
    if (block) { this.setValue("[data-block-align]", block.align ?? "left"); if (block.type === "heading" || block.type === "text") { this.setValue("[data-block-font-size]", String(block.fontSize)); this.setValue("[data-block-line-height]", String(block.lineHeight ?? (block.type === "heading" ? 1.25 : 1.5))); this.setValue("[data-block-weight]", String(block.weight)); this.setValue("[data-block-color]", block.color && /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : "#111827"); } if (block.type === "button") { this.setValue("[data-button-label]", block.label); this.setValue("[data-button-variant]", block.variant); this.setValue("[data-button-action]", block.action.type); this.setValue("[data-button-url]", "url" in block.action ? block.action.url : ""); this.setValue("[data-button-event]", "eventName" in block.action ? block.action.eventName : ""); this.setValue("[data-button-background]", block.background && /^#[0-9a-f]{6}$/i.test(block.background) ? block.background : "#2563eb"); this.setValue("[data-button-color]", block.color && /^#[0-9a-f]{6}$/i.test(block.color) ? block.color : "#ffffff"); this.setValue("[data-button-width]", block.width); this.setValue("[data-button-padding-x]", String(block.paddingX)); this.setValue("[data-button-padding-y]", String(block.paddingY)); this.setValue("[data-button-radius]", String(block.radius)); this.root.querySelector<HTMLElement>("[data-action-url]")!.hidden = block.action.type !== "open_url"; this.root.querySelector<HTMLElement>("[data-action-event]")!.hidden = block.action.type !== "track_event"; } if (block.type === "image") { this.setValue("[data-v2-image-src]", block.src); this.setValue("[data-v2-image-alt]", block.alt); this.setValue("[data-image-fit]", block.fit); this.setValue("[data-image-width]", String(block.width)); this.setValue("[data-image-radius]", String(block.radius)); } if (block.type === "divider") { this.setValue("[data-divider-thickness]", String(block.thickness)); this.setValue("[data-divider-color]", block.color); } if (block.type === "spacer") this.setValue("[data-spacer-size]", String(block.size)); if (block.type === "icon") { this.setValue("[data-icon-name]", block.icon); this.setValue("[data-icon-size]", String(block.size)); this.setValue("[data-icon-color]", block.color ?? "#2563eb"); } }
    if (block?.type === "image") {
      const local = block.src.startsWith("data:"); if (local) this.setValue("[data-v2-image-src]", "");
      this.root.querySelector<HTMLInputElement>("[data-v2-image-src]")!.placeholder = local ? "Added from file; paste a URL to replace" : "https://… (optional)";
      this.setText("[data-choose-image]", block.src ? "Replace image" : "Choose image");
    }
    this.hideChecklistWidgetControls();
    const undo = this.root.querySelector<HTMLButtonElement>("[data-v2-undo]"); if (undo) undo.disabled = !editor.canUndo(); const redo = this.root.querySelector<HTMLButtonElement>("[data-v2-redo]"); if (redo) redo.disabled = !editor.canRedo();
    if (globalUndo) globalUndo.disabled = !this.guideAiUndo.length && !this.surveyAiUndo.length && !this.checklistAiUndo.length && !this.widgetAiUndo.length && !editor.canUndo(); if (globalRedo) globalRedo.disabled = !this.guideAiRedo.length && !this.surveyAiRedo.length && !this.checklistAiRedo.length && !this.widgetAiRedo.length && !editor.canRedo();
  }

  private setInspectorTab(tab: "properties" | "theme" | "ai"): void {
    if (!this.root || (tab === "ai" && this.draft?.experience.builderMode !== "onsite")) return;
    const main = this.root.querySelector("main");
    main?.classList.toggle("ai-mode", tab === "ai");
    main?.classList.toggle("theme-mode", tab === "theme");
    this.root.querySelectorAll<HTMLButtonElement>("[data-inspector-tab]").forEach(button => button.classList.toggle("active", button.dataset.inspectorTab === tab));
    const panel = this.root.querySelector<HTMLElement>("[data-ai-panel]"); if (panel) panel.hidden = tab !== "ai";
    const themePanel = this.root.querySelector<HTMLElement>("[data-theme-section]"); if (themePanel) themePanel.hidden = tab !== "theme";
    if (tab === "ai") this.syncAiPanel();
  }

  private syncAiPanel(): void {
    if (!this.root) return; const selection = this.compositionSelection;
    this.setText("[data-ai-context]", this.guide ? `Guide · step ${this.stepIndex + 1} of ${this.guide.steps.length}${selection ? ` · ${selection.label}` : ""}` : this.survey ? `Survey · step ${this.stepIndex + 1} of ${this.survey.steps.length}${selection ? ` · ${selection.label}` : ""}` : this.checklist ? `Checklist · ${this.checklistEditor?.getView() ?? "expanded"}${selection ? ` · ${selection.label}` : ""}` : selection ? `Editing ${selection.label} · ${selection.kind}` : "Choose an element or ask about the whole widget.");
    const history = this.root.querySelector<HTMLElement>("[data-ai-history]");
    if (history) {
      const messages = this.aiMessages.map(message => {
        const item = document.createElement("article"); item.className = `ai-chat-message ai-chat-message--${message.role}`;
        const label = document.createElement("span"); label.className = "ai-chat-message__role"; label.textContent = message.role === "user" ? "You" : "Movcues AI";
        const text = document.createElement("p"); text.textContent = message.text;
        item.append(label, text); return item;
      });
      history.replaceChildren(...messages); history.scrollTop = history.scrollHeight;
    }
    const proposal = this.root.querySelector<HTMLElement>("[data-ai-proposal]"); if (proposal) proposal.hidden = !this.aiProposal;
    if (!this.aiProposal) return;
    this.setText("[data-ai-summary]", this.aiProposal.value.summary);
    const list = this.root.querySelector<HTMLElement>("[data-ai-operations]"); if (list) { const items = this.aiProposal.value.operations.map((operation, index) => { const item = document.createElement("li"); const stepId = "stepId" in operation ? operation.stepId : undefined; const steps = this.guide?.steps.map(value => ({ id: value.id, label: value.label || value.content.heading })) ?? this.survey?.steps.map(value => ({ id: value.id, label: value.content.heading })) ?? []; const stepIndex = stepId ? steps.findIndex(value => value.id === stepId) : -1; item.textContent = `${operation.type.replace(/_/g, " ")}${stepIndex >= 0 ? ` · ${steps[stepIndex].label || `step ${stepIndex + 1}`}` : ""}${operation.type === "request_guide_target" && this.aiResolvedTargets.has(index) ? " · target selected" : ""}`; return item; }); try { const warnings = this.survey && this.definition ? applySurveyAiProposal(this.definition as RuntimeWidgetDefinition & { targeting: ExperienceTargeting }, this.aiProposal.value as SurveyAiProposal).warnings : this.checklist ? applyChecklistAiProposal(this.checklist, this.aiProposal.value as ChecklistAiProposal, this.draft?.references ?? { guides: [], segments: [] }).warnings : []; for (const warning of warnings) { const item = document.createElement("li"); item.textContent = `Warning · ${warning}`; items.push(item); } } catch { /* Apply reports any late validation error. */ } list.replaceChildren(...items); }
    const stale = this.aiProposalIsStale();
    const unresolved = this.aiProposal.value.operations.some((operation, index) => operation.type === "request_guide_target" && !this.aiResolvedTargets.has(index));
    const target = this.root.querySelector<HTMLButtonElement>("[data-ai-target]"); if (target) target.hidden = !this.guide || !unresolved;
    const sourceProposal = this.aiProposal.value.operations.some(operation => operation.type === "replace_markup");
    const preview = this.root.querySelector<HTMLButtonElement>("[data-ai-preview]"); if (preview) { preview.hidden = !this.guide && !this.survey && !this.checklist && !sourceProposal; preview.textContent = sourceProposal ? "Preview design" : this.guide ? "Preview Guide" : "Preview"; preview.disabled = stale || unresolved; }
    const apply = this.root.querySelector<HTMLButtonElement>("[data-ai-apply]"); if (apply) { apply.disabled = stale || unresolved; apply.title = stale ? "Draft changed; generate a fresh proposal." : unresolved ? "Select each requested website target first." : "Apply as one undoable change"; }
    if (stale) this.setText("[data-ai-status]", "The draft changed. Discard this proposal and generate a fresh one.");
  }

  private async sendAiPrompt(): Promise<void> {
    const input = this.root?.querySelector<HTMLTextAreaElement>("[data-ai-prompt]"); const prompt = input?.value.trim();
    const builder = this.currentBuilder(), sourceMode = isSourceAuthored(builder);
    if (!prompt || !this.bridge || !this.draft || !builder || !this.compositionSelection || (!this.compositionEditor && !sourceMode)) return;
    if (!this.flushContent() || this.dirty && !await this.persist()) return;
    this.cancelAiRequest(); const generation = ++this.aiRequestGeneration; const abort = new AbortController(); this.aiAbort = abort;
    const send = this.root?.querySelector<HTMLButtonElement>("[data-ai-send]"); if (send) send.disabled = true;
    const cancel = this.root?.querySelector<HTMLButtonElement>("[data-ai-cancel]"); if (cancel) cancel.hidden = false;
    this.aiMessages.push({ role: "user", text: prompt }); if (input) input.value = "";
    this.setText("[data-ai-status]", "Generating a validated proposal…"); this.discardAiPreview(); this.aiProposal = null; this.aiResolvedTargets.clear(); this.syncAiPanel();
    try {
      const document = onsiteDocumentFromBuilder(builder); if (!document) throw new Error("This draft has no recoverable on-site document.");
      const context = this.guide ? guideAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, builderMode: "onsite" }, revision: this.draft.version.revision, guide: this.guide as RuntimeGuideDefinition & { targeting: ExperienceTargeting }, currentStepId: this.guide.steps[this.stepIndex].id, selection: this.compositionSelection, theme: resolvedTheme(this.ensureThemeState()), scope: this.compositionSelection.kind === "step" ? "guide" : "step" }) : this.survey ? surveyAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, builderMode: "onsite" }, revision: this.draft.version.revision, definition: this.definition as RuntimeWidgetDefinition & { targeting: ExperienceTargeting }, currentStepId: this.survey.steps[this.stepIndex].id, selection: this.compositionSelection, scope: this.compositionSelection.kind === "step" ? "survey" : "step" }) : this.checklist ? checklistAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, builderMode: "onsite" }, revision: this.draft.version.revision, checklist: this.checklist, references: this.draft.references ?? { guides: [], segments: [] }, selection: this.compositionSelection, currentView: this.checklistEditor?.getView() ?? "expanded", theme: resolvedTheme(this.ensureThemeState()) }) : editorAiContext({ experience: { id: this.draft.experience.id, name: this.draft.experience.name, widgetType: this.draft.experience.widgetType ?? null, builderMode: "onsite" }, selection: this.compositionSelection, document, builder });
      const response = await this.bridge.chat({ conversationId: this.aiConversationId, prompt, revision: this.draft.version.revision, context }, abort.signal);
      if (generation !== this.aiRequestGeneration) return;
      this.aiConversationId = response.conversationId; this.aiProposal = response.proposal ? { value: response.proposal as EditorAiProposal | SurveyAiProposal | ChecklistAiProposal, revision: response.revision, generation: this.editGeneration, selectionKey: this.aiSelectionKey() } : null;
      this.aiMessages.push({ role: "assistant", text: response.markdown.trim() || "Proposal generated." }); this.setText("[data-ai-status]", ""); this.syncAiPanel();
    } catch (error) {
      if (generation === this.aiRequestGeneration && !abort.signal.aborted) { if (error instanceof DraftConflictError) this.saveState = "conflict"; if (error instanceof EditorAiRequestError && error.conversationId) this.aiConversationId = error.conversationId; this.setText("[data-ai-status]", error instanceof Error ? error.message : "Movcues AI could not complete this request."); this.showSaveState(); }
    } finally { if (generation === this.aiRequestGeneration) { this.aiAbort = null; if (send) send.disabled = false; if (cancel) cancel.hidden = true; } }
  }

  private cancelAiRequest(): void { if (!this.aiAbort) return; this.aiAbort.abort(); this.aiAbort = null; this.aiRequestGeneration++; this.setText("[data-ai-status]", "Request canceled. Your prompt is still here."); const send = this.root?.querySelector<HTMLButtonElement>("[data-ai-send]"); if (send) send.disabled = false; const cancel = this.root?.querySelector<HTMLButtonElement>("[data-ai-cancel]"); if (cancel) cancel.hidden = true; }

  private applyAiProposal(): void {
    if (!this.aiProposal || !this.draft || this.aiProposalIsStale()) { this.syncAiPanel(); return; }
    if (this.checklist) { try { const before = cloneOnsite(this.checklistAiPreviewOriginal ?? this.checklist), candidate = this.checklistAiPreviewCandidate ?? applyChecklistAiProposal(before, this.aiProposal.value as ChecklistAiProposal, this.draft.references ?? { guides: [], segments: [] }).definition; this.checklistAiUndo.push(before); if (this.checklistAiUndo.length > 20) this.checklistAiUndo.shift(); this.checklistAiRedo = []; this.setChecklistDefinition(cloneOnsite(candidate)); this.checklistAiPreviewOriginal = null; this.checklistAiPreviewCandidate = null; this.aiPreviewReturnMode = null; this.aiProposal = null; this.changed(true, true); this.setText("[data-ai-status]", "Applied. Undo restores the complete Checklist in one step."); this.syncAiPanel(); } catch (error) { this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Checklist proposal is invalid."); } return; }
    if (this.survey) {
      try { const before = cloneOnsite(this.surveyAiPreviewOriginal ?? this.definition as RuntimeWidgetDefinition & { targeting: ExperienceTargeting }); const candidate = this.surveyAiPreviewCandidate ?? applySurveyAiProposal(before, this.aiProposal.value as SurveyAiProposal).definition; this.surveyAiUndo.push(before); if (this.surveyAiUndo.length > 20) this.surveyAiUndo.shift(); this.surveyAiRedo = []; this.setSurveyDefinition(cloneOnsite(candidate)); this.surveyAiPreviewOriginal = null; this.surveyAiPreviewCandidate = null; this.aiPreviewReturnMode = null; this.aiProposal = null; this.changed(true, true); this.refreshStepBar(); this.setText("[data-ai-status]", "Applied. Undo restores the complete Survey in one step."); this.syncAiPanel(); } catch (error) { this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Survey proposal is invalid."); } return;
    }
    if (!this.guide) {
      if (this.aiProposal.value.operations.some(operation => operation.type === "replace_markup")) { try { const before = cloneOnsite(this.widgetAiPreviewOriginal ?? this.definition as RuntimeWidgetDefinition & { targeting: ExperienceTargeting }), candidate = this.widgetAiPreviewCandidate ?? this.applyWidgetSourceProposal(before); this.widgetAiUndo.push(before); if (this.widgetAiUndo.length > 20) this.widgetAiUndo.shift(); this.widgetAiRedo = []; this.definition = cloneOnsite(candidate); this.widgetAiPreviewOriginal = null; this.widgetAiPreviewCandidate = null; this.aiPreviewReturnMode = null; this.aiProposal = null; this.changed(true, true); this.setText("[data-ai-status]", "Applied atomically. This widget is now in Source mode; Undo restores the prior structured design."); this.syncAiPanel(); } catch (error) { this.setText("[data-ai-status]", error instanceof Error ? error.message : "The source proposal is invalid."); } return; }
      if (this.compositionEditor?.applyAiProposal(this.aiProposal.value as EditorAiProposal)) { this.aiProposal = null; this.setText("[data-ai-status]", "Applied. Use Undo to revert the entire proposal."); this.syncAiPanel(); } return;
    }
    try {
      const before = cloneOnsite(this.aiPreviewOriginal ?? this.guide as RuntimeGuideDefinition & { targeting: ExperienceTargeting });
      const candidate = this.aiPreviewCandidate ?? applyGuideAiProposal(before, this.aiProposal.value as EditorAiProposal, this.aiResolvedTargets).guide;
      this.guideAiUndo.push(before); if (this.guideAiUndo.length > 20) this.guideAiUndo.shift(); this.guideAiRedo = [];
      this.setGuideDefinition(cloneOnsite(candidate)); this.aiPreviewOriginal = null; this.aiPreviewCandidate = null; this.aiPreviewReturnMode = null; this.aiProposal = null; this.aiResolvedTargets.clear();
      this.changed(true, true); this.refreshStepBar(); this.setText("[data-ai-status]", "Applied. Undo restores the complete Guide in one step."); this.syncAiPanel();
    } catch (error) { this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Guide proposal is invalid."); }
  }

  private resolveAiGuideTarget(): void {
    if (!this.aiProposal || !this.guide) return; this.discardAiPreview();
    const operationIndex = this.aiProposal.value.operations.findIndex((operation, index) => operation.type === "request_guide_target" && !this.aiResolvedTargets.has(index));
    const operation = this.aiProposal.value.operations[operationIndex]; if (!operation || operation.type !== "request_guide_target") return;
    const index = this.guide.steps.findIndex(step => step.id === operation.stepId); if (index < 0 || !this.flushContent()) return;
    this.stepIndex = index; const generation = ++this.selectionGeneration; this.picker.cancel(); this.compositionEditor?.destroy(); this.compositionEditor = null; this.compositionSelection = null; this.preview.destroy(); this.previewRendered = false;
    this.setText("[data-ai-status]", `Select the website element for this step's ${operation.targetKind === "position" ? "position" : "advance trigger"}. Escape cancels.`);
    void this.picker.pick().then(target => {
      if (generation !== this.selectionGeneration || !target) { this.renderPreview(); this.syncPanel(); return; }
      this.aiResolvedTargets.set(operationIndex, { ...target, targetContext: { pagePath: currentPagePath() } }); this.renderPreview(); this.syncPanel(); this.syncAiPanel();
    });
  }

  private previewAiGuideProposal(): void {
    if (!this.aiProposal || !this.guide || !this.draft || this.aiProposal.revision !== this.draft.version.revision || this.aiProposal.generation !== this.editGeneration) return;
    try {
      this.discardAiPreview(); const original = cloneOnsite(this.guide as RuntimeGuideDefinition & { targeting: ExperienceTargeting }); this.aiPreviewReturnMode = this.mode;
      const result = applyGuideAiProposal(original, this.aiProposal.value as EditorAiProposal, this.aiResolvedTargets); this.aiPreviewOriginal = original; this.aiPreviewCandidate = cloneOnsite(result.guide);
      this.setGuideDefinition(cloneOnsite(result.guide)); this.stepIndex = 0; this.refreshStepBar(); this.startGuidePreview(); this.setText("[data-ai-status]", "Previewing the complete proposed Guide. Apply or Discard to finish.");
    } catch (error) { this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Guide proposal is invalid."); }
  }

  private discardAiPreview(): void {
    if (this.widgetAiPreviewOriginal) { const returnMode = this.aiPreviewReturnMode; this.definition = this.widgetAiPreviewOriginal; this.widgetAiPreviewOriginal = null; this.widgetAiPreviewCandidate = null; this.aiPreviewReturnMode = null; if (returnMode && returnMode !== this.mode) this.setMode(returnMode); else if (this.mode !== "navigate") this.renderPreview(); return; }
    if (this.checklistAiPreviewOriginal) { const returnMode = this.aiPreviewReturnMode; this.setChecklistDefinition(this.checklistAiPreviewOriginal); this.checklistAiPreviewOriginal = null; this.checklistAiPreviewCandidate = null; this.aiPreviewReturnMode = null; if (returnMode && returnMode !== this.mode) this.setMode(returnMode); else if (this.mode !== "navigate") this.renderPreview(); return; }
    if (this.surveyAiPreviewOriginal) { const returnMode = this.aiPreviewReturnMode; this.setSurveyDefinition(this.surveyAiPreviewOriginal); this.surveyAiPreviewOriginal = null; this.surveyAiPreviewCandidate = null; this.aiPreviewReturnMode = null; this.stepIndex = clampStep(this.stepIndex, this.survey!.steps.length); this.refreshStepBar(); if (returnMode && returnMode !== this.mode) this.setMode(returnMode); else if (this.mode !== "navigate") this.renderPreview(); return; }
    if (!this.aiPreviewOriginal) return; const returnMode = this.aiPreviewReturnMode; this.setGuideDefinition(this.aiPreviewOriginal); this.aiPreviewOriginal = null; this.aiPreviewCandidate = null; this.aiPreviewReturnMode = null; this.stepIndex = clampStep(this.stepIndex, this.guide!.steps.length); this.refreshStepBar(); if (returnMode && returnMode !== this.mode) this.setMode(returnMode); else if (this.mode !== "navigate") this.renderPreview();
  }

  private discardAiProposal(): void { this.discardAiPreview(); this.aiProposal = null; this.aiResolvedTargets.clear(); this.setText("[data-ai-status]", "Proposal discarded. No draft changes were made."); this.syncAiPanel(); }

  private setGuideDefinition(value: RuntimeGuideDefinition & { targeting: ExperienceTargeting }): void { this.guide = value; this.definition = value; }

  private setSurveyDefinition(value: RuntimeWidgetDefinition & { targeting: ExperienceTargeting }): void { this.definition = value; this.survey = value.survey ?? null; }

  private setChecklistDefinition(value: EditorChecklistDefinition): void { this.checklist = value; this.definition = checklistEditorAdapter(value); this.checklistEditor?.setDefinition(value); }

  private applyWidgetSourceProposal(source: RuntimeWidgetDefinition & { targeting: ExperienceTargeting }): RuntimeWidgetDefinition & { targeting: ExperienceTargeting } {
    if (!this.aiProposal || !this.draft || this.guide || this.survey || this.checklist) throw new Error("Source proposal target is unavailable.");
    const operations = this.aiProposal.value.operations, operation = operations[0] as ReplaceMarkupOperation | undefined;
    if (operations.length !== 1 || operation?.type !== "replace_markup" || operation.stepId) throw new Error("A widget source replacement must be one atomic widget-scoped operation.");
    const candidate = cloneOnsite(source); if (!candidate.builder) throw new Error("Widget has no builder source.");
    if (operation.widthPx !== undefined) {
      if (this.draft.experience.widgetType !== "modal") throw new Error("Only modal source replacements can change the outer width.");
      candidate.design.size = { width: { mode: "fixed", value: operation.widthPx }, height: candidate.design.size?.height ?? { mode: "auto" } };
    }
    applySourceMarkup(candidate.builder, candidate.content, operation, { widgetType: this.draft.experience.widgetType ?? "modal", guide: false }); return candidate;
  }

  private previewAiWidgetSourceProposal(): void {
    if (!this.aiProposal || !this.draft || !this.definition || this.aiProposalIsStale()) return;
    try { this.discardAiPreview(); const original = cloneOnsite(this.definition as RuntimeWidgetDefinition & { targeting: ExperienceTargeting }), candidate = this.applyWidgetSourceProposal(original); this.aiPreviewReturnMode = this.mode; this.widgetAiPreviewOriginal = original; this.widgetAiPreviewCandidate = cloneOnsite(candidate); this.definition = cloneOnsite(candidate); this.setMode("preview"); this.setText("[data-ai-status]", "Previewing the complete source-authored design. Apply or Discard to finish."); }
    catch (error) { this.setText("[data-ai-status]", error instanceof Error ? error.message : "The source proposal is invalid."); }
  }

  private previewAiChecklistProposal(): void { if (!this.aiProposal || !this.checklist || !this.draft || this.aiProposalIsStale()) return; try { this.discardAiPreview(); const original = cloneOnsite(this.checklist), result = applyChecklistAiProposal(original, this.aiProposal.value as ChecklistAiProposal, this.draft.references ?? { guides: [], segments: [] }); this.aiPreviewReturnMode = this.mode; this.checklistAiPreviewOriginal = original; this.checklistAiPreviewCandidate = cloneOnsite(result.definition); this.setChecklistDefinition(cloneOnsite(result.definition)); this.setMode("preview"); this.setText("[data-ai-status]", `Previewing the complete proposed Checklist.${result.warnings.length ? ` ${result.warnings.join(" ")}` : ""} Apply or Discard to finish.`); } catch (error) { this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Checklist proposal is invalid."); } }

  private aiSelectionKey(): string { return JSON.stringify({ selection: this.compositionSelection, checklistView: this.checklistEditor?.getView() }); }
  private aiProposalIsStale(): boolean { return !this.aiProposal || this.aiProposal.revision !== this.draft?.version.revision || this.aiProposal.generation !== this.editGeneration || !this.aiPreviewOriginal && !this.surveyAiPreviewOriginal && !this.checklistAiPreviewOriginal && !this.widgetAiPreviewOriginal && this.aiProposal.selectionKey !== this.aiSelectionKey(); }

  private previewAiSurveyProposal(): void {
    if (!this.aiProposal || !this.survey || !this.draft || this.aiProposal.revision !== this.draft.version.revision || this.aiProposal.generation !== this.editGeneration) return;
    try { this.discardAiPreview(); const original = cloneOnsite(this.definition as RuntimeWidgetDefinition & { targeting: ExperienceTargeting }), result = applySurveyAiProposal(original, this.aiProposal.value as SurveyAiProposal); this.aiPreviewReturnMode = this.mode; this.surveyAiPreviewOriginal = original; this.surveyAiPreviewCandidate = cloneOnsite(result.definition); this.setSurveyDefinition(cloneOnsite(result.definition)); this.stepIndex = 0; this.refreshStepBar(); this.setMode("preview"); this.setText("[data-ai-status]", `Previewing the complete proposed Survey.${result.warnings.length ? ` ${result.warnings.join(" ")}` : ""} Apply or Discard to finish.`); }
    catch (error) { this.setText("[data-ai-status]", error instanceof Error ? error.message : "The Survey proposal is invalid."); }
  }

  private globalUndo(): void {
    if (!this.guide && !this.survey && !this.checklist && this.widgetAiUndo.length && this.flushContent()) { const previous = this.widgetAiUndo.pop()!; this.widgetAiRedo.push(cloneOnsite(this.definition as RuntimeWidgetDefinition & { targeting: ExperienceTargeting })); this.definition = previous; this.changed(true, true); return; }
    if (this.guide && this.guideAiUndo.length && this.flushContent()) { const previous = this.guideAiUndo.pop()!; this.guideAiRedo.push(cloneOnsite(this.guide as RuntimeGuideDefinition & { targeting: ExperienceTargeting })); this.setGuideDefinition(previous); this.stepIndex = clampStep(this.stepIndex, previous.steps.length); this.changed(true, true); this.refreshStepBar(); return; }
    if (this.survey && this.surveyAiUndo.length && this.flushContent()) { const previous = this.surveyAiUndo.pop()!; this.surveyAiRedo.push(cloneOnsite(this.definition as RuntimeWidgetDefinition & { targeting: ExperienceTargeting })); this.setSurveyDefinition(previous); this.stepIndex = clampStep(this.stepIndex, this.survey!.steps.length); this.changed(true, true); this.refreshStepBar(); return; }
    if (this.checklist && this.checklistAiUndo.length && this.flushContent()) { const previous = this.checklistAiUndo.pop()!; this.checklistAiRedo.push(cloneOnsite(this.checklist)); this.setChecklistDefinition(previous); this.changed(true, true); return; }
    this.compositionEditor?.undo(); this.contentEditor?.undo(); this.syncContentInspector();
  }

  private globalRedo(): void {
    if (!this.guide && !this.survey && !this.checklist && this.widgetAiRedo.length && this.flushContent()) { const next = this.widgetAiRedo.pop()!; this.widgetAiUndo.push(cloneOnsite(this.definition as RuntimeWidgetDefinition & { targeting: ExperienceTargeting })); this.definition = next; this.changed(true, true); return; }
    if (this.guide && this.guideAiRedo.length && this.flushContent()) { const next = this.guideAiRedo.pop()!; this.guideAiUndo.push(cloneOnsite(this.guide as RuntimeGuideDefinition & { targeting: ExperienceTargeting })); this.setGuideDefinition(next); this.stepIndex = clampStep(this.stepIndex, next.steps.length); this.changed(true, true); this.refreshStepBar(); return; }
    if (this.survey && this.surveyAiRedo.length && this.flushContent()) { const next = this.surveyAiRedo.pop()!; this.surveyAiUndo.push(cloneOnsite(this.definition as RuntimeWidgetDefinition & { targeting: ExperienceTargeting })); this.setSurveyDefinition(next); this.stepIndex = clampStep(this.stepIndex, this.survey!.steps.length); this.changed(true, true); this.refreshStepBar(); return; }
    if (this.checklist && this.checklistAiRedo.length && this.flushContent()) { const next = this.checklistAiRedo.pop()!; this.checklistAiUndo.push(cloneOnsite(this.checklist)); this.setChecklistDefinition(next); this.changed(true, true); return; }
    this.compositionEditor?.redo(); this.contentEditor?.redo(); this.syncContentInspector();
  }

  private syncPanel(): void {
    if (!this.root || !this.definition || !this.draft) return;
    this.syncGuideBehavior();
    const reset = this.root.querySelector<HTMLElement>("[data-reset-preview]"); if (reset) reset.hidden = this.mode !== "preview";
    const limit = this.root.querySelector<HTMLElement>("[data-preview-limit]"); if (limit) limit.hidden = this.mode !== "preview";
    const behavior = this.currentBehavior();
    const widgetType = this.draft.experience.widgetType;
    const guidePattern = this.guide ? getGuideStepPattern(this.guide.steps[this.stepIndex]) : null;
    const activeGroups = new Set<string>(guidePattern === "anchored_card" ? ["target", "anchored", "backdrop"] : !this.guide && widgetType === "anchored_card" ? ["target", "anchored", "backdrop"] : guidePattern === "modal" ? [] : widgetType === "hotspot" ? ["target", "anchored", "hotspot"] : widgetType === "toast" ? ["toast"] : widgetType === "modal" || widgetType === "survey" ? ["modal", "backdrop"] : widgetType === "slideout" ? ["slideout", "backdrop"] : widgetType === "banner" ? ["banner"] : ["cursor"]);
    this.root.querySelectorAll<HTMLElement>("[data-for]").forEach(group => { group.hidden = !activeGroups.has(group.dataset.for!); });
    if (this.mode !== "design") this.root.querySelectorAll<HTMLElement>("[data-step-only]").forEach(group => { group.hidden = this.mode !== "target" || group.dataset.for !== "target" || !activeGroups.has("target"); });
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
    this.syncContentInspector();
    this.syncCompositionInspector();
    this.syncThemeInspector();
    this.hideChecklistWidgetControls();
    this.setText("[data-mode-hint]", this.mode === "design" && this.draft.experience.widgetType === "cursor_follow" ? "Stationary authoring view · Preview tests cursor-follow movement" : this.mode === "design" && this.isTargetedType() && !this.currentTarget() ? "Select a page target in Target mode before editing this anchored card" : this.mode === "design" ? "Click a component to select · Double-click text to edit" : this.mode === "target" ? this.isTargetedType() ? "Select an element · Hold Shift to interact temporarily" : "This experience does not need a page target" : this.mode === "navigate" ? "Customer app interaction is enabled" : "End-user preview · analytics and actions are disabled");
  }

  private hideChecklistWidgetControls():void {
    if(!this.checklist||!this.root)return;
    this.root.querySelectorAll<HTMLElement>('[data-step-only],[data-edge]').forEach(node=>node.hidden=true);
    const target=this.root.querySelector<HTMLButtonElement>('[data-mode=target]');if(target){target.hidden=true;target.disabled=true;}
    this.setText('[data-preview-limit]',"Simulated Checklist progress only. No visitor records, Guide launches, navigation or production analytics are sent. Website JavaScript may still have side effects.");
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
      if (!guideStep) { button.remove(); return; }
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

  private configureDiagnostics(): void {
    this.mutationObserver?.disconnect(); this.mutationObserver = null;
    if (this.mode !== "target" || typeof MutationObserver === "undefined") return;
    this.mutationObserver = new MutationObserver(() => this.scheduleTargetRefresh());
    this.mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["id", "class", "data-testid", "hidden"] });
  }

  private fitPanel = (): void => {
    const aside = this.root?.querySelector<HTMLElement>("aside"); if (!aside) return;
    const viewport = window.visualViewport;
    const width = viewport?.width ?? innerWidth; const height = viewport?.height ?? innerHeight;
    const x = viewport?.offsetLeft ?? 0; const y = viewport?.offsetTop ?? 0;
    const toolbar = this.root?.querySelector<HTMLElement>("[data-editor-toolbar]");
    if (toolbar) {
      toolbar.style.maxWidth = `${Math.max(0, width - 8)}px`;
      const bounds = toolbar.getBoundingClientRect();
      if (bounds.left < x + 4 || bounds.right > x + width - 4 || bounds.top < y + 4 || bounds.bottom > y + height - 4) {
        toolbar.style.transform = "none"; toolbar.style.left = `${Math.max(x + 4, Math.min(x + width - bounds.width - 4, bounds.left))}px`;
        toolbar.style.top = `${Math.max(y + 4, Math.min(y + height - bounds.height - 4, bounds.top))}px`;
      }
    }
    aside.style.maxWidth = `${Math.max(0, width - 8)}px`; aside.style.maxHeight = `${Math.max(48, height - 8)}px`;
    const main = this.root?.querySelector<HTMLElement>("main"); if (main) main.style.maxHeight = `${Math.max(0, width <= 480 ? height * .38 : height - 32)}px`;
    const rect = aside.getBoundingClientRect();
    if (aside.style.left) aside.style.left = `${Math.max(x + 4, Math.min(x + width - rect.width - 4, rect.left))}px`;
    if (width <= 480) { aside.style.top = "auto"; aside.style.bottom = this.guide || this.survey ? "70px" : "8px"; }
    else { aside.style.bottom = "auto"; aside.style.top = `${Math.max(y + 4, Math.min(y + height - 48, rect.top || y + 4))}px`; }
  };

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
    if (this.mode === "preview" && this.guide && !this.guidePreviewComplete) {
      const advance = this.guide.steps[this.stepIndex].advance;
      if (next !== this.guidePreviewEntryPath && advance?.type === "route" && matchesGuideRoute(next, advance.pageRules)) { this.advanceGuidePreview(1); return; }
    }
    if (this.mode !== "navigate" && !this.guidePreviewComplete) { this.renderPreview(); if (this.mode === "target") this.startPicker(); }
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
    if (this.guide) return this.guide.steps[this.stepIndex].behavior.layer ?? this.guide.behavior?.layer;
    const widget = this.definition as RuntimeWidgetDefinition;
    return this.survey ? this.survey.steps[this.stepIndex].behavior?.layer ?? widget.behavior.layer : widget.behavior.layer;
  }

  private setLayer(layer: ExperienceLayer): void {
    if (!this.definition) return;
    if (this.guide) this.guide.steps[this.stepIndex].behavior.layer = layer;
    else if (this.survey) { const step = this.survey.steps[this.stepIndex]; step.behavior = { ...step.behavior, layer }; }
    else (this.definition as RuntimeWidgetDefinition).behavior.layer = layer;
  }

  private setTarget(target: ExperienceTarget): void {
    if (!this.definition) return;
    const contextualTarget: ExperienceTarget = { ...target, targetContext: { pagePath: currentPagePath() } };
    if (this.guide) { const step = this.guide.steps[this.stepIndex]; if (!guideStepRequiresTarget(step)) return; step.target = contextualTarget; }
    else (this.definition as RuntimeWidgetDefinition).target = contextualTarget;
  }

  private updateContinuation(): void {
    if (!this.session || !this.draft || this.saveState === "expired") return;
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

  private protectPreviewSubmission = (event: Event): void => {
    if (this.mode !== "preview") return;
    event.preventDefault();
    this.setText("[data-trigger-status]", "Form submission is disabled in preview. Use Next to continue safely.");
  };

  private protectPreviewNavigation = (event: MouseEvent): void => {
    if (this.mode !== "preview") return;
    const link = event.composedPath().find(node => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
    if (!link) return;
    try {
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !["http:", "https:"].includes(url.protocol) || link.target === "_blank" || link.hasAttribute("download")) {
        event.preventDefault();
        this.setText("[data-trigger-status]", "External navigation is disabled in preview. Use Next to continue safely.");
      }
    } catch { event.preventDefault(); }
  };

  private setText(selector: string, value: string): void { const element = this.root?.querySelector<HTMLElement>(selector); if (element) element.textContent = value; }
  private setValue(selector: string, value: string): void { const element = this.root?.querySelector<HTMLInputElement | HTMLSelectElement>(selector); if (element && element !== this.root?.activeElement) element.value = value; }
  private setChecked(selector: string, value: boolean): void { const element = this.root?.querySelector<HTMLInputElement>(selector); if (element) element.checked = value; }

  destroy(): void { this.teardown(true); }

  private teardown(clearContinuation: boolean): void {
    this.lifecycle++;
    this.cancelAiRequest(); this.aiProposal = null; this.aiConversationId = undefined; this.aiMessages = []; this.aiResolvedTargets.clear(); this.aiPreviewOriginal = null; this.aiPreviewCandidate = null; this.surveyAiPreviewOriginal = null; this.surveyAiPreviewCandidate = null; this.checklistAiPreviewOriginal = null; this.checklistAiPreviewCandidate = null; this.widgetAiPreviewOriginal = null; this.widgetAiPreviewCandidate = null; this.aiPreviewReturnMode = null; this.guideAiUndo = []; this.guideAiRedo = []; this.surveyAiUndo = []; this.surveyAiRedo = []; this.checklistAiUndo = []; this.checklistAiRedo = []; this.widgetAiUndo = []; this.widgetAiRedo = [];
    clearTimeout(this.expiryTimer);
    clearInterval(this.validationTimer);
    clearTimeout(this.saveTimer);
    clearTimeout(this.targetRefreshTimer);
    this.selectionGeneration++;
    this.routeUnsubscribe?.(); this.routeUnsubscribe = null;
    this.routeObserver.stop();
    window.removeEventListener("pagehide", this.persistBeforePageLeave);
    document.removeEventListener("click", this.protectPreviewNavigation, true);
    document.removeEventListener("submit", this.protectPreviewSubmission, true);
    window.removeEventListener("beforeunload", this.protectUnsavedChanges);
    window.removeEventListener("resize", this.fitPanel);
    window.visualViewport?.removeEventListener("resize", this.fitPanel);
    window.visualViewport?.removeEventListener("scroll", this.fitPanel);
    this.mutationObserver?.disconnect(); this.mutationObserver = null;
    this.dragCleanup?.(); this.dragCleanup = null;
    this.contentEditor?.flush(); this.compositionEditor?.flush();
    this.previewGeneration++; this.preview.destroy();
    this.contentEditor?.destroy(); this.contentEditor = null; this.componentSelection = null;
    this.compositionEditor?.destroy(); this.compositionEditor = null; this.compositionSelection = null;
    this.picker.cancel();
    this.host?.remove();
    this.surveyEditor?.destroy(); this.surveyEditor = null;
    this.checklistEditor?.destroy();this.checklistEditor=null;this.checklist=null;
    this.host = null; this.root = null; this.bridge = null; this.session = null; this.draft = null; this.definition = null; this.guide = null; this.survey = null;
    this.saveState = "clean"; this.editGeneration = 0; this.recoveryDraft = null;
    this.dirty = false; this.previewRendered = false; this.saveInFlight = null;
    if (clearContinuation) clearEditorContinuation();
  }
}

function placementButton(value: NonNullable<ExperienceBehavior["placement"]>, label: string): string { return `<button type="button" data-placement="${value}">${label}</button>`; }
function editorId(prefix: string): string { const bytes = crypto.getRandomValues(new Uint32Array(2)); return `${prefix}_${Array.from(bytes).map(value => value.toString(36)).join("")}`.slice(0, 64); }
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

const BASE_STYLE = `
:host{all:initial}*{box-sizing:border-box}aside{position:fixed;right:12px;top:12px;width:min(326px,calc(100vw - 8px));max-height:calc(100dvh - 24px);z-index:2147483647;overflow:hidden;background:#fff;color:#111827;border:1px solid #d7dce3;border-radius:12px;box-shadow:0 18px 50px rgba(15,23,42,.24);font:13px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif}aside.left-side{left:12px;right:auto}header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px 12px 10px;border-bottom:1px solid #e5e7eb;cursor:move;user-select:none}.header-copy{display:grid;min-width:0}.header-copy strong{font-size:13px}.header-copy>span{overflow:hidden;color:#4b5563;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.header-copy small{margin-top:3px;color:#6b7280;font-size:11px}.header-copy i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a}.header-actions{display:flex;gap:2px}.header-actions button{width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:#64748b;font:16px/1 inherit;cursor:pointer}.header-actions button:hover{background:#f1f5f9;color:#0f172a}main{max-height:calc(100dvh - 82px);overflow:auto}.minimized{width:min(260px,calc(100vw - 8px))}.minimized main{display:none}.modebar{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px;border-bottom:1px solid #e5e7eb}.modebar button,.secondary-button,.placement-grid button,.formatbar button{border:1px solid #d7dce3;border-radius:7px;background:#fff;color:#334155;font:600 12px inherit;cursor:pointer}.modebar button{min-width:0;padding:7px 3px}.modebar button:disabled{cursor:not-allowed;opacity:.42}.modebar button.active,.placement-grid button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.notice{display:grid;gap:2px;margin:8px 10px 0;padding:8px;border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;color:#1e40af;font-size:11px}.section{display:grid;gap:8px;padding:10px 12px;border-bottom:1px solid #eef0f3}.eyebrow{color:#64748b;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.muted,.hint{color:#64748b;font-size:11px}.hint{margin:0;padding:9px 12px}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.step-navigator{position:fixed;left:50%;bottom:10px;width:min(680px,calc(100vw - 16px));transform:translateX(-50%);z-index:2147483647;border:1px solid #d7dce3;border-radius:10px;background:#fff;box-shadow:0 10px 32px rgba(15,23,42,.18)}.step-flow{display:flex;align-items:stretch;gap:4px;overflow:auto}.step{display:grid;grid-template-columns:auto minmax(54px,1fr) auto;align-items:center;gap:4px;flex:none;max-width:130px;padding:5px 7px;border:0;border-radius:6px;background:transparent;color:#64748b;font:600 11px inherit;cursor:pointer}.step small{overflow:hidden;font:10px/1.2 inherit;text-overflow:ellipsis;white-space:nowrap}.step i{font-style:normal}.step.active{background:#eff6ff;color:#1d4ed8}.step[data-step-status=found]{color:#15803d}.step[data-step-status=missing]{color:#b45309}.step.active{color:#1d4ed8}.reliability{color:#64748b;font-size:11px}.reliability[data-level=reliable]{color:#15803d}.reliability[data-level=fragile]{color:#b45309}.secondary-button{padding:7px 9px}.secondary-button.compact{padding:5px 7px}.content-heading,.history-row,.link-row,.save-recovery{display:flex;align-items:center;justify-content:space-between;gap:6px}.content-heading>div{min-width:0}.formatbar{display:flex;flex-wrap:wrap;gap:4px}.formatbar button{padding:5px 7px}.link-row input{min-width:0}.history-row{justify-content:flex-start;flex-wrap:wrap}.save-recovery{flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid #fee2e2;background:#fff7ed;color:#9a3412;font-size:11px}.placement-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.placement-grid button{padding:6px}.placement-grid button[data-placement=top]{grid-column:2}.placement-grid button[data-placement=left]{grid-column:1}.placement-grid button[data-placement=auto]{grid-column:2}.placement-grid button[data-placement=right]{grid-column:3}.placement-grid button[data-placement=bottom]{grid-column:2}label{display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:8px;color:#475569;font-size:11px}label.check{display:flex}label.check input{width:auto}input,select{min-width:0;width:100%;padding:6px 7px;border:1px solid #d7dce3;border-radius:6px;background:#fff;color:#111827;font:12px inherit}.number{display:grid;grid-template-columns:1fr auto;align-items:center;gap:5px}.number span{color:#64748b;font-size:11px}dl{display:grid;grid-template-columns:82px minmax(0,1fr);gap:5px 8px;margin:0;font-size:11px}dt{color:#64748b}dd{min-width:0;margin:0;overflow-wrap:anywhere;color:#1f2937}.live{font-size:11px}.status-ok{color:#15803d}.status-error{color:#b91c1c}.live code{display:block;overflow:hidden;padding:4px 6px;border-radius:5px;background:#f8fafc;color:#475569;font:11px/1.35 ui-monospace,SFMono-Regular,monospace;text-overflow:ellipsis;white-space:nowrap}[data-missing-selector]{display:grid;gap:5px;padding-top:4px;color:#b91c1c}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #2563eb;outline-offset:2px}textarea[data-recovery-export]{box-sizing:border-box;width:100%;height:180px;font:11px monospace}[hidden]{display:none!important}@media(max-width:480px){.step-navigator{position:static;width:auto;transform:none;box-shadow:none}}@media(max-width:420px){aside{right:4px;top:4px;max-height:calc(100dvh - 8px)}aside.left-side{left:4px}main{max-height:calc(100dvh - 66px)}header{padding:9px}.section{padding:8px 10px}.modebar{padding:6px}.modebar button{font-size:10px}}
`;

const STYLE = `${BASE_STYLE}
.editor-toolbar{position:fixed;left:50%;transform:translateX(-50%);top:12px;width:min(410px,calc(100vw - 8px));z-index:2147483647;border:1px solid #d7dce3;border-radius:10px;background:#fff;color:#111827;box-shadow:0 8px 24px rgba(15,23,42,.16);font:12px/1.3 ui-sans-serif,system-ui,sans-serif;overflow:hidden}
.editor-toolbar header{padding:7px 8px;gap:4px;align-items:center}.header-copy>span{display:none}.header-copy strong{font-size:11px}.header-copy small{margin-top:1px;font-size:10px}.header-actions{flex-wrap:wrap;justify-content:flex-end;gap:1px}.header-actions button{width:25px;height:28px;font-size:14px}.header-actions [data-save]{width:38px;font-size:11px}.header-actions button:disabled{opacity:.4;cursor:default}
.editor-toolbar,aside,.step-navigator{pointer-events:auto}.editor-toolbar .modebar{padding:5px;border-bottom:0}.editor-toolbar .modebar button{padding:6px 3px;font-size:11px}.minimized{display:none}aside{box-shadow:0 8px 24px rgba(15,23,42,.14)}main{overscroll-behavior:contain}details.live{display:block}details.live summary{cursor:pointer;color:#64748b;font-size:11px}details.live[open]>div{margin-top:6px}.step-navigator{display:flex;align-items:center;gap:8px;width:min(680px,calc(100vw - 16px));padding:6px 8px}.step-drag-handle{flex:none;padding:2px 1px;color:#94a3b8;font-size:16px;line-height:1;cursor:move;touch-action:none;user-select:none}.step-navigator .content-heading{flex:none}.step-navigator .content-heading .eyebrow{display:none}.step-navigator .step-flow{flex:1;min-width:0}.step-navigator .history-row{gap:3px}.step-navigator .secondary-button{padding:4px;font-size:10px}.step-navigator .step-bar-action{width:24px;height:24px;padding:0;font-size:16px;line-height:1}.step-navigator .step-bar-action svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.8}.step-navigator .step-bar-delete{border-color:#fecaca;background:#fff1f2;color:#dc2626}.step-navigator .step-bar-delete:hover{border-color:#fca5a5;background:#fee2e2;color:#b91c1c}.step-navigator .step-bar-action:disabled{cursor:not-allowed;opacity:.4}.step-navigator .content-heading>.history-row{display:none}
.inspector-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:8px;border-bottom:1px solid #e5e7eb}.inspector-tabs button{border:1px solid #d7dce3;border-radius:7px;background:#fff;color:#475569;padding:6px;font:600 11px inherit;cursor:pointer}.inspector-tabs button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.inspector-tabs button:disabled{opacity:.4;cursor:not-allowed}main.ai-mode>:not(.inspector-tabs):not(.ai-panel),main.theme-mode>:not(.inspector-tabs):not(.theme-panel){display:none!important}.ai-panel{min-height:min(580px,calc(100dvh - 130px));display:flex;flex-direction:column;gap:10px;background:#fcfcfd}.ai-panel .content-heading{flex:none}.ai-panel .muted{margin:0}.ai-chat-history{display:grid;align-content:start;gap:8px;flex:1;min-height:260px;overflow:auto;padding:2px}.ai-chat-message{display:grid;gap:3px;max-width:92%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;color:#334155}.ai-chat-message--user{justify-self:end;border-color:#dbeafe;background:#eff6ff;color:#1e3a8a}.ai-chat-message__role{font-size:10px;font-weight:700;color:#64748b}.ai-chat-message--user .ai-chat-message__role{color:#2563eb}.ai-chat-message p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.45}.ai-composer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:7px;padding-top:8px;border-top:1px solid #eef0f3}.ai-panel textarea{min-height:72px;width:100%;resize:vertical;padding:8px;border:1px solid #d7dce3;border-radius:8px;font:12px/1.4 inherit}.ai-composer button{padding:8px 10px}.ai-status{min-height:16px;margin:0;white-space:pre-wrap;color:#64748b;font-size:11px}.ai-proposal{display:grid;gap:6px;padding:8px;border:1px solid #bfdbfe;border-radius:8px;background:#f8fbff}.ai-proposal ul{margin:0;padding-left:18px;color:#475569;font-size:11px}
.ai-composer{grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:7px;border:1px solid #d9e1ec;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgb(15 23 42 / .04);transition:border-color .16s ease,box-shadow .16s ease}.ai-composer:focus-within{border-color:#93c5fd;box-shadow:0 0 0 3px rgb(59 130 246 / .12)}.ai-composer textarea{min-height:54px;padding:5px 3px;border:0;border-radius:0;background:transparent;outline:0;box-shadow:none;line-height:1.45}.ai-composer textarea:focus{outline:0}.ai-composer textarea::placeholder{color:#94a3b8}.ai-composer button{min-width:58px;min-height:34px;margin-bottom:2px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;box-shadow:0 1px 2px rgb(37 99 235 / .25);transition:background .16s ease,transform .16s ease,box-shadow .16s ease}.ai-composer button:hover:not(:disabled){background:#1d4ed8;box-shadow:0 4px 10px rgb(37 99 235 / .24);transform:translateY(-1px)}.ai-composer button:active:not(:disabled){transform:translateY(0);box-shadow:none}.ai-composer button:disabled{opacity:.5;cursor:not-allowed}
[data-composition-inspector]>.history-row{display:none}
@media(max-width:800px){.editor-toolbar{width:min(350px,calc(100vw - 8px))}aside{width:min(300px,calc(100vw - 8px))}}
@media(max-width:480px){.editor-toolbar{left:4px;top:4px;transform:none}.header-copy strong{font-size:10px}.header-copy small{font-size:9px}.header-actions [data-return-dashboard],.header-actions [data-move-side]{display:none}aside{width:calc(100vw - 8px)}.step-navigator{position:fixed;left:50%;bottom:4px;transform:translateX(-50%);width:calc(100vw - 8px);box-shadow:0 4px 14px rgba(15,23,42,.12)}.step-navigator>.history-row:not([data-step-bar-actions]){display:none}.step-navigator .content-heading{display:none}}
`;

const GUIDE_STYLE = `.guide-behavior{display:grid;gap:8px;border-top:1px solid #eef0f3;padding-top:10px;margin-top:8px}.guide-behavior [data-guide-config],.guide-behavior [data-guide-missing]{display:grid;gap:7px}.guide-behavior .muted{margin:0;overflow-wrap:anywhere}.guide-preview-controls{display:flex;align-items:center;flex-wrap:wrap;gap:4px;padding:5px 7px;border-top:1px solid #eef0f3}.guide-preview-controls button{border:1px solid #d7dce3;border-radius:5px;background:#fff;color:#334155;padding:4px 6px;font:11px ui-sans-serif,system-ui;cursor:pointer}.guide-preview-controls small{flex-basis:100%;color:#64748b;font-size:10px}.guide-preview-controls button:disabled{opacity:.4}.guide-preview-controls span{font-size:10px;margin-left:auto}`;

function checklistEditorAdapter(value:EditorChecklistDefinition):EditorDefinition {
 return {content:{heading:value.title,body:value.description??""},builder:value.builder,design:value.design??{width:"sm",theme:{background:"#fff",foreground:"#111827",primary:"#2563eb",borderRadius:"md"}},behavior:{dismissible:false},targeting:{...value.targeting,trigger:{type:"page_load"},frequency:{mode:"once"}},visualTheme:value.visualTheme,template:value.template};
}
