import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "../src/core/Analytics";
import { EDITOR_CONTINUATION_KEY } from "../src/experiences/editorContinuation";
import { EditorModeController } from "../src/experiences/editor/EditorModeController";
import { ElementPicker } from "../src/experiences/editor/ElementPicker";
import { TargetSelectorGenerator } from "../src/experiences/editor/TargetSelectorGenerator";
import { ExperienceRenderer } from "../src/experiences/runtime/ExperienceRenderer";
import type { EditorDraft, ExperienceDesign, ExperienceTargeting } from "../src/experiences/types";

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
    expect(document.querySelector("[data-movecues-experience]")).toBeNull();
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

    await vi.waitFor(() => expect(document.querySelector("[data-movecues-editor]")).not.toBeNull());
    const internals = analytics as unknown as { editor: unknown; engine: unknown; session: unknown };
    expect(internals.editor).toBeTruthy();
    expect(internals.engine).toBeUndefined();
    expect(internals.session).toBeUndefined();
    expect(editorRoot().querySelector<HTMLButtonElement>('[data-step="1"]')?.dataset.stepStatus).toBe("current");
    expect(editorRoot().querySelector('[data-mode="navigate"]')?.classList.contains("active")).toBe(true);
    expect(document.querySelector("[data-movecues-experience]")).toBeNull();
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
    expect(activePreviewText()).toContain("Modal step"); expect(document.querySelector("[data-movecues-experience]")?.shadowRoot?.querySelector(".modal")).not.toBeNull(); expect(editorRoot().querySelector<HTMLElement>('[data-for="target"]')?.hidden).toBe(true); expect(editorRoot().querySelector<HTMLElement>("[data-missing-selector]")?.hidden).toBe(true); expect(document.querySelector("[data-movecues-picker-overlay]")).toBeNull();
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
    expect(document.querySelector("[data-movecues-experience]")).toBeNull();
    renderer.destroy();
  });
});

function editorFetch(draft: EditorDraft) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/exchange")) return { ok: true, json: async () => ({ sessionId: "ees_1", accessToken: "access", expiresAt: new Date(Date.now() + 60_000).toISOString() }) };
    if (init?.method === "PATCH") return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => draft };
  });
}

function widgetDraft(widgetType: "anchored_card" | "toast", selector?: string): EditorDraft {
  return { experience: { id: "exp_1", name: "Placement draft", kind: "widget", widgetType }, version: { id: "v1", versionNumber: 1, definition: { content: { heading: "Widget", body: "Preview" }, design, behavior: { dismissible: true, placement: "bottom" }, target: selector ? { primarySelector: selector, fallbackSelectors: [], label: "Checkout", reliability: "reliable" } : undefined, targeting } } };
}

function guideDraft(): EditorDraft {
  return { experience: { id: "guide_1", name: "Onboarding guide", kind: "guide", widgetType: null }, version: { id: "v1", versionNumber: 1, definition: { design, targeting, steps: [
    { id: "one", content: { heading: "First step", body: "One" }, target: { primarySelector: "#first", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true, placement: "bottom" } },
    { id: "two", content: { heading: "Second step", body: "Two" }, advance: { type: "route", pageRules: [{ id: "settings", kind: "include", operator: "equals", value: "/settings" }] }, target: { primarySelector: "#second", fallbackSelectors: [], reliability: "moderate" }, behavior: { dismissible: false, placement: "right" } },
  ] } } };
}

function widgetExperience(widgetType: "anchored_card", selector: string) {
  return { id: "runtime_1", versionId: "v1", kind: "widget" as const, widgetType, priority: 1, definition: { content: { heading: "Anchored", body: "Preview" }, design, behavior: { dismissible: true }, target: { primarySelector: selector, fallbackSelectors: [], reliability: "moderate" as const } } };
}

function editorRoot(): ShadowRoot { return document.querySelector<HTMLElement>("[data-movecues-editor]")!.shadowRoot!; }
function activePreviewText(): string { return document.querySelector<HTMLElement>("[data-movecues-experience]")?.shadowRoot?.textContent ?? ""; }
