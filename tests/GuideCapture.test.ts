import { afterEach, describe, expect, it, vi } from "vitest";
import { GuideCaptureSelection } from "../src/experiences/editor/GuideCaptureSelection";
import { captureTargetFor, describeCaptureTarget, guideCapturePath } from "../src/experiences/editor/GuideCaptureTargets";
import { GuidedCaptureController } from "../src/experiences/editor/GuidedCaptureController";
import type { CaptureBridge, StoredGuideCapture } from "../src/experiences/editor/GuideCaptureTypes";
import { EditorSessionExpiredError } from "../src/experiences/editor/EditorBridge";
import { matchesGuideTargetPage } from "../src/experiences/runtime/GuideStepLogic";
import type { EditorDraft } from "../src/experiences/types";

const session = { sessionId: "capture-test-session", accessToken: "do-not-copy-this-token", expiresAt: "2099-01-01" };
const draft = { experience: { id: "guide", kind: "guide", widgetType: null, builderMode: "onsite", name: "Guide" }, version: { id: "draft", revision: 1, versionNumber: 1 } } as EditorDraft;
const path = () => new URL(location.href).pathname;
const initial: StoredGuideCapture = { targets: [], mode: "select", revision: 1, checkpointRevision: 0 };
const target = () => document.querySelector("#target")!;
const checkpoint = () => document.querySelector("[data-movcues-guide-capture]")?.shadowRoot;
const button = (selector: string) => checkpoint()?.querySelector<HTMLButtonElement>(selector);
const changes = () => new Promise(resolve => requestAnimationFrame(resolve));

afterEach(() => {
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
  sessionStorage.clear();
});

