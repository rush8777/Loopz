import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnsiteCompositionEditor } from "../src/experiences/editor/OnsiteCompositionEditor";
import { applyOnsiteDocument, createOnsiteDocument, emptyCell, listBlocks, onsiteDocumentFromBuilder, validateOnsiteDocument } from "../src/experiences/onsite/OnsiteDocument";
import type { ExperienceContent, WidgetBuilderState } from "../src/experiences/types";

describe("directional on-site insertion", () => {
  let editor: OnsiteCompositionEditor;
  let root: ShadowRoot;
  let builder: WidgetBuilderState;
  let content: ExperienceContent;
  const changed = vi.fn();
  const validation = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-movcues-composition-toolbar")) return new DOMRect(0, 0, 240, 36);
      if (this.hasAttribute("data-movcues-block-palette")) return new DOMRect(0, 0, 180, 180);
      if (this.matches(".movcues-widget")) return new DOMRect(260, 100, 500, 400);
      return new DOMRect(280, 120, 460, 80);
    });
    const host = document.createElement("div"); document.body.append(host); root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<style data-movcues-builder-style></style><div data-movcues-builder-surface></div>';
    builder = { version: 1, projectData: {}, html: "", css: "" };
    content = applyOnsiteDocument(builder, createOnsiteDocument(), "modal").content;
    editor = new OnsiteCompositionEditor(root, builder, content, "modal", false, { onChange: changed, onValidation: validation, onSelectionChange: vi.fn() });
    editor.start(); changed.mockClear(); validation.mockClear(); root.querySelector<HTMLElement>("h2")!.click();
  });

  afterEach(() => { editor.destroy(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const click = (selector: string) => root.querySelector<HTMLElement>(selector)!.click();

  it("shows four small edge controls and inserts a horizontal neighbour in one undoable transaction", () => {
    const original = JSON.stringify(editor.getDocument()); const footerId = editor.getDocument().root.children![1].id;
    expect(root.querySelectorAll("[data-movcues-insert-edge]")).toHaveLength(4);
    click('[data-movcues-insert-edge="left"]');
    expect(root.querySelector('[data-movcues-insert-edge="left"]')?.getAttribute("aria-expanded")).toBe("true");
    click('[data-insert-block="text"]');
    const row = editor.getDocument().root.children![0];
    expect(row.direction).toBe("row"); expect(row.children!.map(cell => cell.block?.type)).toEqual(["text", "heading"]);
    expect(editor.getDocument().root.children![1].id).toBe(footerId);
    expect(editor.getSelection()).toMatchObject({ kind: "block", blockType: "text" }); expect(changed).toHaveBeenCalledTimes(1);
    expect(root.querySelector("[data-movcues-block-palette]")).toHaveProperty("hidden", true);
    expect(builder.html).not.toMatch(/movcues-insert-edge|insertion-edge|contenteditable|tabindex/);
    const inserted = JSON.stringify(editor.getDocument()); editor.undo(); expect(JSON.stringify(editor.getDocument())).toBe(original);
    editor.redo(); expect(JSON.stringify(editor.getDocument())).toBe(inserted);
    expect(onsiteDocumentFromBuilder(builder)).toEqual(editor.getDocument()); expect(validateOnsiteDocument(editor.getDocument()).valid).toBe(true);
  });

  it("can resize immediately after adding on the right, and reloads the same nested structure", () => {
    click('[data-movcues-insert-edge="right"]'); click('[data-insert-block="button"]');
    const row = editor.getDocument().root.children![0];
    const handle = root.querySelector<HTMLButtonElement>('[data-movcues-resize-handle="row"]')!;
    expect(handle).toBeTruthy(); handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(editor.getDocument().root.children![0].children![0].sizing).toEqual({ mode: "flexible", weight: 1.1 });
    editor.flush(); const saved = structuredClone(builder); const ids = row.children!.map(cell => cell.id);
    editor.destroy(); builder = saved;
    editor = new OnsiteCompositionEditor(root, builder, content, "modal", false, { onChange: changed, onValidation: validation, onSelectionChange: vi.fn() }); editor.start();
    expect(editor.getDocument().root.children![0].children!.map(cell => cell.id)).toEqual(ids);
    expect(listBlocks(editor.getDocument().root).filter(block => block.type === "button")).toHaveLength(2);
  });

  it("cancels the chooser with Escape or an outside click without editing the document", () => {
    const original = JSON.stringify(editor.getDocument()); click('[data-movcues-insert-edge="top"]');
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.activeElement).toBe(root.querySelector('[data-movcues-insert-edge="top"]'));
    click('[data-movcues-insert-edge="bottom"]'); document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    expect(root.querySelector("[data-movcues-block-palette]")).toHaveProperty("hidden", true);
    expect(JSON.stringify(editor.getDocument())).toBe(original); expect(changed).not.toHaveBeenCalled();
  });

  it("rejects an insertion past the depth limit without changing the tree or saving a partial layout", () => {
    const doc = editor.getDocument(); let nested = doc.root.children![0];
    for (let i = 0; i < 6; i++) nested = { ...emptyCell(), children: [nested] };
    doc.root.children![0] = nested; expect(editor.flush()).toBe(true);
    const original = JSON.stringify(doc);
    click('[data-movcues-insert-edge="left"]'); click('[data-insert-block="text"]');
    expect(JSON.stringify(editor.getDocument())).toBe(original); expect(changed).not.toHaveBeenCalled();
    expect(validation.mock.calls.at(-1)?.[0].join(" ")).toContain("maximum nesting depth");
    expect(onsiteDocumentFromBuilder(builder)).toEqual(doc);
  });

  it("anchors the toolbar outside the entire widget even when an interior block is selected", () => {
    const toolbar = root.querySelector<HTMLElement>("[data-movcues-composition-toolbar]")!;
    expect(toolbar.style.transform).toBe("translate(260px,510px)");
    root.querySelector<HTMLElement>('[data-movcues-content="body"]')!.click();
    expect(toolbar.style.transform).toBe("translate(260px,510px)");
    editor.destroy(); expect(root.querySelectorAll("[data-movcues-insert-edge],[data-movcues-composition-toolbar],[data-movcues-block-palette]")).toHaveLength(0);
  });
});
