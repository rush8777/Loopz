import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnsiteContentEditor } from "../src/experiences/editor/OnsiteContentEditor";
import type { ExperienceContent, WidgetBuilderState } from "../src/experiences/types";

const starterHtml = '<section class="movcues-widget"><h2 data-movcues-content="heading">Welcome</h2><p data-movcues-content="body">Edit this copy</p><img src="/welcome.png" alt="Welcome"><button data-movcues-action-id="primary">Continue</button></section>';

describe("OnsiteContentEditor", () => {
  let host: HTMLElement;
  let root: ShadowRoot;
  let surface: HTMLElement;
  let builder: WidgetBuilderState;
  let content: ExperienceContent;
  let changed: ReturnType<typeof vi.fn>;
  let editor: OnsiteContentEditor;

  beforeEach(() => {
    host = document.createElement("div");
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<article><div data-movcues-builder-surface>${starterHtml}</div></article>`;
    surface = root.querySelector("[data-movcues-builder-surface]")!;
    document.body.appendChild(host);
    builder = { version: 1, projectData: {}, html: starterHtml, css: ".movcues-widget{color:#111}" };
    content = { heading: "Welcome", body: "Edit this copy", primaryAction: { label: "Continue", type: "dismiss" } };
    changed = vi.fn();
    editor = new OnsiteContentEditor(root, builder, content, { onChange: changed, onSelectionChange: vi.fn() });
    expect(editor.start()).toBe(true);
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = "";
  });

  it("edits text in place and serializes only the authored surface", () => {
    const heading = surface.querySelector<HTMLElement>('[data-movcues-content="heading"]')!;
    heading.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true }));
    heading.innerHTML = "A <strong>better</strong> welcome";
    heading.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));

    expect(content.heading).toBe("A better welcome");
    expect(builder.html).toContain("<strong>better</strong>");
    expect(builder.html).not.toContain("contenteditable");
    expect(builder.html).not.toContain("movcues-authoring-outline");
    expect(builder.projectData).toMatchObject({ movcues: { authoringSurface: "onsite", schemaVersion: 1 } });
    expect(changed).toHaveBeenCalled();
  });

  it("applies safe image changes and keeps a bounded undo history", () => {
    const image = surface.querySelector<HTMLImageElement>("img")!;
    image.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(editor.updateImage("javascript:alert(1)", "Unsafe")).toBe(false);
    expect(editor.updateImage("https://cdn.example.com/hero.webp", "Product tour")).toBe(true);
    expect(builder.html).toContain('src="https://cdn.example.com/hero.webp"');
    expect(builder.html).toContain('alt="Product tour"');

    for (let index = 0; index < 60; index += 1)
      editor.updateImage(`/image-${index}.png`, `Image ${index}`);
    expect(editor.canUndo()).toBe(true);
    let undoCount = 0;
    while (editor.undo()) undoCount += 1;
    expect(undoCount).toBeLessThanOrEqual(49);
    expect(editor.canRedo()).toBe(true);
  });

  it("does not accumulate authoring nodes or delegated handlers across sessions", () => {
    editor.destroy();
    changed.mockClear();
    for (let index = 0; index < 20; index += 1) {
      const session = new OnsiteContentEditor(root, builder, content, {
        onChange: changed,
        onSelectionChange: vi.fn(),
      });
      expect(session.start()).toBe(true);
      expect(root.querySelectorAll("[data-movcues-authoring-outline]")).toHaveLength(1);
      session.destroy();
      expect(root.querySelectorAll("[data-movcues-authoring-outline],[data-movcues-authoring-style]")).toHaveLength(0);
    }
    surface.querySelector("h2")!.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    expect(changed).not.toHaveBeenCalled();
  });

});