describe("Guided Capture", () => {
  it("captures the containing link instead of a nested icon and omits href, queries and form values", () => {
    document.body.innerHTML = '<a id="target" href="/path?token=secret-value"><span>Open invoices</span></a><input aria-label="Invoice memo" value="private text"><input type="password" value="pass"><div data-private><button>Private</button></div>';
    const picked = captureTargetFor(document.querySelector("#target span"));
    expect(picked).toBe(target());
    expect(describeCaptureTarget(picked!, "one", "/billing").target.label).toBe("Open invoices");
    expect(JSON.stringify(describeCaptureTarget(picked!, "one", "/billing"))).not.toContain("secret-value");
    expect(JSON.stringify(describeCaptureTarget(document.querySelector("input")!, "two", "/billing"))).not.toContain("private text");
    expect(captureTargetFor(document.querySelector('[type="password"]'))).toBeNull();
    expect(captureTargetFor(document.querySelector("[data-private] button"))).toBeNull();
    expect(guideCapturePath(new URL("https://example.test/billing?token=value#/settings?password=123"))).toBe("/billing#/settings");
    expect(guideCapturePath(new URL("https://example.test/reset-password/secret-value"))).toBeNull();
    expect(guideCapturePath(new URL("https://example.test/billing#access_token"))).toBe("/billing");
  });

  it("intercepts website actions only during selection and removes all interception and overlays on destroy", async () => {
    document.body.innerHTML = '<button id="target"><span>New invoice</span></button>';
    const selected = vi.fn();
    const clicked = vi.fn();
    const pointer = vi.fn();
    target().addEventListener("click", clicked);
    target().addEventListener("pointerdown", pointer);
    const selection = new GuideCaptureSelection(selected);
    selection.setEnabled(true);
    const nested = target().querySelector("span")!;
    nested.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    nested.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(selected).toHaveBeenCalledWith(target());
    expect(clicked).not.toHaveBeenCalled();
    expect(pointer).not.toHaveBeenCalled();
    selection.setEnabled(false);
    nested.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toHaveBeenCalledTimes(1);
    selection.setEnabled(true);
    selection.destroy();
    nested.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[data-movcues-picker-overlay]")).toBeNull();
  });

  it("moves numbered markers with the journey order and re-resolves disappearing targets", async () => {
    document.body.innerHTML = '<button id="target">One</button><button id="other">Two</button>';
    const rectangle = { x: 2, y: 2, top: 2, left: 2, bottom: 32, right: 62, width: 60, height: 30, toJSON() {} };
    const other = document.querySelector("#other")!;
    vi.spyOn(target(), "getBoundingClientRect").mockReturnValue(rectangle);
    vi.spyOn(other, "getBoundingClientRect").mockReturnValue(rectangle);
    const selected = [describeCaptureTarget(target(), "one", path()), describeCaptureTarget(other, "two", path())];
    const selection = new GuideCaptureSelection(vi.fn());
    const marker = (id: string) => document.querySelector<HTMLElement>(`[data-movcues-capture-marker="${id}"]`);
    try {
      selection.setTargets(selected);
      await changes();
      expect(marker("one")?.textContent).toBe("1");
      selection.setTargets(selected.slice().reverse());
      await changes();
      expect(marker("one")?.textContent).toBe("2");
      history.pushState(null, "", "/next");
      selection.refresh();
      await changes();
      expect(marker("one")?.hidden).toBe(true);
      history.back();
      await vi.waitFor(() => expect(path()).toBe("/"));
      document.body.removeChild(other);
      selection.refresh();
      await changes();
      expect(marker("two")?.hidden).toBe(true);
      document.body.append(other);
      await changes();
      await changes();
      expect(marker("two")?.hidden).toBe(false);
      selection.setTargets([selected[1]]);
      expect(marker("one")).toBeNull();
    } finally { selection.destroy(); }
  });

  it("keeps a failed checkpoint recoverable and restores it on editor re-entry without saving an access token", async () => {
    document.body.innerHTML = '<button id="target">Invoice</button>';
    const bridge = {
      loadCapture: vi.fn().mockResolvedValue(initial),
      saveCapture: vi.fn().mockRejectedValueOnce(new Error("Temporary checkpoint failure")).mockResolvedValue({ checkpointRevision: 1 }),
    } as unknown as CaptureBridge;
    const first = new GuidedCaptureController(bridge, session, draft, vi.fn(), vi.fn());
    first.mount();
    try {
      await vi.waitFor(() => expect(button("[data-mode=select]")?.getAttribute("aria-pressed")).toBe("true"));
      (target() as HTMLElement).click();
      await vi.waitFor(() => expect(button("[data-retry]")?.hidden).toBe(false));
      const local = Object.keys(sessionStorage).find(key => key.startsWith("movcues:guide-capture"))!;
      expect(sessionStorage.getItem(local)).toContain("Invoice");
      expect(sessionStorage.getItem(local)).not.toContain(session.accessToken);
    } finally { first.destroy(); }
    const second = new GuidedCaptureController(bridge, session, draft, vi.fn(), vi.fn());
    second.mount();
    try {
      await vi.waitFor(() => expect(checkpoint()?.querySelector("[data-targets] li")?.textContent).toContain("Invoice"));
      await vi.waitFor(() => expect(checkpoint()?.querySelector("[data-checkpoint]")?.textContent).toBe("Capture saved"));
    } finally { second.destroy(); }
  });

  it("stops intercepting the host on session expiry", async () => {
    document.body.innerHTML = '<button id="target">Invoice</button>';
    const clicked = vi.fn();
    target().addEventListener("click", clicked);
    const bridge = { loadCapture: vi.fn().mockResolvedValue(initial), saveCapture: vi.fn().mockRejectedValue(new EditorSessionExpiredError()) } as unknown as CaptureBridge;
    const controller = new GuidedCaptureController(bridge, session, draft, vi.fn(), vi.fn());
    controller.mount();
    try {
      await vi.waitFor(() => expect(button("[data-mode=select]")?.getAttribute("aria-pressed")).toBe("true"));
      (target() as HTMLElement).click();
      await vi.waitFor(() => expect(checkpoint()?.querySelector("[data-message]")?.textContent).toContain("session expired"));
      (target() as HTMLElement).click();
      expect(clicked).toHaveBeenCalledTimes(1);
    } finally { controller.destroy(); }
  });

  it("cancels a planning request while keeping the selected elements and prompt", async () => {
    document.body.innerHTML = '<button id="target">Invoice</button>';
    const captured = describeCaptureTarget(target(), "one", path());
    let requestSignal: AbortSignal | undefined;
    const bridge = {
      loadCapture: vi.fn().mockResolvedValue({ ...initial, targets: [captured] }),
      saveCapture: vi.fn().mockResolvedValue({ checkpointRevision: 1 }),
      planCapture: vi.fn((_input: unknown, signal: AbortSignal) => {
        requestSignal = signal;
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      }),
    } as unknown as CaptureBridge;
    const controller = new GuidedCaptureController(bridge, session, draft, vi.fn(), vi.fn());
    controller.mount();
    try {
      await vi.waitFor(() => expect(button("[data-plan]")?.disabled).toBe(false));
      const field = checkpoint()!.querySelector<HTMLTextAreaElement>("[data-prompt]")!;
      field.value = "Create a first invoice";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.form!.dispatchEvent(new Event("submit", { cancelable: true }));
      await vi.waitFor(() => expect(requestSignal).toBeDefined());
      button("[data-cancel]")!.click();
      await vi.waitFor(() => expect(checkpoint()?.querySelector("[data-message]")?.textContent).toContain("Request canceled"));
      expect(requestSignal?.aborted).toBe(true);
      expect(field.value).toBe("Create a first invoice");
      expect(checkpoint()?.querySelector("[data-targets]")?.textContent).toContain("Invoice");
      expect(button("[data-plan]")?.disabled).toBe(false);
    } finally { controller.destroy(); }
  });

  it("uses sanitized path matching for generated targets and preserves literal legacy matching", () => {
    document.body.innerHTML = '<button id="target">Invoice</button>';
    const { target: legacy } = describeCaptureTarget(target(), "one", "/invoices");
    const generated = { ...legacy, targetContext: { pagePath: "/invoices#/details", match: "path" as const } };
    expect(matchesGuideTargetPage(legacy, "/invoices?tab=all")).toBe(false);
    expect(matchesGuideTargetPage(generated, "/invoices?tab=all#/details?row=123")).toBe(true);
    expect(matchesGuideTargetPage(generated, "/invoices#/details-plus")).toBe(false);
  });
});
