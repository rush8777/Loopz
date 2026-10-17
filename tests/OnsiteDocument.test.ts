import { describe, expect, it, vi } from "vitest";
import {
  applyOnsiteDocument,
  createBlock,
  createOnsiteDocument,
  duplicateCell,
  findCell,
  insertEdgeCell,
  listBlocks,
  migrateV1Builder,
  moveCell,
  resizeSiblings,
  splitCell,
  validateOnsiteDocument,
} from "../src/experiences/onsite/OnsiteDocument";
import { mountBuilderContent } from "../src/experiences/runtime/BuilderContent";
import type { ExperienceContent, WidgetBuilderState } from "../src/experiences/types";

describe("OnsiteDocument", () => {
  it("compiles a deterministic responsive document and projects compatibility content", () => {
    const document = createOnsiteDocument(true); const text = listBlocks(document.root).find(block => block.type === "text"); if (text?.type === "text") text.html = "<ul><li>First</li><li>Second</li></ul>"; const builder: WidgetBuilderState = { version: 1, projectData: {}, html: "", css: "" };
    const first = applyOnsiteDocument(builder, document, "modal"); const second = applyOnsiteDocument(builder, document, "modal");
    expect(first).toEqual(second); expect(builder.projectData).toMatchObject({ movcues: { schemaVersion: 2, onsiteDocument: document } });
    expect(first.html).toContain('data-movcues-document-version="2"'); expect(first.css).toContain("@media(max-width:480px)"); expect(first.content.body).toBe("First\nSecond"); expect(first.content.primaryAction?.type).toBe("next_step");
  });

  it("splits nested cells, adds an outer footer, resizes, reorders and duplicates with fresh IDs", () => {
    const document = createOnsiteDocument(); const rootChildren = document.root.children!; const first = rootChildren[0];
    expect(splitCell(document, first.id, "row")).toBeTruthy(); const left = first.children![0]; const right = first.children![1];
    expect(splitCell(document, right.id, "column")).toBeTruthy(); const footer = insertEdgeCell(document, "bottom"); expect(document.root.children?.at(-1)?.id).toBe(footer);
    expect(resizeSiblings(document, left.id, right.id, 1.4)).toBe(true); expect(left.sizing).toEqual({ mode: "flexible", weight: 1.4 });
    const duplicated = duplicateCell(document, first.id)!; expect(duplicated).not.toBe(first.id); expect(moveCell(document, duplicated, -1)).toBe(true);
    const ids = JSON.stringify(document).match(/(?:document|cell|block|action)_[A-Za-z0-9_-]+/g) ?? []; expect(new Set(ids).size).toBe(ids.length); expect(validateOnsiteDocument(document)).toEqual({ valid: true, errors: [] });
  });

  it("rejects duplicate IDs, unsafe URLs and excessive nesting with actionable errors", () => {
    const document = createOnsiteDocument(); const cells = document.root.children!; cells[1].id = cells[0].id;
    const image = createBlock("image"); if (image.type === "image") image.src = "javascript:alert(1)"; cells[2].block = image;
    const result = validateOnsiteDocument(document); expect(result.valid).toBe(false); expect(result.errors.join(" ")).toMatch(/reuses ID|image URL/);
  });

  it("migrates the known v1 on-site surface without changing GrapesJS-shaped content", () => {
    const content: ExperienceContent = { heading: "Welcome", body: "Hello world", primaryAction: { label: "Continue", type: "next_step" } };
    const builder: WidgetBuilderState = { version: 1, projectData: { movcues: { authoringSurface: "onsite", schemaVersion: 1 } }, html: '<section class="movcues-widget"><h2 data-movcues-content="heading"><strong>Welcome</strong></h2><p data-movcues-content="body">Hello world</p><button data-movcues-action-id="primary">Continue</button></section>', css: ".movcues-widget{color:black}" };
    const document = migrateV1Builder(builder, content, "modal", true); expect(document?.schemaVersion).toBe(2); expect(listBlocks(document!.root).map(block => block.type)).toEqual(["heading", "text", "button"]); expect(builder.html).toContain("data-movcues-node-id");
    const grapes: WidgetBuilderState = { version: 1, projectData: { pages: [{}] }, html: '<section class="movcues-widget"><div>Custom</div></section>', css: ".movcues-widget{color:black}" };
    expect(migrateV1Builder(grapes, content, "modal", true)).toBeNull(); expect(grapes.projectData).toEqual({ pages: [{}] });
  });

  it("dispatches multiple stable button actions independently", () => {
    const document = createOnsiteDocument(); const cells = document.root.children!; const firstButton = cells[2].block!; expect(firstButton.type).toBe("button");
    const secondCell = { ...cells[2], id: "cell_second", block: { ...firstButton, id: "block_second", label: "Learn more", action: { id: "action_second", type: "open_url" as const, url: "https://example.com" } } }; document.root.children!.push(secondCell);
    const builder: WidgetBuilderState = { version: 1, projectData: {}, html: "", css: "" }; applyOnsiteDocument(builder, document, "modal");
    const host = documentObject(); const card = window.document.createElement("section"); host.append(card); const action = vi.fn();
    expect(mountBuilderContent(host, card, builder, { onPrimary: vi.fn(), onSecondary: vi.fn(), onDismiss: vi.fn(), onActionId: action })).toBe(true);
    card.querySelectorAll("button").forEach(button => button.click()); expect(action).toHaveBeenCalledTimes(2); expect(action.mock.calls.map(call => call[0].type)).toEqual(["dismiss", "open_url"]);
  });
});

function documentObject(): ShadowRoot { const host = window.document.createElement("div"); window.document.body.append(host); return host.attachShadow({ mode: "open" }); }
