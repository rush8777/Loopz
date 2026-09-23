import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorModeController } from "../src/experiences/editor/EditorModeController";
import { ElementPicker } from "../src/experiences/editor/ElementPicker";
import { ExperienceRenderer } from "../src/experiences/runtime/ExperienceRenderer";
import { ExperienceLoader } from "../src/experiences/runtime/ExperienceLoader";
import { mountBuilderContent } from "../src/experiences/runtime/BuilderContent";
import { SessionManager } from "../src/core/SessionManager";
import { Analytics } from "../src/core/Analytics";
import type { DeliveredExperience, ExperienceDesign } from "../src/experiences/types";

const design: ExperienceDesign = { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } };
const base = (widgetType: DeliveredExperience["widgetType"]): DeliveredExperience => ({ id: "exp_1", versionId: "v1", kind: "widget", widgetType, priority: 1, definition: { content: { heading: "Hello", body: "World" }, design, behavior: { dismissible: true, toastPosition: "bottom-right", cursorOffset: { x: 12, y: 12 } } } });
function withBuilder(experience: DeliveredExperience, label = "Builder content"): DeliveredExperience { if (!isGuide(experience)) { experience.definition.content.primaryAction = { label: "Legacy action", type: "dismiss" }; experience.definition.builder = { version: 1, projectData: {}, html: `<section class="movecues-widget"><h2>${label}</h2><button data-movecues-action-id="primary"><span>Continue</span></button></section>`, css: `.movecues-widget{color:rgb(1,2,3)}` }; } return experience; }

