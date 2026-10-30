import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "../src/core/Analytics";
import { EDITOR_CONTINUATION_KEY } from "../src/experiences/editorContinuation";
import { EditorModeController } from "../src/experiences/editor/EditorModeController";
import { ElementPicker } from "../src/experiences/editor/ElementPicker";
import { TargetSelectorGenerator } from "../src/experiences/editor/TargetSelectorGenerator";
import { ExperienceRenderer } from "../src/experiences/runtime/ExperienceRenderer";
import { applyOnsiteDocument, createOnsiteDocument, createOnsiteSurveyDocument } from "../src/experiences/onsite/OnsiteDocument";
import type { EditorDraft, ExperienceDesign, ExperienceTargeting, RuntimeWidgetDefinition } from "../src/experiences/types";

const design: ExperienceDesign = { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } };
const targeting: ExperienceTargeting = { pageRules: [{ id: "dashboard", kind: "include", operator: "equals", value: "/dashboard" }], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once_per_session" }, priority: 40, interruptPolicy: "queue" };

describe("live placement editor", () => {
  let controller: EditorModeController | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    history.replaceState({}, "", "/dashboard");
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  });

  afterEach(() => {
    controller?.destroy(); controller = null;
    delete (document as Document & { elementFromPoint?: unknown }).elementFromPoint;
    document.body.innerHTML = "";
    sessionStorage.clear();
    history.replaceState({}, "", "/");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps theme controls in their own inspector tab and removes viewport controls", async () => {
    vi.stubGlobal("fetch", editorFetch(widgetDraft("toast")));
    controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("one-time-token")).toBe(true);

    const root = editorRoot();
    expect(root.querySelector("[data-device]")).toBeNull();
    expect(root.querySelector(".devicebar")).toBeNull();
    expect(root.querySelector<HTMLElement>("[data-theme-section]")?.hidden).toBe(true);
    const themeTab = root.querySelector<HTMLButtonElement>('[data-inspector-tab="theme"]')!;
    themeTab.click();
    expect(themeTab.classList.contains("active")).toBe(true);
    expect(root.querySelector("main")?.classList.contains("theme-mode")).toBe(true);
    expect(root.querySelector<HTMLElement>("[data-theme-section]")?.hidden).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-inspector-tab="properties"]')!.click();
    expect(root.querySelector<HTMLElement>("[data-theme-section]")?.hidden).toBe(true);
  });

  it("intercepts customer clicks in Select mode and passes them through in Navigate mode", async () => {
    const target = document.createElement("button"); target.id = "checkout"; document.body.appendChild(target);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
    let customerClicks = 0; target.addEventListener("click", () => customerClicks++);
    const fetchMock = editorFetch(widgetDraft("anchored_card", "#checkout")); vi.stubGlobal("fetch", fetchMock);
    controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("one-time-token")).toBe(true);

    target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 2, clientY: 2 }));
    expect(customerClicks).toBe(0);
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const saveCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(saveCall[1]?.body)).definition.target.targetContext).toEqual({ pagePath: "/dashboard" });

    editorRoot().querySelector<HTMLButtonElement>('[data-mode="navigate"]')!.click();
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 2, clientY: 2 }));
    expect(customerClicks).toBe(1);
    expect(document.querySelector("[data-movcues-experience]")).toBeNull();
  });

  it("offers and previews a target-cutout backdrop for anchored Tooltip widgets", async () => {
    const target = document.createElement("button"); target.id = "checkout"; document.body.appendChild(target);
    target.getBoundingClientRect = () => ({ x: 100, y: 120, left: 100, top: 120, width: 80, height: 32, right: 180, bottom: 152, toJSON: () => ({}) }) as DOMRect;
    vi.stubGlobal("fetch", editorFetch(widgetDraft("anchored_card", "#checkout")));
    controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("one-time-token")).toBe(true);

    const group = editorRoot().querySelector<HTMLElement>('[data-for="backdrop"]')!;
    const toggle = group.querySelector<HTMLInputElement>("[data-backdrop]")!;
    expect(group.hidden).toBe(false);
    expect(toggle.checked).toBe(false);
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    editorRoot().querySelector<HTMLButtonElement>('[data-mode="preview"]')!.click();

    const preview = document.querySelector<HTMLElement>("[data-movcues-experience]")?.shadowRoot;
    expect(preview?.querySelectorAll("[data-movcues-target-backdrop]")).toHaveLength(4);
    expect(preview?.querySelector("[data-movcues-target-highlight]")).not.toBeNull();
    expect(document.documentElement.style.overflow).toBe("hidden");

    editorRoot().querySelector<HTMLButtonElement>('[data-mode="target"]')!.click();
    expect(document.querySelector<HTMLElement>("[data-movcues-experience]")?.shadowRoot?.querySelector("[data-movcues-target-backdrop]")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
    expect(toggle.checked).toBe(true);
    editorRoot().querySelector<HTMLButtonElement>('[data-mode="preview"]')!.click();
    expect(document.querySelector<HTMLElement>("[data-movcues-experience]")?.shadowRoot?.querySelectorAll("[data-movcues-target-backdrop]")).toHaveLength(4);
  });

  it("offers the same backdrop behavior for anchored Guide steps", async () => {
    const target = document.createElement("button"); target.id = "first"; document.body.appendChild(target);
    const draft = guideDraft(); if (!("steps" in draft.version.definition)) throw new Error("Expected Guide");
    draft.version.definition.steps[0].behavior.backdrop = true;
    vi.stubGlobal("fetch", editorFetch(draft));
    controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("one-time-token")).toBe(true);

    const group = editorRoot().querySelector<HTMLElement>('[data-for="backdrop"]')!;
    expect(group.hidden).toBe(false);
    expect(group.querySelector<HTMLInputElement>("[data-backdrop]")?.checked).toBe(true);
    editorRoot().querySelector<HTMLButtonElement>('[data-mode="preview"]')!.click();
    expect(document.querySelector<HTMLElement>("[data-movcues-experience]")?.shadowRoot?.querySelectorAll("[data-movcues-target-backdrop]")).toHaveLength(4);
  });

  it("temporarily passes customer interaction through while Shift is held and restores selection on release", async () => {
    const target = document.createElement("button"); target.dataset.testid = "menu"; document.body.appendChild(target);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
    let customerClicks = 0; target.addEventListener("click", () => customerClicks++);
    const picker = new ElementPicker(); const selected = picker.pick();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 3, clientY: 3 }));
    expect(customerClicks).toBe(1);
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 3, clientY: 3 }));

    await expect(selected).resolves.toMatchObject({ primarySelector: 'button[data-testid="menu"]', reliability: "reliable" });
    expect(customerClicks).toBe(1);
  });

  it("uses the existing page picker for a relative layer reference", async () => {
    const reference = document.createElement("div"); reference.id = "customer-modal"; reference.setAttribute("aria-label", "Checkout modal"); document.body.appendChild(reference);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => reference });
    const fetchMock = editorFetch(widgetDraft("toast")); vi.stubGlobal("fetch", fetchMock);
    controller = new EditorModeController("https://api.example.com"); expect(await controller.start("one-time-token")).toBe(true);

    const mode = editorRoot().querySelector<HTMLSelectElement>("[data-layer-mode]")!; mode.value = "relative"; mode.dispatchEvent(new Event("change", { bubbles: true }));
    reference.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 4, clientY: 4 }));

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH" && JSON.parse(String(init.body)).definition.behavior.layer?.mode === "relative")).toBe(true));
    const save = [...fetchMock.mock.calls].reverse().find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(save[1]?.body)).definition.behavior.layer).toMatchObject({ mode: "relative", relation: "above", target: { label: "Checkout modal", targetContext: { pagePath: "/dashboard" } } });
  });

  it("stores Guide layering policies on the selected step", async () => {
    const fetchMock = editorFetch(guideDraft()); vi.stubGlobal("fetch", fetchMock);
    controller = new EditorModeController("https://api.example.com"); expect(await controller.start("one-time-token")).toBe(true);
    const mode = editorRoot().querySelector<HTMLSelectElement>("[data-layer-mode]")!;
    mode.value = "auto"; mode.dispatchEvent(new Event("change", { bubbles: true }));
    editorRoot().querySelector<HTMLButtonElement>('[data-step="1"]')!.click();
    expect(mode.value).toBe("always_on_top");
    mode.value = "custom"; mode.dispatchEvent(new Event("change", { bubbles: true }));
    editorRoot().querySelector<HTMLButtonElement>('[data-step="0"]')!.click();
    expect(mode.value).toBe("auto");
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH" && JSON.parse(String(init.body)).definition.steps[1].behavior.layer?.mode === "custom")).toBe(true));
    const save = [...fetchMock.mock.calls].reverse().find(([, init]) => init?.method === "PATCH" && JSON.parse(String(init.body)).definition.steps[1].behavior.layer?.mode === "custom")!;
    const saved = JSON.parse(String(save[1]?.body)).definition;
    expect(saved.behavior?.layer).toBeUndefined();
    expect(saved.steps[0].behavior.layer).toEqual({ mode: "auto" });
    expect(saved.steps[1].behavior.layer).toEqual({ mode: "custom", zIndex: 1000 });
  });

  it("restores the selected Guide step ID and mode on full-page editor continuation without analytics collectors", async () => {
    const fetchMock = editorFetch(guideDraft()); vi.stubGlobal("fetch", fetchMock);
    controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("one-time-token")).toBe(true);
    editorRoot().querySelector<HTMLButtonElement>('[data-step="1"]')!.click();
    editorRoot().querySelector<HTMLButtonElement>('[data-mode="navigate"]')!.click();
    window.dispatchEvent(new Event("pagehide"));
    const saved = sessionStorage.getItem(EDITOR_CONTINUATION_KEY)!;
    expect(JSON.parse(saved).editorState).toMatchObject({ experienceId: "guide_1", selectedStepId: "two", mode: "navigate" });

    controller.destroy(); controller = null;
    sessionStorage.setItem(EDITOR_CONTINUATION_KEY, saved);
    const analytics = new Analytics({ editor: { createController: apiBase => new EditorModeController(apiBase) } });
    analytics.init({ siteId: "site_1", endpoint: "https://api.example.com" });

    await vi.waitFor(() => expect(document.querySelector("[data-movcues-editor]")).not.toBeNull());
    const internals = analytics as unknown as { editor: unknown; engine: unknown; session: unknown };
    expect(internals.editor).toBeTruthy();
    expect(internals.engine).toBeUndefined();
    expect(internals.session).toBeUndefined();
    expect(editorRoot().querySelector<HTMLButtonElement>('[data-step="1"]')?.dataset.stepStatus).toBe("current");
    expect(editorRoot().querySelector('[data-mode="navigate"]')?.classList.contains("active")).toBe(true);
    expect(document.querySelector("[data-movcues-experience]")).toBeNull();
    expect(String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[0])).toContain("/experience-editor/ees_1/draft");
    analytics.destroy();
  });

  it("switches Guide previews and reports live target found and missing states", async () => {
    const first = document.createElement("button"); first.id = "first"; document.body.appendChild(first);
    vi.stubGlobal("fetch", editorFetch(guideDraft()));
    controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("one-time-token")).toBe(true);
    expect(activePreviewText()).toContain("First step");

    editorRoot().querySelector<HTMLButtonElement>('[data-step="1"]')!.click();
    expect(editorRoot().querySelector("[data-live-target]")?.textContent).toContain("Expected on current page but not found");
    expect(editorRoot().querySelector<HTMLButtonElement>('[data-step="0"]')?.dataset.stepStatus).toBe("found");

    const second = document.createElement("button"); second.id = "second"; document.body.appendChild(second);
    await vi.waitFor(() => expect(activePreviewText()).toContain("Second step"));
    expect(editorRoot().querySelector("[data-live-target]")?.textContent).toContain("Found on current page");
  });

  it("renders a Modal Guide step without target picking or missing-target diagnostics", async () => {
    const first = document.createElement("button"); first.id = "first"; document.body.appendChild(first);
    const draft = guideDraft(); if (!("steps" in draft.version.definition)) throw new Error("Expected Guide"); draft.version.definition.steps[1] = { id: "two", pattern: "modal", content: { heading: "Modal step", body: "No target" }, advance: { type: "button" }, behavior: { dismissible: true } };
    vi.stubGlobal("fetch", editorFetch(draft)); controller = new EditorModeController("https://api.example.com"); expect(await controller.start("one-time-token")).toBe(true);
    editorRoot().querySelector<HTMLButtonElement>('[data-step="1"]')!.click();
    expect(activePreviewText()).toContain("Modal step"); expect(document.querySelector("[data-movcues-experience]")?.shadowRoot?.querySelector(".modal")).not.toBeNull(); expect(editorRoot().querySelector<HTMLElement>('[data-for="target"]')?.hidden).toBe(true); expect(editorRoot().querySelector<HTMLElement>("[data-missing-selector]")?.hidden).toBe(true); expect(document.querySelector("[data-movcues-picker-overlay]")).toBeNull();
  });

  it("reports a Guide target configured on another page without marking it missing", async () => {
    history.replaceState({}, "", "/settings");
    const draft = guideDraft();
    if ("steps" in draft.version.definition) draft.version.definition.steps[0].target!.targetContext = { pagePath: "/dashboard" };
    vi.stubGlobal("fetch", editorFetch(draft));
    controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("one-time-token")).toBe(true);

    expect(editorRoot().querySelector("[data-live-target]")?.textContent).toContain("Configured on another page");
    expect(editorRoot().querySelector("[data-live-target]")?.textContent).not.toContain("not found");
    expect(editorRoot().querySelector<HTMLElement>("[data-missing-selector]")?.hidden).toBe(true);
  });

  it("edits an on-site draft directly without remounting the rendered experience", async () => {
    const fetchMock = editorFetch(onsiteDraft());
    vi.stubGlobal("fetch", fetchMock);
    controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("one-time-token")).toBe(true);

    expect(
      Array.from(editorRoot().querySelectorAll<HTMLButtonElement>("[data-mode]")).map(
        button => button.textContent,
      ),
    ).toEqual(["Design", "Target", "Navigate", "Preview"]);
    expect(editorRoot().querySelector('[data-mode="design"]')?.classList.contains("active")).toBe(true);
    const previewHost = document.querySelector<HTMLElement>('[data-movcues-experience="exp_onsite"]')!;
    const heading = previewHost.shadowRoot!.querySelector<HTMLElement>('[data-movcues-content="heading"]')!;
    heading.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true }));
    heading.textContent = "Edited in context";
    heading.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));

    expect(document.querySelector('[data-movcues-experience="exp_onsite"]')).toBe(previewHost);
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const save = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(save[1]?.body))).toMatchObject({ revision: 1, definition: { content: { heading: "Edited in context" }, builder: { html: expect.stringContaining("Edited in context") } } });
  });

  it("updates an on-site anchored pointer when the root background changes", async () => {
    const draft = onsiteDraft(); draft.experience.widgetType = "anchored_card";
    const definition = draft.version.definition as RuntimeWidgetDefinition;
    definition.target = { primarySelector: "#anchor", fallbackSelectors: [], reliability: "reliable" };
    const target = document.createElement("button"); target.id = "anchor"; document.body.appendChild(target);
    const fetchMock = editorFetch(draft); vi.stubGlobal("fetch", fetchMock); controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("token")).toBe(true);
    const previewHost = document.querySelector<HTMLElement>('[data-movcues-experience="exp_onsite"]')!;
    const pointer = previewHost.shadowRoot!.querySelector<HTMLElement>(".movcues-anchor-pointer")!;
    const previewStyle = previewHost.shadowRoot!.querySelector<HTMLStyleElement>("style[data-movcues-builder-style]")!;
    const background = editorRoot().querySelector<HTMLInputElement>("[data-cell-background]")!;
    background.value = "#123456"; background.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.querySelector('[data-movcues-experience="exp_onsite"]')).toBe(previewHost);
    expect(previewStyle.textContent).not.toContain(".movcues-anchor-pointer");
    expect(getComputedStyle(pointer).color).toBe("rgb(18, 52, 86)");
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH" && String(init.body).includes("#123456"))).toBe(true));
    const saved = JSON.parse(String(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").at(-1)![1]?.body));
    expect(saved.definition.builder.css).not.toContain(".movcues-anchor-pointer");
    editorRoot().querySelector<HTMLButtonElement>("[data-v2-undo]")!.click();
    expect(pointer.style.color).toBe("rgb(255, 255, 255)");
    expect(pointer.style.getPropertyPriority("color")).toBe("");
    expect(previewStyle.textContent).not.toContain(".movcues-anchor-pointer");
  });

  it("preserves and keeps editing an on-site anchored card across mode changes", async () => {
    const draft = onsiteDraft(); draft.experience.widgetType = "anchored_card";
    const definition = draft.version.definition as RuntimeWidgetDefinition;
    definition.target = { primarySelector: "#anchor", fallbackSelectors: [], reliability: "reliable" };
    const target = document.createElement("button"); target.id = "anchor"; document.body.appendChild(target);
    const fetchMock = editorFetch(draft); vi.stubGlobal("fetch", fetchMock); controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("token")).toBe(true);

    let background = editorRoot().querySelector<HTMLInputElement>("[data-cell-background]")!;
    background.value = "#123456"; background.dispatchEvent(new Event("change", { bubbles: true }));
    editorRoot().querySelector<HTMLButtonElement>('[data-mode="target"]')!.click();
    editorRoot().querySelector<HTMLButtonElement>('[data-mode="design"]')!.click();

    background = editorRoot().querySelector<HTMLInputElement>("[data-cell-background]")!;
    expect(background.value).toBe("#123456");
    background.value = "#654321"; background.dispatchEvent(new Event("change", { bubbles: true }));
    const host = document.querySelector<HTMLElement>('[data-movcues-experience="exp_onsite"]')!;
    const builderStyle = host.shadowRoot!.querySelector<HTMLStyleElement>("style[data-movcues-builder-style]");
    expect(builderStyle).not.toBeNull();
    expect(host.shadowRoot!.querySelector(".builder-content .movcues-widget")).not.toBeNull();
    expect(host.shadowRoot!.querySelector<HTMLElement>(".movcues-anchor-pointer")!.style.color).toBe("rgb(101, 67, 33)");
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH" && String(init.body).includes("#654321"))).toBe(true));
    const saved = JSON.parse(String(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").at(-1)![1]?.body));
    expect(saved.definition.builder.projectData.movcues.onsiteDocument.root.style.background).toBe("#654321");
  });

  it("preserves local text and offers reload recovery after a revision conflict", async () => {
    const draft = onsiteDraft();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/exchange")) return { ok: true, json: async () => ({ sessionId: "ees_1", accessToken: "access", expiresAt: new Date(Date.now() + 60_000).toISOString() }) };
      if (init?.method === "PATCH") return { ok: false, status: 409, json: async () => ({ error: "draft_conflict", currentRevision: 2 }) };
      return { ok: true, json: async () => draft };
    });
    vi.stubGlobal("fetch", fetchMock);
    controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("one-time-token")).toBe(true);
    const previewHost = document.querySelector<HTMLElement>('[data-movcues-experience="exp_onsite"]')!;
    const heading = previewHost.shadowRoot!.querySelector<HTMLElement>('[data-movcues-content="heading"]')!;
    heading.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true }));
    heading.textContent = "Unsaved local copy";
    heading.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));

    await vi.waitFor(() => expect(editorRoot().querySelector("[data-save-state]")?.textContent).toContain("Conflict"));
    expect(heading.textContent).toBe("Unsaved local copy");
    expect(editorRoot().querySelector<HTMLButtonElement>("[data-reload-draft]")?.hidden).toBe(false);
    expect(editorRoot().querySelector<HTMLButtonElement>("[data-retry-save]")?.hidden).toBe(true);
  });

  it("revokes authoring but retains a token-free export when the session expires", async () => {
    const draft = onsiteDraft();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/exchange")) return { ok: true, json: async () => ({ sessionId: "ees_1", accessToken: "access", expiresAt: new Date(Date.now() + 60_000).toISOString() }) };
      if (init?.method === "PATCH") return { ok: false, status: 401, json: async () => ({ error: "editor_session_revoked" }) };
      return { ok: true, json: async () => draft };
    }));
    controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("one-time-token")).toBe(true);
    const heading = document.querySelector<HTMLElement>('[data-movcues-experience="exp_onsite"]')!.shadowRoot!.querySelector<HTMLElement>('[data-movcues-content="heading"]')!;
    heading.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true }));
    heading.textContent = "Save after revoke";
    heading.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));

    await vi.waitFor(() => expect(editorRoot().querySelector("[data-save-state]")?.textContent).toContain("Session expired"));
    expect(document.querySelector("[data-movcues-experience]")).toBeNull();
    editorRoot().querySelector<HTMLButtonElement>("[data-export-draft]")!.click();
    const exported = editorRoot().querySelector<HTMLTextAreaElement>("[data-recovery-export]")!.value;
    expect(exported).toContain("Save after revoke"); expect(exported).not.toMatch(/accessToken|one-time-token/);
  });

  it("rejects an ambiguous semantic selector and generates unique parent context", () => {
    document.body.innerHTML = '<aside data-testid="sidebar"><a href="#home">Home</a></aside><nav><a href="#home">Home</a></nav>';
    const selected = document.querySelector("aside a")!;
    const target = new TargetSelectorGenerator().generate(selected);

    expect(target.primarySelector).not.toBe('a[href="#home"]');
    expect(target.primarySelector).toContain('aside[data-testid="sidebar"]');
    expect(document.querySelectorAll(target.primarySelector)).toHaveLength(1);
    expect(document.querySelector(target.primarySelector)).toBe(selected);
    expect(target.reliability).toBe("moderate");
  });

  it("does not anchor runtime content to the first match of an ambiguous saved selector", () => {
    document.body.innerHTML = '<button class="duplicate">First</button><button class="duplicate">Second</button>';
    const experience = widgetExperience("anchored_card", ".duplicate");
    const renderer = new ExperienceRenderer();
    expect(renderer.render(experience, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() })).toBe(true);
    expect(document.querySelector("[data-movcues-experience]")).toBeNull();
    renderer.destroy();
  });
  it("waits for a pending save and a subsequent edit before closing, without duplicate writes", async () => {
    const draft = onsiteDraft(); const pending: Array<(value: unknown) => void> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/exchange")) return { ok: true, json: async () => ({ sessionId: "ees_1", accessToken: "access", expiresAt: new Date(Date.now() + 60_000).toISOString() }) };
      if (init?.method === "PATCH") return new Promise(resolve => pending.push(resolve));
      return { ok: true, json: async () => structuredClone(draft) };
    });
    vi.stubGlobal("fetch", fetchMock); controller = new EditorModeController("https://api.example.com"); await controller.start("token");
    const heading = document.querySelector("[data-movcues-experience]")!.shadowRoot!.querySelector<HTMLElement>("h2")!;
    heading.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); heading.textContent = "First change"; heading.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    heading.textContent = "Second change"; heading.dispatchEvent(new InputEvent("input", { bubbles: true }));
    editorRoot().querySelector<HTMLButtonElement>("[data-close]")!.click(); editorRoot().querySelector<HTMLButtonElement>("[data-close]")!.click();
    expect(document.querySelector("[data-movcues-editor]")).not.toBeNull();
    pending[0]({ ok: true, json: async () => ({ version: { ...draft.version, revision: 2 } }) });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    const calls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(calls[1][1]?.body))).toMatchObject({ revision: 2, definition: { content: { heading: "Second change" } } });
    pending[1]({ ok: true, json: async () => ({ version: { ...draft.version, revision: 3 } }) });
    await vi.waitFor(() => expect(document.querySelector("[data-movcues-editor]")).toBeNull()); expect(pending).toHaveLength(2);
  });
  it("preserves edits on failed close, supports retry and freezes Design toast timers", async () => {
    const draft = onsiteDraft(); draft.experience.widgetType = "toast";
    if (!("behavior" in draft.version.definition)) throw new Error("widget expected");
    draft.version.definition.behavior.autoDismissMs = 500;
    let failed = true; const base = editorFetch(draft);
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH" && failed) throw new Error("offline"); return base(input, init);
    }); vi.stubGlobal("fetch", mock); controller = new EditorModeController("https://api.example.com"); await controller.start("token");
    const heading = document.querySelector("[data-movcues-experience]")!.shadowRoot!.querySelector<HTMLElement>("h2")!;
    heading.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); heading.textContent = "Offline edit"; heading.dispatchEvent(new InputEvent("input", { bubbles: true }));
    editorRoot().querySelector<HTMLButtonElement>("[data-close]")!.click();
    await vi.waitFor(() => expect(editorRoot().querySelector("[data-save-state]")?.textContent).toBe("Save failed"));
    expect(document.querySelector("[data-movcues-experience]")).not.toBeNull();
    failed = false; editorRoot().querySelector<HTMLButtonElement>("[data-retry-save]")!.click();
    await vi.waitFor(() => expect(editorRoot().querySelector("[data-save-state]")?.textContent).toBe("Draft saved"));
  });
  it("dismisses Preview once and renders again only after explicit Reset Preview", async () => {
    vi.stubGlobal("fetch", editorFetch(onsiteDraft())); controller = new EditorModeController("https://api.example.com"); await controller.start("token");
    editorRoot().querySelector<HTMLButtonElement>('[data-mode="preview"]')!.click();
    const root = document.querySelector("[data-movcues-experience]")!.shadowRoot!;
    root.querySelector("[data-movcues-runtime-chrome]")!.shadowRoot!.querySelector<HTMLButtonElement>("[data-dismiss]")!.click();
    expect(document.querySelector("[data-movcues-experience]")).toBeNull();
    editorRoot().querySelector<HTMLButtonElement>("[data-reset-preview]")!.click(); expect(document.querySelector("[data-movcues-experience]")).not.toBeNull();
  });

  it("flushes each Guide step and mode while a previous PATCH is delayed", async () => {
    const draft = guideDraft(); draft.experience.builderMode = "onsite";
    if (!("steps" in draft.version.definition)) throw new Error("Guide expected");
    draft.version.definition.steps.forEach(step => { step.pattern = "modal"; step.builder = { version: 1, projectData: {}, css: ".movcues-widget{}", html: `<section class="movcues-widget"><h2 data-movcues-content="heading">${step.content.heading}</h2><p data-movcues-content="body">${step.content.body}</p></section>` }; });
    let release!: (value: unknown) => void; const base = editorFetch(draft); let writes = 0;
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { if (init?.method === "PATCH" && writes++ === 0) return new Promise(resolve => { release = resolve; }); return base(input, init); });
    vi.stubGlobal("fetch", mock); controller = new EditorModeController("https://api.example.com"); await controller.start("token");
    let heading = document.querySelector("[data-movcues-experience]")!.shadowRoot!.querySelector<HTMLElement>("h2")!;
    heading.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); heading.textContent = "Step one edit"; heading.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(writes).toBe(1));
    editorRoot().querySelector<HTMLButtonElement>('[data-step="1"]')!.click();
    heading = document.querySelector("[data-movcues-experience]")!.shadowRoot!.querySelector<HTMLElement>("h2")!;
    heading.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); heading.textContent = "Step two edit"; heading.dispatchEvent(new InputEvent("input", { bubbles: true }));
    editorRoot().querySelector<HTMLButtonElement>('[data-mode="navigate"]')!.click();
    release({ ok: true, json: async () => ({ version: { ...draft.version, revision: 2 } }) });
    await vi.waitFor(() => expect(writes).toBe(2));
    const calls = mock.mock.calls.filter(([,init]) => init?.method === "PATCH"); const saved = JSON.parse(String(calls[1][1]?.body));
    expect(saved).toMatchObject({ revision: 2, definition: { steps: [{ content: { heading: "Step one edit" } }, { content: { heading: "Step two edit" } }] } });
    expect(saved.definition.steps[0].builder.html).toContain("Step one edit"); expect(saved.definition.steps[1].builder.html).toContain("Step two edit");
  });
  it("does not observe the customer document during Design and keeps cursor-follow authoring stationary", async () => {
    const draft = onsiteDraft(); draft.experience.widgetType = "cursor_follow";
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    vi.stubGlobal("fetch", editorFetch(draft)); controller = new EditorModeController("https://api.example.com"); await controller.start("token");
    expect(observe.mock.calls.some(([node]) => node === document.documentElement)).toBe(false);
    const card = document.querySelector("[data-movcues-experience]")!.shadowRoot!.querySelector<HTMLElement>(".toast")!;
    expect(card).not.toBeNull(); const position = card.style.cssText;
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 200 })); expect(card.style.cssText).toBe(position);
  });

  it("activates link formatting through click after keyboard focus, without pointerdown", async () => {
    vi.stubGlobal("fetch", editorFetch(onsiteDraft())); controller = new EditorModeController("https://api.example.com"); await controller.start("token");
    const heading = document.querySelector("[data-movcues-experience]")!.shadowRoot!.querySelector<HTMLElement>("h2")!; heading.click(); heading.focus();
    const url = editorRoot().querySelector<HTMLInputElement>("[data-link-url]")!; url.value = "/docs";
    const button = editorRoot().querySelector<HTMLButtonElement>("[data-apply-link]")!; button.focus(); button.click();
    expect(document.querySelector("[data-movcues-experience]")!.shadowRoot!.querySelector<HTMLAnchorElement>('h2 a')?.getAttribute("href")).toBe("/docs");
  });

  it("builds nested cells, inserts a block and adds a full-width footer through contextual tools", async () => {
    const fetchMock = editorFetch(onsiteDraft()); vi.stubGlobal("fetch", fetchMock); controller = new EditorModeController("https://api.example.com"); await controller.start("token");
    const surface = document.querySelector("[data-movcues-experience]")!.shadowRoot!; surface.querySelector<HTMLElement>("h2")!.click();
    surface.querySelector<HTMLButtonElement>('[data-command="columns"]')!.click(); surface.querySelector<HTMLButtonElement>('[data-command="add"]')!.click(); surface.querySelector<HTMLButtonElement>('[data-insert-block="image"]')!.click();
    editorRoot().querySelector<HTMLButtonElement>("[data-select-step]")!.click(); editorRoot().querySelector<HTMLButtonElement>('[data-edge="bottom"]')!.click();
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true)); const calls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"); const saved = JSON.parse(String(calls.at(-1)![1]?.body));
    const sourceDocument = saved.definition.builder.projectData.movcues.onsiteDocument; expect(sourceDocument.schemaVersion).toBe(2); expect(sourceDocument.root.children.at(-1).block).toBeUndefined(); const nested = JSON.stringify(sourceDocument); expect(nested).toContain('"direction":"row"'); expect(nested).toContain('"type":"image"');
  });

  it("configures an independently identified button action", async () => {
    const fetchMock = editorFetch(onsiteDraft()); vi.stubGlobal("fetch", fetchMock); controller = new EditorModeController("https://api.example.com"); await controller.start("token");
    const surface = document.querySelector("[data-movcues-experience]")!.shadowRoot!; surface.querySelector<HTMLButtonElement>("[data-movcues-action-id]")!.click();
    const action = editorRoot().querySelector<HTMLSelectElement>("[data-button-action]")!; action.value = "open_url"; action.dispatchEvent(new Event("change", { bubbles: true })); const url = editorRoot().querySelector<HTMLInputElement>("[data-button-url]")!; url.value = "https://example.com/docs"; url.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true)); const calls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"); const saved = JSON.parse(String(calls.at(-1)![1]?.body)); const source = JSON.stringify(saved.definition.builder.projectData.movcues.onsiteDocument); expect(source).toContain('"type":"open_url"'); expect(source).toContain("https://example.com/docs"); expect(saved.definition.builder.html).toContain("data-movcues-action-id=\"action_");
  });

  it("adds, duplicates, reorders, renames and deletes Guide steps with fresh structured IDs", async () => {
    const draft = guideDraft(); draft.experience.builderMode = "onsite"; if (!("steps" in draft.version.definition)) throw new Error("Guide expected"); draft.version.definition.steps.forEach(step => { step.pattern = "modal"; step.builder = { version: 1, projectData: { movcues: { authoringSurface: "onsite", schemaVersion: 1 } }, css: ".movcues-widget{}", html: `<section class="movcues-widget"><h2 data-movcues-content="heading">${step.content.heading}</h2><p data-movcues-content="body">${step.content.body}</p></section>` }; });
    vi.spyOn(window, "confirm").mockReturnValue(true); const fetchMock = editorFetch(draft); vi.stubGlobal("fetch", fetchMock); controller = new EditorModeController("https://api.example.com"); await controller.start("token");
    expect(editorRoot().querySelector<HTMLButtonElement>("[data-add-current-step]")).toBeTruthy(); expect(editorRoot().querySelector<HTMLButtonElement>("[data-step-bar-actions] [data-delete-step]")).toBeTruthy(); editorRoot().querySelector<HTMLButtonElement>("[data-add-current-step]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(3); editorRoot().querySelector<HTMLButtonElement>("[data-step-bar-actions] [data-delete-step]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(2);
    editorRoot().querySelector<HTMLButtonElement>('[data-add-step="modal"]')!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(3); editorRoot().querySelector<HTMLButtonElement>("[data-duplicate-step]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(4);
    const name = editorRoot().querySelector<HTMLInputElement>("[data-step-name]")!; name.value = "Activation finish"; name.dispatchEvent(new Event("change", { bubbles: true })); editorRoot().querySelector<HTMLButtonElement>("[data-step-left]")!.click(); editorRoot().querySelector<HTMLButtonElement>('[data-step="0"]')!.click(); editorRoot().querySelector<HTMLButtonElement>("[data-delete-step]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(3);
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH" && JSON.parse(String(init.body)).definition.steps.length === 3)).toBe(true)); const calls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH" && JSON.parse(String(init.body)).definition.steps.length === 3); const saved = JSON.parse(String(calls.at(-1)![1]?.body)); expect(saved.definition.steps).toHaveLength(3); expect(saved.definition.steps.some((step: { label?: string }) => step.label === "Activation finish")).toBe(true); const ids = saved.definition.steps.map((step: { id: string }) => step.id); expect(new Set(ids).size).toBe(ids.length);
  });

  it("previews, discards, applies, undoes and redoes a Guide AI transaction", async () => {
    const draft = guideDraft(); draft.experience.builderMode = "onsite"; if (!("steps" in draft.version.definition)) throw new Error("Guide expected");
    draft.version.definition.steps.forEach(step => { step.pattern = "modal"; delete step.target; step.builder = { version: 1, projectData: {}, css: "", html: "" }; step.content = applyOnsiteDocument(step.builder, createOnsiteDocument(true), "modal").content; step.behavior = { dismissible: true }; step.advance = { type: "button" }; });
    const base = editorFetch(draft); let turns = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/ai/chat")) {
        turns++; const body = JSON.parse(String(init?.body));
        expect(body.context.guide.steps).toHaveLength(2); expect(body.context.currentDocument.schemaVersion).toBe(2); expect(JSON.stringify(body.context)).not.toMatch(/primarySelector|fallbackSelectors/);
        return { ok: true, status: 200, json: async () => ({ conversationId: "conversation_1", revision: body.revision, markdown: "Guide proposal ready.", proposal: { summary: "Add a value step", operations: [{ type: "add_guide_step", afterStepId: "one", pattern: "modal", label: "Value", heading: "See the value", body: "A concise benefit." }] } }) };
      }
      return base(input, init);
    });
    vi.stubGlobal("fetch", fetchMock); controller = new EditorModeController("https://api.example.com"); expect(await controller.start("token")).toBe(true);
    editorRoot().querySelector<HTMLButtonElement>('[data-inspector-tab="ai"]')!.click();
    const prompt = editorRoot().querySelector<HTMLTextAreaElement>("[data-ai-prompt]")!; prompt.value = "Add a value step";
    editorRoot().querySelector<HTMLFormElement>("[data-ai-form]")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(editorRoot().querySelector<HTMLElement>("[data-ai-proposal]")?.hidden).toBe(false));
    expect(editorRoot().querySelector("[data-ai-suggestion]")).toBeNull();
    expect(editorRoot().querySelector("[data-ai-history]")?.textContent).toContain("Add a value step");
    expect(editorRoot().querySelector("[data-ai-history]")?.textContent).toContain("Guide proposal ready.");
    editorRoot().querySelector<HTMLButtonElement>("[data-ai-preview]")!.click(); expect({ count: editorRoot().querySelectorAll("[data-step]").length, status: editorRoot().querySelector("[data-ai-status]")?.textContent }).toEqual({ count: 3, status: "Previewing the complete proposed Guide. Apply or Discard to finish." });
    editorRoot().querySelector<HTMLButtonElement>("[data-ai-discard]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(2);
    prompt.value = "Add it"; editorRoot().querySelector<HTMLFormElement>("[data-ai-form]")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => { expect(turns).toBe(2); expect(editorRoot().querySelector<HTMLElement>("[data-ai-proposal]")?.hidden).toBe(false); }); editorRoot().querySelector<HTMLButtonElement>("[data-ai-apply]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(3);
    editorRoot().querySelector<HTMLButtonElement>("[data-global-undo]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(2);
    editorRoot().querySelector<HTMLButtonElement>("[data-global-redo]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(3);
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH" && JSON.parse(String(init.body)).definition.steps.length === 3)).toBe(true));
  });

  it("previews, discards, applies, undoes and redoes a Survey AI transaction", async () => {
    const draft = surveyDraft(), base = editorFetch(draft); let turns = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/ai/chat")) { turns++; const body = JSON.parse(String(init?.body)); expect(body.context.steps).toHaveLength(2); expect(body.context.currentDocument.schemaVersion).toBe(3); expect(JSON.stringify(body.context)).not.toMatch(/visitor|primarySelector|fallbackSelectors/); return { ok: true, status: 200, json: async () => ({ conversationId: "survey_conversation", revision: body.revision, markdown: "Survey proposal ready.", proposal: { summary: "Add a follow-up", operations: [{ type: "add_survey_step", afterStepId: "survey_two", heading: "Anything else?", body: "One final thought", questions: [{ type: "long_text", label: "What should we improve?" }] }] } }) }; } return base(input, init);
    });
    vi.stubGlobal("fetch", fetchMock); controller = new EditorModeController("https://api.example.com"); expect(await controller.start("token")).toBe(true); editorRoot().querySelector<HTMLButtonElement>('[data-inspector-tab="ai"]')!.click(); const prompt = editorRoot().querySelector<HTMLTextAreaElement>("[data-ai-prompt]")!; prompt.value = "Add a follow-up"; editorRoot().querySelector<HTMLFormElement>("[data-ai-form]")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await vi.waitFor(() => expect(editorRoot().querySelector<HTMLElement>("[data-ai-proposal]")?.hidden).toBe(false));
    editorRoot().querySelector<HTMLButtonElement>("[data-ai-preview]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(3); expect(editorRoot().querySelector("[data-ai-status]")?.textContent).toMatch(/Previewing the complete proposed Survey/); editorRoot().querySelector<HTMLButtonElement>("[data-ai-discard]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(2);
    prompt.value = "Add it"; editorRoot().querySelector<HTMLFormElement>("[data-ai-form]")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await vi.waitFor(() => { expect(turns).toBe(2); expect(editorRoot().querySelector<HTMLElement>("[data-ai-proposal]")?.hidden).toBe(false); }); editorRoot().querySelector<HTMLButtonElement>("[data-ai-apply]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(3); editorRoot().querySelector<HTMLButtonElement>("[data-global-undo]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(2); editorRoot().querySelector<HTMLButtonElement>("[data-global-redo]")!.click(); expect(editorRoot().querySelectorAll("[data-step]")).toHaveLength(3);
  });

});

