import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorModeController } from "../src/experiences/editor/EditorModeController";
import { ElementPicker } from "../src/experiences/editor/ElementPicker";
import { ExperienceRenderer } from "../src/experiences/runtime/ExperienceRenderer";
import { ExperienceLoader } from "../src/experiences/runtime/ExperienceLoader";
import { SessionManager } from "../src/core/SessionManager";
import type { DeliveredExperience, ExperienceDesign } from "../src/experiences/types";

const design: ExperienceDesign = { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } };
const base = (widgetType: DeliveredExperience["widgetType"]): DeliveredExperience => ({ id: "exp_1", versionId: "v1", kind: "widget", widgetType, priority: 1, definition: { content: { heading: "Hello", body: "World" }, design, behavior: { dismissible: true, toastPosition: "bottom-right", cursorOffset: { x: 12, y: 12 } } } });

describe("experience editor and runtime", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); sessionStorage.clear(); vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 1; }); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); history.replaceState({}, "", "/"); });

  it("activates editor mode only after a valid exchange and removes the raw token from the URL", async () => {
    history.replaceState({}, "", "/?loopz_editor_token=secret");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "ees_1", accessToken: "access", expiresAt: new Date(Date.now() + 60000).toISOString() }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ experience: { id: "exp_1", name: "Draft", kind: "widget", widgetType: "toast" }, version: { id: "v1", versionNumber: 1, definition: { ...base("toast").definition, targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 } } } }) });
    vi.stubGlobal("fetch", fetchMock); const controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("secret")).toBe(true); expect(location.search).not.toContain("loopz_editor_token"); expect(document.querySelector("[data-loopz-editor]")).not.toBeNull(); controller.destroy();
  });

  it("leaves the token and host DOM untouched when validation fails", async () => {
    history.replaceState({}, "", "/?loopz_editor_token=bad"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await new EditorModeController("https://api.example.com").start("bad")).toBe(false); expect(location.search).toContain("loopz_editor_token=bad"); expect(document.querySelector("[data-loopz-editor]")).toBeNull();
  });

  it("prevents the host click while selecting and reuses SelectorGenerator metadata", async () => {
    const button = document.createElement("button"); button.dataset.testid = "checkout"; document.body.appendChild(button); Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => button });
    let hostClicks = 0; button.addEventListener("click", () => hostClicks++); const picker = new ElementPicker(); const selected = picker.pick();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 4, clientY: 4 })); const target = await selected;
    expect(hostClicks).toBe(0); expect(target).toMatchObject({ primarySelector: 'button[data-testid="checkout"]', reliability: "reliable" });
  });

  it("uses fallback selectors and does not mount an anchored card without a target", () => {
    const renderer = new ExperienceRenderer(); const callbacks = { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() };
    const missing = base("anchored_card"); expect(renderer.render(missing, callbacks)).toBe(false); expect(document.querySelector("[data-loopz-experience]")).toBeNull();
    const target = document.createElement("button"); target.className = "fallback"; document.body.appendChild(target); const withFallback = base("anchored_card"); if (!("steps" in withFallback.definition)) withFallback.definition.target = { primarySelector: ".missing", fallbackSelectors: [".fallback"], reliability: "moderate" };
    expect(renderer.render(withFallback, callbacks)).toBe(true); expect(document.querySelector("[data-loopz-experience]")).not.toBeNull(); window.dispatchEvent(new Event("resize")); renderer.destroy();
  });

  it("mounts and safely destroys toast and cursor-follow lifecycles", () => {
    for (const type of ["toast", "cursor_follow"] as const) { const renderer = new ExperienceRenderer(); expect(renderer.render(base(type), { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() })).toBe(true); if (type === "cursor_follow") window.dispatchEvent(new MouseEvent("pointermove", { clientX: 40, clientY: 50 })); renderer.destroy(); expect(document.querySelector("[data-loopz-experience]")).toBeNull(); }
  });

  it("does not record an impression when an eligible anchored target is missing", async () => {
    const experience = base("anchored_card"); const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ experiences: [experience] }) }); vi.stubGlobal("fetch", fetchMock);
    const loader = new ExperienceLoader("https://api.example.com", "site_1", new SessionManager()); await loader.evaluate();
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(String(fetchMock.mock.calls[0][0])).toContain("/experiences?"); loader.destroy();
  });
});
