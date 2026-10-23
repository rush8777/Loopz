import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnsiteCompositionEditor } from "../src/experiences/editor/OnsiteCompositionEditor";
import { applyOnsiteDocument, createOnsiteDocument, emptyCell, listBlocks, onsiteDocumentFromBuilder, validateOnsiteDocument } from "../src/experiences/onsite/OnsiteDocument";
import type { ExperienceContent, WidgetBuilderState } from "../src/experiences/types";
import * as imageFiles from "../src/experiences/editor/ImageFile";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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

  it("undoes immediate typing and preserves it when a structural operation follows", () => {
    const heading = root.querySelector<HTMLElement>("h2")!; const original = heading.textContent;
    heading.textContent = "Latest typing"; heading.dispatchEvent(new Event("input", { bubbles: true }));
    expect(editor.canUndo()).toBe(true); editor.undo(); expect(root.querySelector("h2")!.textContent).toBe(original);
    editor.redo(); expect(root.querySelector("h2")!.textContent).toBe("Latest typing");
    root.querySelector<HTMLElement>("h2")!.click(); editor.split("row"); editor.undo(); expect(root.querySelector("h2")!.textContent).toBe("Latest typing");
    editor.undo(); expect(root.querySelector("h2")!.textContent).toBe(original);
  });

  it("moves a subtree between parents without changing IDs, with one undo and no cycles", () => {
    editor.split("row"); const doc = editor.getDocument(); const row = doc.root.children![0]; const source = row.children![0]; const target = doc.root.children![1];
    const ids = listBlocks(source).map(block => block.id); const original = JSON.stringify(doc); changed.mockClear();
    expect(editor.moveTo(target.id, false, row.id)).toBe(true);
    expect(editor.getDocument().root.children!.map(cell => cell.id)).toEqual([target.id, row.id, doc.root.children![2].id]); expect(listBlocks(editor.getDocument().root).map(block => block.id)).toEqual(expect.arrayContaining(ids));
    expect(changed).toHaveBeenCalledTimes(1); editor.undo(); expect(JSON.stringify(editor.getDocument())).toBe(original); editor.redo();
    const moved = JSON.stringify(editor.getDocument()); expect(editor.moveTo(source.id, false, row.id)).toBe(false); expect(JSON.stringify(editor.getDocument())).toBe(moved);
    expect(validateOnsiteDocument(editor.getDocument()).valid).toBe(true);
  });

  it("exposes an insertion prompt on empty cells without saving editor markup", () => {
    editor.split("row"); const add = root.querySelector<HTMLButtonElement>("[data-movcues-empty-cell]")!;
    expect(add.textContent).toBe("+ Add content"); add.click(); click('[data-insert-block="text"]');
    expect(root.querySelector("[data-movcues-empty-cell]")).toBeNull(); expect(builder.html).not.toContain("Add content"); expect(builder.html).not.toContain("tabindex");
  });

  it("cancels an unfinished resize on destruction without saving a late change", () => {
    editor.split("row"); const original = JSON.stringify(editor.getDocument()); changed.mockClear();
    const handle = root.querySelector<HTMLButtonElement>('[data-movcues-resize-handle="row"]')!;
    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 300, clientY: 150 }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 370, clientY: 150 }));
    editor.destroy(); window.dispatchEvent(new MouseEvent("pointerup"));
    expect(changed).not.toHaveBeenCalled(); expect(JSON.stringify(editor.getDocument())).toBe(original);
  });

  it("keeps keyboard resize focused and avoids recompiling unchanged documents", () => {
    editor.split("row"); const handle = root.querySelector<HTMLButtonElement>('[data-movcues-resize-handle="row"]')!; handle.focus();
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(root.activeElement).toBe(root.querySelector('[data-movcues-resize-handle="row"]'));
    const project = builder.projectData; expect(editor.flush()).toBe(true); expect(editor.flush()).toBe(true); expect(builder.projectData).toBe(project);
  });

  it("rejects an over-deep split and protects in-progress IME input from structural edits", () => {
    const doc = editor.getDocument(); let nested = doc.root.children![0];
    for (let index = 0; index < 6; index++) nested = { ...emptyCell(), children: [nested] };
    doc.root.children![0] = nested; editor.flush(); const original = JSON.stringify(doc); changed.mockClear();
    editor.split("row"); expect(JSON.stringify(editor.getDocument())).toBe(original); expect(changed).not.toHaveBeenCalled();
    expect(validation.mock.calls.at(-1)?.[0].join(" ")).toContain("maximum nesting depth");
    const heading = root.querySelector<HTMLElement>("h2")!; heading.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    expect(editor.insertBlock("image")).toBe(false); expect(editor.split("column")).toBe(false); expect(JSON.stringify(editor.getDocument())).toBe(original);
    heading.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });

  it("keeps invalid long text intact, blocks structural writes and can undo safely", () => {
    const heading = root.querySelector<HTMLElement>("h2")!; const original = heading.textContent;
    heading.textContent = "a".repeat(10001); heading.dispatchEvent(new Event("input", { bubbles: true })); changed.mockClear();
    expect(editor.split("row")).toBe(false); expect(changed).not.toHaveBeenCalled(); expect(heading.textContent).toHaveLength(10001);
    editor.undo(); expect(root.querySelector("h2")!.textContent).toBe(original); expect(editor.canRedo()).toBe(false);
  });

  it("shows an empty image as a clickable placeholder and replaces it with one saved, undoable image", async () => {
    editor.insertBlock("image"); const placeholder = root.querySelector<HTMLButtonElement>("[data-movcues-image-placeholder]")!;
    expect(placeholder.textContent).toContain("Drop an image or click to browse");
    expect(builder.html).not.toContain("placeholder"); expect(builder.html).toContain('src=""');
    const choose = vi.spyOn(root.querySelector<HTMLInputElement>("[data-movcues-image-file]")!, "click"); placeholder.click(); expect(choose).toHaveBeenCalledTimes(1);
    vi.spyOn(imageFiles, "prepareImageFile").mockResolvedValue(PNG); changed.mockClear();
    expect(await editor.setImageFile(new File(["image"], "photo.png", { type: "image/png" }))).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1); expect(root.querySelector("[data-movcues-image-placeholder]")).toBeNull();
    expect(root.querySelector("img")?.getAttribute("src")).toBe(PNG); expect(builder.html).toContain(PNG);
    editor.undo(); expect(root.querySelector("[data-movcues-image-placeholder]")).toBeTruthy();
    editor.redo(); expect(root.querySelector("img")?.getAttribute("src")).toBe(PNG);
    expect(onsiteDocumentFromBuilder(builder)).toEqual(editor.getDocument());
  });

  it("keeps the previous image after a bad file or invalid local path and ignores a late result after destruction", async () => {
    editor.insertBlock("image"); editor.setImageSource("https://example.com/photo.png"); changed.mockClear();
    vi.spyOn(imageFiles, "prepareImageFile").mockRejectedValueOnce(new Error("Choose a PNG, JPG or WebP image."));
    expect(await editor.setImageFile(new File(["bad"], "image.svg", { type: "image/svg+xml" }))).toBe(false);
    expect(editor.setImageSource("C:\\Pictures\\photo.png")).toBe(false);
    expect(root.querySelector("img")?.getAttribute("src")).toBe("https://example.com/photo.png"); expect(changed).not.toHaveBeenCalled();
    let resolve!: (src: string) => void;
    vi.mocked(imageFiles.prepareImageFile).mockImplementationOnce(() => new Promise<string>(done => { resolve = done; }));
    const pending = editor.setImageFile(new File(["image"], "photo.png", { type: "image/png" }));
    editor.destroy(); resolve(PNG); expect(await pending).toBe(false); expect(changed).not.toHaveBeenCalled();
  });

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