function editorFetch(draft: EditorDraft) {
  let revision = draft.version.revision;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/exchange")) return { ok: true, json: async () => ({ sessionId: "ees_1", accessToken: "access", expiresAt: new Date(Date.now() + 60_000).toISOString() }) };
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { definition: EditorDraft["version"]["definition"] };
      revision += 1;
      return { ok: true, json: async () => ({ version: { ...draft.version, definition: body.definition, revision } }) };
    }
    return { ok: true, json: async () => draft };
  });
}

function widgetDraft(widgetType: "anchored_card" | "toast", selector?: string): EditorDraft {
  return { experience: { id: "exp_1", name: "Placement draft", kind: "widget", widgetType, builderMode: "grapesjs" }, version: { id: "v1", versionNumber: 1, revision: 1, definition: { content: { heading: "Widget", body: "Preview" }, design, behavior: { dismissible: true, placement: "bottom" }, target: selector ? { primarySelector: selector, fallbackSelectors: [], label: "Checkout", reliability: "reliable" } : undefined, targeting } } };
}

function guideDraft(): EditorDraft {
  return { experience: { id: "guide_1", name: "Onboarding guide", kind: "guide", widgetType: null, builderMode: "grapesjs" }, version: { id: "v1", versionNumber: 1, revision: 1, definition: { design, targeting, steps: [
    { id: "one", content: { heading: "First step", body: "One" }, target: { primarySelector: "#first", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true, placement: "bottom" } },
    { id: "two", content: { heading: "Second step", body: "Two" }, advance: { type: "route", pageRules: [{ id: "settings", kind: "include", operator: "equals", value: "/settings" }] }, target: { primarySelector: "#second", fallbackSelectors: [], reliability: "moderate" }, behavior: { dismissible: false, placement: "right" } },
  ] } } };
}

