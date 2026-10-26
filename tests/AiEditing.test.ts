import { describe, expect, it } from "vitest";
import { applyEditorAiProposal, editorAiContext } from "../src/experiences/editor/AiEditing";
import { createOnsiteDocument, listBlocks } from "../src/experiences/onsite/OnsiteDocument";

describe("editor AI operations", () => {
  it("applies a multi-operation proposal atomically without mutating the source", () => {
    const source = createOnsiteDocument(); const blocks = listBlocks(source.root); const heading = blocks[0]; const button = blocks[2];
    const result = applyEditorAiProposal(source, { summary: "Improve CTA", operations: [
      { type: "update_text", blockId: heading.id, text: "Try <Movcues> today" },
      { type: "update_block", blockId: button.id, patch: { label: "Start now", radius: 12 } },
    ] });
    expect(listBlocks(source.root)[0]).not.toMatchObject({ html: "Try &lt;Movcues&gt; today" });
    expect(listBlocks(result.root)[0]).toMatchObject({ html: "Try &lt;Movcues&gt; today" });
    expect(listBlocks(result.root)[2]).toMatchObject({ label: "Start now", radius: 12 });
  });

  it("rejects the whole proposal when any operation is invalid", () => {
    const source = createOnsiteDocument(); const before = JSON.stringify(source);
    expect(() => applyEditorAiProposal(source, { summary: "Unsafe", operations: [
      { type: "update_text", blockId: listBlocks(source.root)[0].id, text: "Safe" },
      { type: "remove_cell", cellId: source.root.id },
    ] })).toThrow(/cannot be removed/);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("builds a bounded authored-data context with stable selection IDs", () => {
    const document = createOnsiteDocument(); const block = listBlocks(document.root)[0]; const cell = document.root.children![0];
    const context = editorAiContext({ experience: { id: "exp_1", name: "Welcome", widgetType: "modal", builderMode: "onsite" }, selection: { kind: "block", label: "Heading", cellId: cell.id, blockId: block.id, blockType: block.type }, document });
    expect(context.selection).toMatchObject({ blockId: block.id, cellId: cell.id });
    expect(JSON.stringify(context)).not.toMatch(/accessToken|cookie|localStorage/);
  });
});
