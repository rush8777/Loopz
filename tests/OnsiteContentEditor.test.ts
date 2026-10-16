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

    editor.flush();
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

  function edit(marker = "heading") {
    const element = surface.querySelector<HTMLElement>(`[data-movcues-content="${marker}"]`)!;
    element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true })); return element;
  }
  function type(element: HTMLElement, value: string) {
    element.innerHTML = value; element.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  }
  it("keeps edit mode and native click/double-click selection inside active text", () => {
    const heading = edit();
    const click = new MouseEvent("click", { bubbles: true, composed: true, cancelable: true }); heading.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false); expect(heading.getAttribute("contenteditable")).toBe("true");
    const double = new MouseEvent("dblclick", { bubbles: true, composed: true, cancelable: true }); heading.dispatchEvent(double);
    expect(double.defaultPrevented).toBe(false); expect(heading).toBe(surface.querySelector("h2"));
  });
  it("defers composition commits and ignores Enter/Escape until composition ends", () => {
    const heading = edit(); heading.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    type(heading, "日本"); heading.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
    expect(editor.flush()).toBe(false); expect(content.heading).toBe("Welcome");
    heading.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    expect(content.heading).toBe("日本"); expect(editor.flush()).toBe(true);
  });
  it("updates empty/oversized projections without truncation and validates before save", () => {
    const heading = edit(); type(heading, "   "); editor.flush();
    expect(content.heading).toBe(""); expect(editor.getValidation().join()).toContain("heading: enter text");
    type(heading, "x".repeat(161)); editor.flush();
    expect(content.heading).toHaveLength(161); expect(editor.getValidation().join()).toContain("160 characters");
    const body = edit("body"); type(body, "First<br>Second<ul><li><strong>Third</strong></li><li>Fourth</li></ul>"); editor.flush();
    expect(content.body).toBe("First\nSecond\nThird\nFourth");
    expect(builder.html).toContain("<strong>Third</strong>");
  });
  it("restores HTML, structured fields, editing and image attributes through undo/redo", () => {
    const heading = edit(); type(heading, ""); editor.flush();
    expect(content.heading).toBe(""); expect(editor.undo()).toBe(true); expect(content.heading).toBe("Welcome");
    expect(surface.querySelector("h2")!.getAttribute("contenteditable")).toBe("true");
    expect(editor.redo()).toBe(true); expect(content.heading).toBe("");
    editor.undo(); const image = surface.querySelector<HTMLImageElement>("img")!; image.click(); editor.updateImage("/new.png", "New");
    editor.undo(); expect(surface.querySelector("img")!.getAttribute("src")).toBe("/welcome.png");
    expect(content.primaryAction).toEqual({ label: "Continue", type: "dismiss" });
  });
  it("coalesces rapid typing without serializing/remounting the widget per key", () => {
    const heading = edit();
    for (let i = 1; i <= 100; i++) type(heading, "x".repeat(i));
    expect(builder.html).toBe(starterHtml); expect(surface.querySelector("h2")).toBe(heading);
    expect(editor.canUndo()).toBe(true); editor.flush(); editor.undo(); expect(content.heading).toBe("Welcome");
    expect(editor.canUndo()).toBe(false);
  });
  it("blocks native HTML drops and removes hostile input markup before serialization", () => {
    const body = edit("body"); const drop = new Event("drop", { bubbles: true, cancelable: true }); body.dispatchEvent(drop); expect(drop.defaultPrevented).toBe(true);
    type(body, '<img src="javascript:alert(1)" onerror="alert(1)"><a href="jav&#x61;script:alert(1)" target="_blank">Unsafe</a><iframe src="/bad"></iframe><span contenteditable="true" onclick="evil()">Safe</span>');
    editor.flush(); expect(builder.html).not.toMatch(/onerror|onclick|javascript:|iframe|contenteditable/);
    expect(body.innerHTML).not.toMatch(/onerror|onclick|javascript:|iframe|contenteditable/);
  });
  it("limits list/link/alignment operations on buttons and preserves action configuration", () => {
    const button = surface.querySelector<HTMLButtonElement>("button")!; button.click(); editor.editSelected(); editor.toggleList("ul"); editor.setAlignment("right");
    expect(button.querySelector("ul")).toBeNull(); expect(button.className).not.toContain("movcues-align"); expect(editor.applyLink("/path")).toBe(false);
    type(button, "<strong>Done</strong>"); editor.flush(); expect(content.primaryAction).toEqual({ label: "Done", type: "dismiss" });
  });
  it("preserves inline markup across list conversion, undo and redo", () => {
    const body = edit("body"); type(body, "<strong>One</strong><br><em>Two</em>"); editor.flush(); editor.toggleList("ul");
    expect(surface.querySelector("li strong")?.textContent).toBe("One"); expect(content.body).toBe("One\nTwo");
    editor.undo(); expect(surface.querySelector("[data-movcues-content=body]")!.innerHTML).toContain("<br>");
    editor.redo(); expect(surface.querySelector("li em")?.textContent).toBe("Two");
  });

  it("supports keyboard-only component selection and strips temporary tab stops", () => {
    const heading = surface.querySelector<HTMLElement>("h2")!; expect(heading.tabIndex).toBe(0); heading.focus();
    heading.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); expect(heading.getAttribute("contenteditable")).toBe("true");
    type(heading, "Keyboard text"); editor.flush(); expect(builder.html).not.toMatch(/tabindex|contenteditable/);
    heading.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(heading.hasAttribute("contenteditable")).toBe(false);
    editor.destroy(); expect(heading.hasAttribute("tabindex")).toBe(false);
  });

});
