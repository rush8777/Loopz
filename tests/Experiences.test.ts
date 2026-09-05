import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorModeController } from "../src/experiences/editor/EditorModeController";
import { ElementPicker } from "../src/experiences/editor/ElementPicker";
import { ExperienceRenderer } from "../src/experiences/runtime/ExperienceRenderer";
import { ExperienceLoader } from "../src/experiences/runtime/ExperienceLoader";
import { SessionManager } from "../src/core/SessionManager";
import { Analytics } from "../src/core/Analytics";
import type { DeliveredExperience, ExperienceDesign } from "../src/experiences/types";

const design: ExperienceDesign = { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } };
const base = (widgetType: DeliveredExperience["widgetType"]): DeliveredExperience => ({ id: "exp_1", versionId: "v1", kind: "widget", widgetType, priority: 1, definition: { content: { heading: "Hello", body: "World" }, design, behavior: { dismissible: true, toastPosition: "bottom-right", cursorOffset: { x: 12, y: 12 } } } });
function withBuilder(experience: DeliveredExperience, label = "Builder content"): DeliveredExperience { if (!isGuide(experience)) { experience.definition.content.primaryAction = { label: "Legacy action", type: "dismiss" }; experience.definition.builder = { version: 1, projectData: {}, html: `<section class="loopz-widget"><h2>${label}</h2><button data-loopz-action-id="primary"><span>Continue</span></button></section>`, css: `.loopz-widget{color:rgb(1,2,3)}` }; } return experience; }