function surveyDraft(): EditorDraft {
  const makeStep = (id: string, heading: string) => { const questions = [{ id: `question_${id}`, type: "short_text" as const, label: "Your feedback", maxLength: 200 }], builder = { version: 1 as const, projectData: {}, html: "", css: "" }, content = { heading, body: "Help us improve" }; return { id, questions, builder, content: applyOnsiteDocument(builder, createOnsiteSurveyDocument(questions, content), "survey", { questions, submitLabel: "Send" }).content }; };
  return { experience: { id: "survey_1", name: "Research", kind: "widget", widgetType: "survey", builderMode: "onsite" }, version: { id: "v_survey", versionNumber: 1, revision: 1, definition: { content: { heading: "Research", body: "" }, design, behavior: { dismissible: true }, targeting, survey: { steps: [makeStep("survey_one", "First"), makeStep("survey_two", "Second")], showProgress: true, allowBack: true, submitLabel: "Send" } } } };
}

function onsiteDraft(): EditorDraft {
  const content = { heading: "On-site heading", body: "Edit me", primaryAction: { label: "Got it", type: "dismiss" as const } };
  return {
    experience: { id: "exp_onsite", name: "On-site modal", kind: "widget", widgetType: "modal", builderMode: "onsite" },
    version: {
      id: "v_onsite",
      versionNumber: 1,
      revision: 1,
      definition: {
        content,
        design,
        behavior: { dismissible: true, modalLayout: "center", backdrop: true },
        targeting,
        builder: {
          version: 1,
          projectData: { movcues: { authoringSurface: "onsite", schemaVersion: 1 } },
          html: '<section class="movcues-widget"><h2 data-movcues-content="heading">On-site heading</h2><p data-movcues-content="body">Edit me</p><button data-movcues-action-id="primary">Got it</button></section>',
          css: ".movcues-widget{padding:18px}",
        },
      },
    },
  };
}

function widgetExperience(widgetType: "anchored_card", selector: string) {
  return { id: "runtime_1", versionId: "v1", kind: "widget" as const, widgetType, priority: 1, definition: { content: { heading: "Anchored", body: "Preview" }, design, behavior: { dismissible: true }, target: { primarySelector: selector, fallbackSelectors: [], reliability: "moderate" as const } } };
}

function editorRoot(): ShadowRoot { return document.querySelector<HTMLElement>("[data-movcues-editor]")!.shadowRoot!; }
function activePreviewText(): string { return document.querySelector<HTMLElement>("[data-movcues-experience]")?.shadowRoot?.textContent ?? ""; }