describe("experience editor and runtime", () => {
  beforeEach(() => { document.body.innerHTML = ""; localStorage.clear(); sessionStorage.clear(); vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 1; }); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); history.replaceState({}, "", "/"); });

  it("activates editor mode only after a valid exchange and removes the raw token from the URL", async () => {
    history.replaceState({}, "", "/?movecues_editor_token=secret");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "ees_1", accessToken: "access", expiresAt: new Date(Date.now() + 60000).toISOString() }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ experience: { id: "exp_1", name: "Draft", kind: "widget", widgetType: "toast" }, version: { id: "v1", versionNumber: 1, definition: { ...withBuilder(base("toast"), "Draft builder preview").definition, targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 } } } }) });
    vi.stubGlobal("fetch", fetchMock); const controller = new EditorModeController("https://api.example.com");
    expect(await controller.start("secret")).toBe(true); expect(location.search).not.toContain("movecues_editor_token"); expect(document.querySelector("[data-movecues-editor]")).not.toBeNull(); expect(document.querySelector("[data-movecues-experience]")?.shadowRoot?.textContent).toContain("Draft builder preview"); controller.destroy();
  });

  it("leaves the token and host DOM untouched when validation fails", async () => {
    history.replaceState({}, "", "/?movecues_editor_token=bad"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await new EditorModeController("https://api.example.com").start("bad")).toBe(false); expect(location.search).toContain("movecues_editor_token=bad"); expect(document.querySelector("[data-movecues-editor]")).toBeNull();
  });

  it("prevents the host click while selecting and stores exact target metadata", async () => {
    const button = document.createElement("button"); button.dataset.testid = "checkout"; document.body.appendChild(button); Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => button });
    let hostClicks = 0; button.addEventListener("click", () => hostClicks++); const picker = new ElementPicker(); const selected = picker.pick();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 4, clientY: 4 })); const target = await selected;
    expect(hostClicks).toBe(0); expect(target).toMatchObject({ primarySelector: 'button[data-testid="checkout"]', reliability: "reliable" });
  });

  it("uses fallback selectors and does not mount an anchored card without a target", () => {
    const renderer = new ExperienceRenderer(); const callbacks = { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() };
    const missing = base("anchored_card"); expect(renderer.render(missing, callbacks)).toBe(true); expect(document.querySelector("[data-movecues-experience]")).toBeNull(); renderer.destroy();
    const target = document.createElement("button"); target.className = "fallback"; document.body.appendChild(target); const withFallback = base("anchored_card"); if (!("steps" in withFallback.definition)) withFallback.definition.target = { primarySelector: ".missing", fallbackSelectors: [".fallback"], reliability: "moderate" };
    expect(renderer.render(withFallback, callbacks)).toBe(true); expect(document.querySelector("[data-movecues-experience]")).not.toBeNull(); window.dispatchEvent(new Event("resize")); renderer.destroy();
  });

  it("mounts and safely destroys toast and cursor-follow lifecycles while cursor analytics is dormant", () => {
    for (const type of ["toast", "cursor_follow"] as const) {
      const renderer = new ExperienceRenderer();
      expect(renderer.render(base(type), { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() })).toBe(true);
      if (type === "cursor_follow") {
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 40, clientY: 50 }));
        const card = document.querySelector("[data-movecues-experience]")!.shadowRoot!.querySelector<HTMLElement>(".cursor")!;
        expect(card.style.left).toBe("52px");
        expect(card.style.top).toBe("62px");
      }
      renderer.destroy();
      expect(document.querySelector("[data-movecues-experience]")).toBeNull();
    }
  });

  it("advances a Guide from direct element hover without the global HoverCollector", () => {
    vi.useFakeTimers();
    const target = document.createElement("button"); target.id = "hover-target"; document.body.appendChild(target);
    const guide: DeliveredExperience = { id: "guide_hover", versionId: "v1", kind: "guide", widgetType: null, priority: 1, definition: { design, steps: [
      { id: "hover", content: { heading: "Hover", body: "Wait" }, advance: { type: "element_hover", durationMs: 400 }, target: { primarySelector: "#hover-target", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
    ] } };
    const advance = vi.fn(); const renderer = new ExperienceRenderer();
    renderer.render(guide, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn(), onGuideAdvance: advance }, "hover");
    target.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(399); expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(advance).toHaveBeenCalledOnce();
    renderer.destroy(); vi.useRealTimers();
  });

  it("renders builder markup through every widget shell while preserving runtime behavior", () => {
    const target = document.createElement("button"); target.id = "builder-target"; document.body.appendChild(target);
    for (const type of ["anchored_card", "toast", "cursor_follow", "modal", "slideout", "banner", "hotspot"] as const) {
      const experience = withBuilder(base(type), `Builder ${type}`); if (!isGuide(experience) && (type === "anchored_card" || type === "hotspot")) experience.definition.target = { primarySelector: "#builder-target", fallbackSelectors: [], reliability: "reliable" };
      const renderer = new ExperienceRenderer(); expect(renderer.render(experience, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() })).toBe(true);
      const root = document.querySelector(`[data-movecues-experience-root="${experience.id}"]`)!.shadowRoot!; if (type === "hotspot") root.querySelector<HTMLButtonElement>(".hotspot")!.click();
      expect(root.querySelector(".movecues-widget")?.textContent).toContain(`Builder ${type}`); expect(root.querySelector("style[data-movecues-builder-style]")?.textContent).toContain("rgb(1,2,3)"); if (type === "hotspot") { const beacon = root.querySelector<HTMLButtonElement>(".hotspot")!; beacon.click(); beacon.click(); expect(root.querySelectorAll("style[data-movecues-builder-style]")).toHaveLength(1); } renderer.destroy();
    }
  });

  it("mounts canonical builder selectors without runtime visual overrides", () => {
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); const card = document.createElement("div"); root.appendChild(card); const css = ".movecues-widget{background:#0d132d}.movecues-widget .movecues-widget__heading{color:#fff;font-size:32px}";
    expect(mountBuilderContent(root, card, { version: 1, projectData: {}, html: '<section class="movecues-widget"><h2 class="movecues-widget__heading">Hello<br>again</h2></section>', css }, { onPrimary: vi.fn(), onSecondary: vi.fn(), onDismiss: vi.fn() })).toBe(true); const installed = root.querySelector<HTMLStyleElement>("style[data-movecues-builder-style]")!.textContent; expect(installed).toContain(css); expect(installed).not.toContain("width:100%!important"); expect(installed).toContain("overflow:visible"); expect(installed).not.toContain("contain:layout style paint"); expect(root.querySelector<HTMLElement>(".builder-content")?.style.overflow).not.toBe("hidden"); expect(root.querySelector(".movecues-widget__heading")?.innerHTML).toBe("Hello<br>again");
  });

  it("enforces widget-specific sizing outside untrusted builder CSS", () => {
    const callbacks = { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() };
    const toast = withBuilder(base("toast")); if (!isGuide(toast)) { toast.definition.design.size = { width: { mode: "fixed", value: 3000 }, height: { mode: "auto" } }; toast.definition.builder!.css = ".movecues-widget{width:3000px!important}"; }
    const toastRenderer = new ExperienceRenderer(); toastRenderer.render(toast, callbacks); let root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; const toastCard = root.querySelector<HTMLElement>(".card")!;
    expect(toastCard.style.width).toBe("520px"); expect(toastCard.style.maxWidth).toContain("100vw - 24px"); expect(toastCard.style.overflow).toBe("visible"); expect(root.querySelector("style[data-movecues-builder-style]")?.textContent).toContain("width:3000px!important"); expect(root.querySelector("style[data-movecues-builder-style]")?.textContent).not.toContain("width:100%!important"); toastRenderer.destroy();
    const modal = base("modal"); if (!isGuide(modal)) modal.definition.design.size = { width: { mode: "full" }, height: { mode: "viewport" } };
    const modalRenderer = new ExperienceRenderer(); modalRenderer.render(modal, callbacks); root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector<HTMLElement>(".modal")?.dataset.sizeWidth).toBe("full"); expect(root.querySelector<HTMLElement>(".modal")?.style.height).toBe("calc(100vh - 24px)"); modalRenderer.destroy();
    const bannerRenderer = new ExperienceRenderer(); bannerRenderer.render(base("banner"), callbacks); root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector<HTMLElement>(".banner")?.dataset.sizeWidth).toBe("full"); bannerRenderer.destroy();
  });

  it("sanitizes builder HTML, delegates movecues actions, and falls back for unsafe builder data", () => {
    const callbacks = { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() }; const built = withBuilder(base("toast")); if (!isGuide(built)) built.definition.builder!.html = '<section class="movecues-widget"><script>window.bad=1</script><button onclick="window.bad=2" data-movecues-action-id="primary"><span>Act</span></button><iframe src="https://unsupported.test"></iframe><video src="https://unsupported.test/video.mp4"></video><ul><li>Plain list text</li></ul><img src="data:image/svg+xml;base64,unsafe"></section>';
    const renderer = new ExperienceRenderer(); renderer.render(built, callbacks); let root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector("script,iframe,video")).toBeNull(); expect(root.querySelector("ul li")?.textContent).toBe("Plain list text"); expect(root.querySelector("img")?.hasAttribute("src")).toBe(false); expect(root.querySelector("[onclick]")).toBeNull(); root.querySelector<HTMLSpanElement>("[data-movecues-action-id=primary] span")!.click(); expect(callbacks.onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "dismiss" })); renderer.destroy();
    const unsafe = withBuilder(base("toast")); if (!isGuide(unsafe)) unsafe.definition.builder!.css = "body{display:none}"; renderer.render(unsafe, callbacks); root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector(".movecues-widget")).toBeNull(); expect(root.textContent).toContain("Hello"); renderer.destroy();
    renderer.render(base("toast"), callbacks); root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector(".legacy-content")?.textContent).toContain("World"); renderer.destroy();
  });

  it("isolates and deduplicates builder CSS per experience ShadowRoot", () => {
    const first = withBuilder(base("toast"), "First"); first.id = "exp_a"; const second = withBuilder(base("toast"), "Second"); second.id = "exp_b"; if (!isGuide(second)) second.definition.builder!.css = ".movecues-widget{color:blue}";
    const firstRenderer = new ExperienceRenderer(), secondRenderer = new ExperienceRenderer(); const callbacks = { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() }; firstRenderer.render(first, callbacks); secondRenderer.render(second, callbacks);
    const firstRoot = document.querySelector('[data-movecues-experience-root="exp_a"]')!.shadowRoot!, secondRoot = document.querySelector('[data-movecues-experience-root="exp_b"]')!.shadowRoot!; expect(firstRoot.querySelectorAll("style[data-movecues-builder-style]")).toHaveLength(1); expect(secondRoot.querySelectorAll("style[data-movecues-builder-style]")).toHaveLength(1); expect(firstRoot.querySelector("style[data-movecues-builder-style]")?.textContent).not.toBe(secondRoot.querySelector("style[data-movecues-builder-style]")?.textContent); expect(document.querySelector("style[data-movecues-builder-style]")).toBeNull(); firstRenderer.destroy(); expect(document.querySelector('[data-movecues-experience-root="exp_b"]')).not.toBeNull(); secondRenderer.destroy();
  });

  it("renders modal, slideout, banner, and hotspot widgets through the shared lifecycle", () => {
    const callbacks = { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() };
    const modal = base("modal"); if (!isGuide(modal)) modal.definition.behavior = { dismissible: true, modalLayout: "fullscreen", backdrop: true, closeOnBackdrop: true };
    const modalRenderer = new ExperienceRenderer(); expect(modalRenderer.render(modal, callbacks)).toBe(true); let root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector(".modal")?.getAttribute("data-layout")).toBe("fullscreen"); expect(root.querySelector(".backdrop")).not.toBeNull(); modalRenderer.destroy();
    const slideout = base("slideout"); if (!isGuide(slideout)) slideout.definition.behavior = { dismissible: true, slideoutPosition: "center-left" };
    const slideoutRenderer = new ExperienceRenderer(); expect(slideoutRenderer.render(slideout, callbacks)).toBe(true); root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector(".slideout")?.getAttribute("data-position")).toBe("center-left"); slideoutRenderer.destroy();
    const banner = base("banner"); if (!isGuide(banner)) banner.definition.behavior = { dismissible: true, bannerPosition: "bottom" };
    const bannerRenderer = new ExperienceRenderer(); expect(bannerRenderer.render(banner, callbacks)).toBe(true); root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector(".banner")?.getAttribute("data-position")).toBe("bottom"); bannerRenderer.destroy();
    const target = document.createElement("button"); target.id = "feature"; document.body.appendChild(target); const hotspot = base("hotspot"); if (!isGuide(hotspot)) { hotspot.definition.target = { primarySelector: "#feature", fallbackSelectors: [], reliability: "reliable" }; hotspot.definition.behavior = { dismissible: true, hotspotStyle: "question", hotspotColor: "#ef4444" }; }
    const hotspotRenderer = new ExperienceRenderer(); expect(hotspotRenderer.render(hotspot, callbacks)).toBe(true); root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; const beacon = root.querySelector<HTMLButtonElement>(".hotspot")!; expect(beacon.dataset.style).toBe("question"); expect(root.querySelector(".card")).toBeNull(); beacon.click(); expect(root.querySelector(".card")?.textContent).toContain("Hello"); hotspotRenderer.destroy(); expect(document.querySelector("[data-movecues-experience]")).toBeNull();
  });

  it("does not record an impression when an eligible anchored target is missing", async () => {
    const experience = base("anchored_card"); const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ experiences: [experience] }) }); vi.stubGlobal("fetch", fetchMock);
    const loader = new ExperienceLoader("https://api.example.com", "site_1", new SessionManager()); await loader.evaluate();
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(String(fetchMock.mock.calls[0][0])).toContain("/experiences?"); loader.destroy();
  });

  it("treats a legacy Guide step with no advance setting as button advancement", () => {
    const first = document.createElement("button"); first.id = "first"; const second = document.createElement("button"); second.id = "second"; document.body.append(first, second);
    const guide: DeliveredExperience = { id: "guide_1", versionId: "v1", kind: "guide", widgetType: null, priority: 1, definition: { design, targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 }, steps: [
      { id: "one", content: { heading: "First", body: "One", primaryAction: { label: "Next", type: "next_step" } }, builder: { version: 1, projectData: {}, html: '<section class="movecues-widget"><h2>Builder First</h2><button data-movecues-action-id="primary">Next</button></section>', css: ".movecues-widget{color:rgb(12,34,56)}" }, target: { primarySelector: "#first", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
      { id: "two", content: { heading: "Second", body: "Two", primaryAction: { label: "Finish", type: "next_step" } }, target: { primarySelector: "#second", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
    ] } };
    const renderer = new ExperienceRenderer(); const advance = vi.fn(); const back = vi.fn(); const callbacks = { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn(), onGuideAdvance: advance, onGuideBack: back }; renderer.render(guide, callbacks, "one");
    const root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector(".movecues-widget")?.textContent).toContain("Builder First"); root.querySelector<HTMLButtonElement>('[data-movecues-action-id="primary"]')!.click(); expect(advance).toHaveBeenCalledOnce(); renderer.render(guide, callbacks, "two"); const secondRoot = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(secondRoot.textContent).toContain("Second"); secondRoot.querySelector<HTMLButtonElement>(".secondary")!.click(); expect(back).toHaveBeenCalledOnce(); renderer.destroy();
  });

  it("advances the active Guide from its real target click and matching custom event", async () => {
    const first = document.createElement("button"); first.id = "advance-first"; const second = document.createElement("button"); second.id = "advance-second"; const third = document.createElement("button"); third.id = "advance-third"; document.body.append(first, second, third); let hostClicks = 0; first.addEventListener("click", () => hostClicks++);
    const guide: DeliveredExperience = { id: "guide_advance", versionId: "v1", kind: "guide", widgetType: null, priority: 40, definition: { design, steps: [
      { id: "click", content: { heading: "Click step", body: "One" }, advance: { type: "element_click" }, target: { primarySelector: "#advance-first", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
      { id: "event", content: { heading: "Event step", body: "Two" }, advance: { type: "custom_event", eventName: "saved" }, target: { primarySelector: "#advance-second", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
      { id: "done", content: { heading: "Done step", body: "Three" }, target: { primarySelector: "#advance-third", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
    ] } };
    const fetchMock = experienceFetch(() => [guide]); vi.stubGlobal("fetch", fetchMock); const loader = new ExperienceLoader("https://api.example.com", "site_1", runtimeSession); await loader.evaluate(); first.click(); await Promise.resolve(); expect(hostClicks).toBe(1); expect(activeExperienceText()).toContain("Event step"); loader.onCustomEvent("other"); await Promise.resolve(); expect(activeExperienceText()).toContain("Event step"); loader.onCustomEvent("saved"); expect(activeExperienceText()).toContain("Done step"); loader.destroy();
  });

  it("renders and advances one Guide across Modal and Anchored Card patterns", async () => {
    const target = document.createElement("button"); target.id = "mixed-guide-target"; document.body.appendChild(target);
    const guide: DeliveredExperience = { id: "guide_mixed", versionId: "v1", kind: "guide", widgetType: null, priority: 40, definition: { design, steps: [
      { id: "modal-first", pattern: "modal", content: { heading: "Modal first", body: "One", primaryAction: { label: "Next", type: "next_step" } }, advance: { type: "button" }, behavior: { dismissible: true } },
      { id: "anchored", pattern: "anchored_card", content: { heading: "Anchored middle", body: "Two", primaryAction: { label: "Next", type: "next_step" } }, advance: { type: "button" }, target: { primarySelector: "#mixed-guide-target", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true, placement: "auto", alignment: "center", offset: 8 } },
      { id: "modal-last", pattern: "modal", content: { heading: "Modal last", body: "Three", primaryAction: { label: "Finish", type: "next_step" } }, advance: { type: "button" }, behavior: { dismissible: true } },
    ] } };
    const fetchMock = experienceFetch(() => [guide]); vi.stubGlobal("fetch", fetchMock); const loader = new ExperienceLoader("https://api.example.com", "site_1", runtimeSession); await loader.evaluate();
    let root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector(".modal")?.textContent).toContain("Modal first"); root.querySelector<HTMLButtonElement>(".primary")!.click();
    root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector(".modal")).toBeNull(); expect(root.querySelector(".card")?.textContent).toContain("Anchored middle"); root.querySelector<HTMLButtonElement>(".primary")!.click();
    root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; expect(root.querySelector(".modal")?.textContent).toContain("Modal last"); loader.destroy();
  });

  it("waits for the next Guide step's page before rendering it", async () => {
    history.replaceState({}, "", "/first");
    const first = document.createElement("button"); first.id = "cross-page-first"; const nextPageTarget = document.createElement("button"); nextPageTarget.id = "cross-page-next"; document.body.append(first, nextPageTarget);
    const guide: DeliveredExperience = { id: "guide_cross_page", versionId: "v1", kind: "guide", widgetType: null, priority: 40, definition: { design, steps: [
      { id: "one", content: { heading: "First page", body: "One" }, advance: { type: "element_click" }, target: { primarySelector: "#cross-page-first", fallbackSelectors: [], reliability: "reliable", targetContext: { pagePath: "/first" } }, behavior: { dismissible: true } },
      { id: "two", content: { heading: "Second page", body: "Two" }, target: { primarySelector: "#cross-page-next", fallbackSelectors: [], reliability: "reliable", targetContext: { pagePath: "/second" } }, behavior: { dismissible: true } },
    ] } };
    const fetchMock = experienceFetch(() => [guide]); vi.stubGlobal("fetch", fetchMock); const loader = new ExperienceLoader("https://api.example.com", "site_1", runtimeSession); await loader.evaluate(); expect(activeExperienceText()).toContain("First page");
    first.click(); await Promise.resolve(); expect(document.querySelector("[data-movecues-experience]")).toBeNull(); expect(JSON.parse(sessionStorage.getItem("__movecues_active_guide__")!)).toMatchObject({ currentStepId: "two", status: "active" });
    history.pushState({}, "", "/second"); loader.onRouteChange(); expect(activeExperienceText()).toContain("Second page"); loader.destroy();
  });

  it("resumes a multi-page Guide through every full-page load as one impression", async () => {
    history.replaceState({}, "", "/one");
    const first = document.createElement("button"); first.id = "reload-first"; const second = document.createElement("button"); second.id = "reload-second"; const third = document.createElement("button"); third.id = "reload-third"; document.body.append(first, second, third);
    const guide: DeliveredExperience = { id: "guide_reload", versionId: "v1", kind: "guide", widgetType: null, priority: 40, definition: { design, steps: [
      { id: "one", content: { heading: "Reload one", body: "One" }, advance: { type: "element_click" }, target: { primarySelector: "#reload-first", fallbackSelectors: [], reliability: "reliable", targetContext: { pagePath: "/one" } }, behavior: { dismissible: true } },
      { id: "two", content: { heading: "Reload two", body: "Two" }, advance: { type: "route", pageRules: [{ id: "three", kind: "include", operator: "equals", value: "/three" }] }, target: { primarySelector: "#reload-second", fallbackSelectors: [], reliability: "reliable", targetContext: { pagePath: "/two" } }, behavior: { dismissible: true } },
      { id: "three", content: { heading: "Reload three", body: "Three", primaryAction: { label: "Finish", type: "next_step" } }, target: { primarySelector: "#reload-third", fallbackSelectors: [], reliability: "reliable", targetContext: { pagePath: "/three" } }, behavior: { dismissible: true } },
    ] } };
    const fetchMock = experienceFetch((_trigger, url) => location.pathname === "/one" || (url.searchParams.get("activeGuideId") === guide.id && url.searchParams.get("activeGuideVersionId") === guide.versionId) ? [guide] : []); vi.stubGlobal("fetch", fetchMock);

    const firstLoader = new ExperienceLoader("https://api.example.com", "site_1", runtimeSession); await firstLoader.evaluate(); await vi.waitFor(() => expect(JSON.parse(sessionStorage.getItem("__movecues_active_guide__")!).impressionId).toBe(`imp_${guide.id}`)); first.click(); await Promise.resolve(); firstLoader.destroy();
    history.pushState({}, "", "/two"); const secondLoader = new ExperienceLoader("https://api.example.com", "site_1", runtimeSession); await secondLoader.evaluate(); expect(activeExperienceText()).toContain("Reload two"); secondLoader.destroy();
    history.pushState({}, "", "/three"); const thirdLoader = new ExperienceLoader("https://api.example.com", "site_1", runtimeSession); await thirdLoader.evaluate(); expect(activeExperienceText()).toContain("Reload three"); document.querySelector("[data-movecues-experience]")!.shadowRoot!.querySelector<HTMLButtonElement>(".primary")!.click(); await vi.waitFor(() => expect(postedEvents(fetchMock).some(event => event.experienceId === guide.id && event.event === "completed")).toBe(true));

    const guideRequests = fetchMock.mock.calls.filter(([input, init]) => !init?.method && String(input).includes("/experiences?")); expect(guideRequests.slice(1, 3).every(([input]) => { const url = new URL(String(input)); return url.searchParams.get("activeGuideId") === guide.id && url.searchParams.get("activeGuideVersionId") === guide.versionId; })).toBe(true); expect(postedEvents(fetchMock).filter(event => event.experienceId === guide.id && event.event === "shown")).toHaveLength(1); expect(sessionStorage.getItem("__movecues_active_guide__")).toBeNull(); thirdLoader.destroy();
  });

  it("keeps the current Guide step across an SPA route change and records one impression", async () => {
    const first = document.createElement("button"); first.id = "route-first"; const second = document.createElement("button"); second.id = "route-second"; document.body.append(first, second);
    const guide: DeliveredExperience = { id: "guide_route", versionId: "v1", kind: "guide", widgetType: null, priority: 40, definition: { design, steps: [
      { id: "route", content: { heading: "Route step", body: "One" }, advance: { type: "route", pageRules: [{ id: "next", kind: "include", operator: "equals", value: "/next" }] }, target: { primarySelector: "#route-first", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
      { id: "after", content: { heading: "After route", body: "Two" }, target: { primarySelector: "#route-second", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
    ] } };
    const fetchMock = experienceFetch(() => [guide]); vi.stubGlobal("fetch", fetchMock); const loader = new ExperienceLoader("https://api.example.com", "site_1", runtimeSession); await loader.evaluate(); history.pushState({}, "", "/next"); loader.onRouteChange(); expect(activeExperienceText()).toContain("After route"); await Promise.resolve(); const shown = postedEvents(fetchMock).filter(event => event.experienceId === guide.id && event.event === "shown"); expect(shown).toHaveLength(1); expect(JSON.parse(sessionStorage.getItem("__movecues_active_guide__")!)).toMatchObject({ currentStepId: "after", status: "active" }); loader.destroy();
  });

  it("pauses a Guide for a higher-priority interrupt and resumes the same step without another impression", async () => {
    const first = document.createElement("button"); first.id = "interrupt-first"; const second = document.createElement("button"); second.id = "interrupt-second"; document.body.append(first, second);
    const guide: DeliveredExperience = { id: "guide_interrupt", versionId: "v1", kind: "guide", widgetType: null, priority: 40, definition: { design, steps: [
      { id: "one", content: { heading: "Guide one", body: "One", primaryAction: { label: "Next", type: "next_step" } }, target: { primarySelector: "#interrupt-first", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
      { id: "two", content: { heading: "Guide two", body: "Two" }, target: { primarySelector: "#interrupt-second", fallbackSelectors: [], reliability: "reliable" }, behavior: { dismissible: true } },
    ] } };
    const modal = base("modal"); modal.id = "modal_interrupt"; modal.priority = 80; modal.interruptPolicy = "interrupt";
    const fetchMock = experienceFetch(trigger => trigger === "open_modal" ? [modal] : [guide]); vi.stubGlobal("fetch", fetchMock); const loader = new ExperienceLoader("https://api.example.com", "site_1", runtimeSession); await loader.evaluate(); document.querySelector("[data-movecues-experience]")!.shadowRoot!.querySelector<HTMLButtonElement>(".primary")!.click(); expect(activeExperienceText()).toContain("Guide two"); loader.onCustomEvent("open_modal"); await vi.waitFor(() => expect(activeExperienceText()).toContain("Hello")); expect(JSON.parse(sessionStorage.getItem("__movecues_active_guide__")!)).toMatchObject({ currentStepId: "two", status: "paused" }); document.querySelector("[data-movecues-experience]")!.shadowRoot!.querySelector<HTMLButtonElement>(".close")!.click(); await vi.waitFor(() => expect(activeExperienceText()).toContain("Guide two")); const guideShown = postedEvents(fetchMock).filter(event => event.experienceId === guide.id && event.event === "shown"); expect(guideShown).toHaveLength(1); loader.destroy();
  });

  it("waits for a delayed SPA target and cleans up on timeout or destroy", async () => {
    vi.useFakeTimers(); const renderer = new ExperienceRenderer(); const unavailable = vi.fn(); const delayed = base("anchored_card"); if (!isGuide(delayed)) delayed.definition.target = { primarySelector: ".late", fallbackSelectors: [], reliability: "moderate" };
    expect(renderer.render(delayed, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn(), onUnavailable: unavailable })).toBe(true); expect(document.querySelector("[data-movecues-experience]")).toBeNull(); const target = document.createElement("button"); target.className = "late"; document.body.appendChild(target); await Promise.resolve(); expect(document.querySelector("[data-movecues-experience]")).not.toBeNull(); renderer.destroy();
    const missing = base("anchored_card"); if (!isGuide(missing)) missing.definition.target = { primarySelector: ".never", fallbackSelectors: [], reliability: "moderate" }; renderer.render(missing, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn(), onUnavailable: unavailable }); vi.advanceTimersByTime(5000); expect(unavailable).toHaveBeenCalledTimes(1); renderer.destroy(); document.body.appendChild(document.createElement("i")); await Promise.resolve(); expect(document.querySelector("[data-movecues-experience]")).toBeNull();
  });

  it("enters validated editor mode before analytics collectors or page views exist", async () => {
    history.replaceState({}, "", "/?movecues_editor_token=editor-token");
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: "ees_1", accessToken: "access", expiresAt: new Date(Date.now() + 60000).toISOString() }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ experience: { id: "exp_1", name: "Draft", kind: "widget", widgetType: "toast" }, version: { id: "v1", versionNumber: 1, definition: { ...base("toast").definition, targeting: { pageRules: [], audience: { type: "all" }, trigger: { type: "page_load" }, frequency: { mode: "once" }, priority: 0 } } } }) });
    vi.stubGlobal("fetch", fetchMock); const analytics = new Analytics({ editor: { createController: (apiBase) => new EditorModeController(apiBase) } }); analytics.init({ siteId: "site_1", endpoint: "https://api.example.com" }); await vi.runAllTimersAsync();
    const internals = analytics as unknown as { editor: unknown; engine: unknown; session: unknown }; expect(internals.editor).toBeTruthy(); expect(internals.engine).toBeUndefined(); expect(internals.session).toBeUndefined(); analytics.event("editor-click"); expect(fetchMock.mock.calls.every(([url]) => String(url).includes("experience-editor"))).toBe(true); analytics.destroy();
  });
});

function isGuide(value: DeliveredExperience): value is DeliveredExperience & { definition: { steps: unknown[] } } { return "steps" in value.definition; }
const runtimeSession = { getAnonymousId: () => "anon_1", getSessionId: () => "session_1", getPageViewId: () => "pageview_1", getIdentifiedUserId: () => null };
function experienceFetch(manifest: (trigger: string | null, url: URL) => DeliveredExperience[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/experience-events")) { const event = JSON.parse(String(init?.body)); return { ok: true, status: event.event === "shown" ? 201 : 204, json: async () => ({ impressionId: `imp_${event.experienceId}` }) }; }
    const parsed = new URL(url); return { ok: true, status: 200, json: async () => ({ experiences: manifest(parsed.searchParams.get("trigger"), parsed) }) };
  });
}
function postedEvents(fetchMock: ReturnType<typeof vi.fn>): Array<{ experienceId: string; event: string }> { return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body))); }
function activeExperienceText(): string { return document.querySelector("[data-movecues-experience]")?.shadowRoot?.textContent ?? ""; }