describe("experience editor and runtime", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); sessionStorage.clear(); vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 1; }); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); history.replaceState({}, "", "/"); });

  it("activates editor mode only after a valid exchange and removes the raw token from the URL", async () => {
    history.replaceState({}, "", "/?loopz_editor_token=secret");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "ees_1", accessToken: "access", expiresAt: new Date(Date.now() + 60000).toISOString() }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ experience: { id: "exp_1", name: "Draft", kind: "widget", widgetType: "toast" }, version: { id: "v1", versionNumber: 1, definition: { ...withBuilder(base("toast"), "Draft builder preview").definition, targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 } } } }) });
    vi.stubGlobal("fetch", fetchMock); const controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("secret")).toBe(true); expect(location.search).not.toContain("loopz_editor_token"); expect(document.querySelector("[data-loopz-editor]")).not.toBeNull(); expect(document.querySelector("[data-loopz-experience]")?.shadowRoot?.textContent).toContain("Draft builder preview"); controller.destroy();
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
    const missing = base("anchored_card"); expect(renderer.render(missing, callbacks)).toBe(true); expect(document.querySelector("[data-loopz-experience]")).toBeNull(); renderer.destroy();
    const target = document.createElement("button"); target.className = "fallback"; document.body.appendChild(target); const withFallback = base("anchored_card"); if (!("steps" in withFallback.definition)) withFallback.definition.target = { primarySelector: ".missing", fallbackSelectors: [".fallback"], reliability: "moderate" };
    expect(renderer.render(withFallback, callbacks)).toBe(true); expect(document.querySelector("[data-loopz-experience]")).not.toBeNull(); window.dispatchEvent(new Event("resize")); renderer.destroy();
  });

  it("mounts and safely destroys toast and cursor-follow lifecycles", () => {
    for (const type of ["toast", "cursor_follow"] as const) { const renderer = new ExperienceRenderer(); expect(renderer.render(base(type), { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() })).toBe(true); if (type === "cursor_follow") window.dispatchEvent(new MouseEvent("pointermove", { clientX: 40, clientY: 50 })); renderer.destroy(); expect(document.querySelector("[data-loopz-experience]")).toBeNull(); }
  });

  it("renders builder markup through every widget shell while preserving runtime behavior", () => {
    const target = document.createElement("button"); target.id = "builder-target"; document.body.appendChild(target);
    for (const type of ["anchored_card", "toast", "cursor_follow", "modal", "slideout", "banner", "hotspot"] as const) {
      const experience = withBuilder(base(type), `Builder ${type}`); if (!isGuide(experience) && (type === "anchored_card" || type === "hotspot")) experience.definition.target = { primarySelector: "#builder-target", fallbackSelectors: [], reliability: "reliable" };
      const renderer = new ExperienceRenderer(); expect(renderer.render(experience, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() })).toBe(true);
      const root = document.querySelector(`[data-loopz-experience-root="${experience.id}"]`)!.shadowRoot!; if (type === "hotspot") root.querySelector<HTMLButtonElement>(".hotspot")!.click();
      expect(root.querySelector(".loopz-widget")?.textContent).toContain(`Builder ${type}`); expect(root.querySelector("style[data-loopz-builder-style]")?.textContent).toContain("rgb(1,2,3)"); if (type === "hotspot") { const beacon = root.querySelector<HTMLButtonElement>(".hotspot")!; beacon.click(); beacon.click(); expect(root.querySelectorAll("style[data-loopz-builder-style]")).toHaveLength(1); } renderer.destroy();
    }
  });

  it("sanitizes builder HTML, delegates Loopz actions, and falls back for unsafe builder data", () => {
    const callbacks = { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() }; const built = withBuilder(base("toast")); if (!isGuide(built)) built.definition.builder!.html = '<section class="loopz-widget"><script>window.bad=1</script><button onclick="window.bad=2" data-loopz-action-id="primary"><span>Act</span></button></section>';
    const renderer = new ExperienceRenderer(); renderer.render(built, callbacks); let root = document.querySelector("[data-loopz-experience]")!.shadowRoot!; expect(root.querySelector("script")).toBeNull(); expect(root.querySelector("[onclick]")).toBeNull(); root.querySelector<HTMLSpanElement>("[data-loopz-action-id=primary] span")!.click(); expect(callbacks.onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "dismiss" })); renderer.destroy();
    const unsafe = withBuilder(base("toast")); if (!isGuide(unsafe)) unsafe.definition.builder!.css = "body{display:none}"; renderer.render(unsafe, callbacks); root = document.querySelector("[data-loopz-experience]")!.shadowRoot!; expect(root.querySelector(".loopz-widget")).toBeNull(); expect(root.textContent).toContain("Hello"); renderer.destroy();
    renderer.render(base("toast"), callbacks); root = document.querySelector("[data-loopz-experience]")!.shadowRoot!; expect(root.querySelector(".legacy-content")?.textContent).toContain("World"); renderer.destroy();
  });

  it("isolates and deduplicates builder CSS per experience ShadowRoot", () => {
    const first = withBuilder(base("toast"), "First"); first.id = "exp_a"; const second = withBuilder(base("toast"), "Second"); second.id = "exp_b"; if (!isGuide(second)) second.definition.builder!.css = ".loopz-widget{color:blue}";
    const firstRenderer = new ExperienceRenderer(), secondRenderer = new ExperienceRenderer(); const callbacks = { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() }; firstRenderer.render(first, callbacks); secondRenderer.render(second, callbacks);
    const firstRoot = document.querySelector('[data-loopz-experience-root="exp_a"]')!.shadowRoot!, secondRoot = document.querySelector('[data-loopz-experience-root="exp_b"]')!.shadowRoot!; expect(firstRoot.querySelectorAll("style[data-loopz-builder-style]")).toHaveLength(1); expect(secondRoot.querySelectorAll("style[data-loopz-builder-style]")).toHaveLength(1); expect(firstRoot.querySelector("style[data-loopz-builder-style]")?.textContent).not.toBe(secondRoot.querySelector("style[data-loopz-builder-style]")?.textContent); expect(document.querySelector("style[data-loopz-builder-style]")).toBeNull(); firstRenderer.destroy(); expect(document.querySelector('[data-loopz-experience-root="exp_b"]')).not.toBeNull(); secondRenderer.destroy();
  });

  it("renders modal, slideout, banner, and hotspot widgets through the shared lifecycle", () => {
    const callbacks = { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() };
    const modal = base("modal"); if (!isGuide(modal)) modal.definition.behavior = { dismissible: true, modalLayout: "fullscreen", backdrop: true, closeOnBackdrop: true };
    const modalRenderer = new ExperienceRenderer(); expect(modalRenderer.render(modal, callbacks)).toBe(true); let root = document.querySelector("[data-loopz-experience]")!.shadowRoot!; expect(root.querySelector(".modal")?.getAttribute("data-layout")).toBe("fullscreen"); expect(root.querySelector(".backdrop")).not.toBeNull(); modalRenderer.destroy();
    const slideout = base("slideout"); if (!isGuide(slideout)) slideout.definition.behavior = { dismissible: true, slideoutPosition: "center-left" };
    const slideoutRenderer = new ExperienceRenderer(); expect(slideoutRenderer.render(slideout, callbacks)).toBe(true); root = document.querySelector("[data-loopz-experience]")!.shadowRoot!; expect(root.querySelector(".slideout")?.getAttribute("data-position")).toBe("center-left"); slideoutRenderer.destroy();
    const banner = base("banner"); if (!isGuide(banner)) banner.definition.behavior = { dismissible: true, bannerPosition: "bottom" };
    const bannerRenderer = new ExperienceRenderer(); expect(bannerRenderer.render(banner, callbacks)).toBe(true); root = document.querySelector("[data-loopz-experience]")!.shadowRoot!; expect(root.querySelector(".banner")?.getAttribute("data-position")).toBe("bottom"); bannerRenderer.destroy();
    const target = document.createElement("button"); target.id = "feature"; document.body.appendChild(target); const hotspot = base("hotspot"); if (!isGuide(hotspot)) { hotspot.definition.target = { primarySelector: "#feature", fallbackSelectors: [], reliability: "reliable" }; hotspot.definition.behavior = { dismissible: true, hotspotStyle: "question", hotspotColor: "#ef4444" }; }
    const hotspotRenderer = new ExperienceRenderer(); expect(hotspotRenderer.render(hotspot, callbacks)).toBe(true); root = document.querySelector("[data-loopz-experience]")!.shadowRoot!; const beacon = root.querySelector<HTMLButtonElement>(".hotspot")!; expect(beacon.dataset.style).toBe("question"); expect(root.querySelector(".card")).toBeNull(); beacon.click(); expect(root.querySelector(".card")?.textContent).toContain("Hello"); hotspotRenderer.destroy(); expect(document.querySelector("[data-loopz-experience]")).toBeNull();
  });

  it("does not record an impression when an eligible anchored target is missing", async () => {
    const experience = base("anchored_card"); const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ experiences: [experience] }) }); vi.stubGlobal("fetch", fetchMock);
    const loader = new ExperienceLoader("https://api.example.com", "site_1", new SessionManager()); await loader.evaluate();
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(String(fetchMock.mock.calls[0][0])).toContain("/experiences?"); loader.destroy();
  });

  it("renders guide steps against their own targets and supports Back/Next", () => {
    const first = document.createElement("button"); first.id = "first"; const second = document.createElement("button"); second.id = "second"; document.body.append(first, second);
    const guide: DeliveredExperience = { id: "guide_1", versionId: "v1", kind: "guide", widgetType: null, priority: 1, definition: { design, targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 }, steps: [
      { id: "one", content: { heading: "First", body: "One", primaryAction: { label: "Next", type: "next_step" } }, target: { primarySelector: "#first", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
      { id: "two", content: { heading: "Second", body: "Two", primaryAction: { label: "Finish", type: "next_step" } }, target: { primarySelector: "#second", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
    ] } };
    const renderer = new ExperienceRenderer(); renderer.render(guide, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() });
    const root = document.querySelector("[data-loopz-experience]")!.shadowRoot!; expect(root.textContent).toContain("First"); root.querySelector<HTMLButtonElement>("[data-primary]")!.click(); expect(document.querySelector("[data-loopz-experience]")!.shadowRoot!.textContent).toContain("Second"); expect(document.querySelector("[data-loopz-experience]")!.shadowRoot!.querySelector("footer")!.textContent).toContain("Back"); renderer.destroy();
  });

  it("waits for a delayed SPA target and cleans up on timeout or destroy", async () => {
    vi.useFakeTimers(); const renderer = new ExperienceRenderer(); const unavailable = vi.fn(); const delayed = base("anchored_card"); if (!isGuide(delayed)) delayed.definition.target = { primarySelector: ".late", fallbackSelectors: [], reliability: "moderate" };
    expect(renderer.render(delayed, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn(), onUnavailable: unavailable })).toBe(true); expect(document.querySelector("[data-loopz-experience]")).toBeNull(); const target = document.createElement("button"); target.className = "late"; document.body.appendChild(target); await Promise.resolve(); expect(document.querySelector("[data-loopz-experience]")).not.toBeNull(); renderer.destroy();
    const missing = base("anchored_card"); if (!isGuide(missing)) missing.definition.target = { primarySelector: ".never", fallbackSelectors: [], reliability: "moderate" }; renderer.render(missing, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn(), onUnavailable: unavailable }); vi.advanceTimersByTime(5000); expect(unavailable).toHaveBeenCalledTimes(1); renderer.destroy(); document.body.appendChild(document.createElement("i")); await Promise.resolve(); expect(document.querySelector("[data-loopz-experience]")).toBeNull();
  });

  it("enters validated editor mode before analytics collectors or page views exist", async () => {
    history.replaceState({}, "", "/?loopz_editor_token=editor-token");
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "ees_1", accessToken: "access", expiresAt: new Date(Date.now() + 60000).toISOString() }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ experience: { id: "exp_1", name: "Draft", kind: "widget", widgetType: "toast" }, version: { id: "v1", versionNumber: 1, definition: { ...base("toast").definition, targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 } } } }) });
    vi.stubGlobal("fetch", fetchMock); const analytics = new Analytics(); analytics.init({ siteId: "site_1", endpoint: "https://api.example.com" }); await vi.runAllTimersAsync(); await vi.dynamicImportSettled();
    const internals = analytics as unknown as { editor: unknown; engine: unknown; session: unknown }; expect(internals.editor).toBeTruthy(); expect(internals.engine).toBeUndefined(); expect(internals.session).toBeUndefined(); analytics.event("editor-click"); expect(fetchMock.mock.calls.every(([url]) => String(url).includes("experience-editor"))).toBe(true); analytics.destroy();
  });
});

function isGuide(value: DeliveredExperience): value is DeliveredExperience & { definition: { steps: unknown[] } } { return "steps" in value.definition; }
