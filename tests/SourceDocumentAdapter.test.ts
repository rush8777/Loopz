import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnsiteCompositionEditor } from "../src/experiences/editor/OnsiteCompositionEditor";
import { applySourceMarkup, sourceContext, validateSourceMarkup } from "../src/experiences/editor/SourceAuthoring";
import fixture from "./fixtures/source-editability.json";
import type { ExperienceContent, WidgetBuilderState } from "../src/experiences/types";

const { html: sourceHtml, css: sourceCss } = fixture;
const operation = { type: "replace_markup" as const, html: sourceHtml, css: sourceCss, actionBindings: { start_now: { type: "dismiss" as const } } };

describe("source adapter through the existing composition editor", () => {
  let editor: OnsiteCompositionEditor, builder: WidgetBuilderState, content: ExperienceContent, root: ShadowRoot;
  const validation = vi.fn();
  function open() {
    const host = document.createElement("div"); document.body.append(host); root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<style data-movcues-builder-style></style><div data-movcues-builder-surface></div>';
    editor = new OnsiteCompositionEditor(root, builder, content, "modal", false, { onChange() {}, onSelectionChange() {}, onValidation: validation }); editor.start();
  }
  const click = (selector: string) => root.querySelector<HTMLElement>(selector)!.click();
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; }); vi.stubGlobal("cancelAnimationFrame", vi.fn());
    builder = { version: 1, html: "", css: "", projectData: {} }; content = { heading: "", body: "" };
    applySourceMarkup(builder, content, operation, { widgetType: "modal", guide: false }); open(); validation.mockClear();
  });
  afterEach(() => { editor?.destroy(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("selects source components, parents and children without converting storage or changing source", () => {
    expect(builder.html).toBe(sourceHtml); expect(builder.css).toBe(sourceCss);
    click("h2 span"); expect(editor.getSelectedBlock()?.id).toBe("title_block");
    editor.selectParent(); expect(editor.getSelection().kind).toBe("cell"); editor.selectChild(); expect(editor.getSelection().kind).toBe("block");
    expect((builder.projectData.movcues as Record<string, unknown>).onsiteDocument).toBeUndefined();
  });
  it("edits text without dropping inline classes, surrounding markup, or source CSS", () => {
    click("h2"); const heading = root.querySelector<HTMLElement>("h2")!;
    heading.firstChild!.textContent = "Hello "; heading.dispatchEvent(new Event("input", { bubbles: true })); expect(editor.flush()).toBe(true);
    expect(builder.html).toContain('Hello <span class="accent">aboard</span>'); expect(builder.html).toContain('<strong>something</strong>'); expect(builder.css).toBe(sourceCss);
    expect(content.heading).toBe("Hello aboard"); editor.undo(); expect(content.heading).toBe("Welcome aboard"); editor.redo(); expect(content.heading).toBe("Hello aboard");
  });
  it("updates one declaration and keeps unrelated styles, comments and responsive rules byte-for-byte", () => {
    click("h2"); editor.updateBlock({ fontSize: 40 });
    expect(builder.css).toBe(sourceCss.replace("font-size: 32px", "font-size: 40px"));
    for (let size = 41; size < 50; size++) editor.updateBlock({ fontSize: size });
    expect(builder.css.match(/font-size:/g)).toHaveLength(1); expect(editor.getValidation()).toEqual([]);
  });
  it("inserts, reorders, duplicates and removes through existing controls with live action bindings", () => {
    click("h2"); expect(editor.insertBlock("image")).toBe(true);
    expect(editor.getValidation(), JSON.stringify(validation.mock.calls)).toEqual([]);
    expect(editor.setImageSource("https://example.com/image.png"), JSON.stringify(validation.mock.calls)).toBe(true);
    editor.updateBlock({ alt: "Preview" }); expect(builder.html).toContain('alt="Preview"');
    expect(editor.move(1)).toBe(true); expect(editor.duplicate()).toBe(true); expect(editor.remove()).toBe(true);
    click("button[data-movcues-action-id]"); editor.updateButtonAction({ type: "open_url", url: "https://example.com/docs" });
    expect(sourceContext(builder, false).actionBindings).toEqual({ start_now: { type: "open_url", url: "https://example.com/docs" } });
    expect(editor.getValidation()).toEqual([]); expect(builder.css).toContain("letter-spacing: -1px");
  });
  it("duplicates a designed subtree with fresh node/block/action identities and its scoped styles", () => {
    click(".hero"); expect(editor.duplicate()).toBe(true); expect(editor.getValidation()).toEqual([]);
    expect(root.querySelectorAll(".hero"), JSON.stringify(validation.mock.calls)).toHaveLength(2);
    const ids = Array.from(root.querySelectorAll("[data-movcues-action-id]"), el => el.getAttribute("data-movcues-action-id")); expect(new Set(ids).size).toBe(2);
    expect(Object.keys(sourceContext(builder, false).actionBindings as object)).toHaveLength(2);
    editor.undo(); expect(root.querySelectorAll(".hero")).toHaveLength(1); editor.redo(); expect(root.querySelectorAll(".hero")).toHaveLength(2);
  });
  it("restores source editability after save/reopen and gives AI the latest canonical source", () => {
    click("h2"); editor.updateBlock({ fontSize: 40 }); editor.insertBlock("button"); const saved = structuredClone(builder);
    editor.destroy(); builder = saved; open(); click("h2"); editor.updateBlock({ color: "#aabbcc" });
    const context = sourceContext(builder, false); expect(context.css).toContain("font-size: 40px"); expect(context.css).toContain("#aabbcc"); expect(editor.insertBlock("divider")).toBe(true);
  });
  it("splits and inserts on every edge while retaining the source components and bounded CSS", () => {
    click("h2"); expect(editor.split("row")).toBe(true); expect(editor.insertBlock("text")).toBe(true);
    for (const edge of ["top", "right", "bottom", "left"] as const) { editor.selectStep(); editor.addEdge(edge); expect(editor.getValidation()).toEqual([]); }
    expect(builder.html).toContain('data-movcues-block-id="title_block"'); expect(builder.css).toContain("letter-spacing: -1px");
    editor.selectStep(); editor.updateCell({ responsiveStack: true }); const first = builder.css;
    editor.updateCell({ responsiveStack: false }); editor.updateCell({ responsiveStack: true }); expect(builder.css.length).toBe(first.length);
    click("h2"); editor.insertBlock("divider"); const blockId = editor.getSelectedBlock()!.id; expect(builder.css).toContain(blockId);
    expect(editor.remove()).toBe(true); expect(builder.css).not.toContain(blockId); expect(builder.html).toContain('data-movcues-block-id="title_block"');
  });
  it("preserves composed button markup through native text edits and label inspector changes", () => {
    editor.destroy(); builder.html = builder.html.replace('>Start</button>', '><span class="label">Start</span><span aria-hidden="true">→</span></button>'); open();
    click("button[data-movcues-action-id]"); const button = root.querySelector<HTMLElement>('button[data-movcues-action-id]')!;
    button.querySelector(".label")!.textContent = "Continue"; button.dispatchEvent(new Event("input", { bubbles: true })); expect(editor.flush()).toBe(true);
    expect(builder.html).toContain('<span class="label">Continue</span><span aria-hidden="true">→</span>');
    editor.updateBlock({ label: "Next" }); expect(builder.html).toContain('<span class="label">Next</span><span aria-hidden="true">→</span>');
  });
  it("edits the active breakpoint without changing base styles or accumulating overrides", () => {
    editor.destroy(); builder.css += '@media(max-width:600px){.movcues-widget .hero-title{font-size:20px}}';
    vi.stubGlobal("matchMedia", () => ({ matches: true })); open(); click("h2");
    editor.updateBlock({ fontSize: 30 }); expect(builder.css).toContain("font-size: 32px"); expect(builder.css).toContain("30px");
    const count = (builder.css.match(/font-size:/g) ?? []).length;
    for (let size = 31; size <= 35; size++) editor.updateBlock({ fontSize: size });
    expect(builder.css.match(/font-size:/g)).toHaveLength(count); expect(builder.css).toContain("font-size: 32px");
  });
  it("upgrades safe legacy identities without changing CSS, and preserves an unsupported legacy design on failure", () => {
    editor.destroy(); delete (builder.projectData.movcues as Record<string, unknown>).sourceEditabilityVersion;
    builder.html = builder.html.replace(/ data-movcues-(?:node|block)-id="[^"]+"/g, ""); const css = builder.css;
    open(); expect(builder.css).toBe(css); click("h2"); expect(editor.insertBlock("text")).toBe(true);
    editor.destroy(); delete (builder.projectData.movcues as Record<string, unknown>).sourceEditabilityVersion;
    builder.css += '.movcues-widget .hero{position:absolute}'; const original = structuredClone(builder);
    expect(() => open()).toThrow(/original source is preserved/); expect(builder).toEqual(original);
  });
  it("rejects malformed metadata and unsupported constructs before Apply", () => {
    for (const html of [sourceHtml.replace('data-movcues-block-id="body_block"', 'data-movcues-block-id="title_block"'), sourceHtml.replace('data-movcues-node-id="hero_node"', ""), sourceHtml.replace("<strong>something</strong>", '<button data-movcues-action-id="nested_button">Bad</button>')]) expect(validateSourceMarkup({ ...operation, html }, { widgetType: "modal", guide: false, editable: true }).length).toBeGreaterThan(0);
    expect(validateSourceMarkup({ ...operation, css: ".movcues-widget .hero{position:absolute}" }, { widgetType: "modal", guide: false, editable: true }).join(" ")).toContain("layout");
  });
});
