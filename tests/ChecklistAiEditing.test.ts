import { describe, expect, it } from "vitest";
import fixture from "./fixtures/checklist-v4.json";
import { applyChecklistAiProposal, checklistAiContext } from "../src/experiences/editor/ChecklistAiEditing";
import { applyOnsiteDocument, listBlocks, onsiteDocumentFromBuilder, validateOnsiteChecklistDocument, type OnsiteDocument } from "../src/experiences/onsite/OnsiteDocument";
import type { EditorChecklistDefinition, EditorDraft, WidgetBuilderState } from "../src/experiences/types";

const references: NonNullable<EditorDraft["references"]> = { guides: [{ id: "guide_live", name: "Product tour", status: "published" }, { id: "guide_draft", name: "Draft tour", status: "draft" }], segments: [{ id: "segment_active", name: "Activated" }] };
function source(): EditorChecklistDefinition { const f = structuredClone(fixture), builder: WidgetBuilderState = { version: 1, projectData: {}, html: "", css: "" }, definition = { ...f.definition, targeting: { pageRules: [], audience: { type: "all" }, priority: 0 }, builder } as EditorChecklistDefinition; applyOnsiteDocument(builder, f.document as OnsiteDocument, "checklist", undefined, definition); return definition; }

describe("Checklist AI editing", () => {
  it("creates, duplicates, reorders and removes canonical tasks with synchronized visual references", () => {
    const original = source(), result = applyChecklistAiProposal(original, { summary: "Improve tasks", operations: [
      { type: "add_checklist_task", afterItemId: "item_one", item: { title: "Invite teammates", action: { type: "navigate", url: "/settings/team" }, completion: { type: "item_clicked" } } },
      { type: "duplicate_checklist_task", itemId: "item_two" }, { type: "move_checklist_task", itemId: "item_three", beforeItemId: "item_one" }, { type: "remove_checklist_task", itemId: "item_two" },
    ] }, references), document = onsiteDocumentFromBuilder(result.definition.builder)!;
    expect(original.items.map(item => item.id)).toEqual(["item_one", "item_two", "item_three"]); expect(result.definition.items).toHaveLength(4); expect(new Set(result.definition.items.map(item => item.id)).size).toBe(4); expect(result.order[0]).toBe("item_three");
    expect(validateOnsiteChecklistDocument(document, result.definition)).toEqual([]); expect(listBlocks(document.root).filter(block => block.type === "checklist_task").map(block => block.type === "checklist_task" && block.itemId)).toEqual(result.order);
  });

  it("keeps actions and completion independent and resolves only real site resources", () => {
    const result = applyChecklistAiProposal(source(), { summary: "Connect resources", operations: [
      { type: "update_checklist_task_action", itemId: "item_one", action: { type: "launch_guide", experienceId: "guide_live" } },
      { type: "update_checklist_task_completion", itemId: "item_one", completion: { type: "segment", segmentId: "segment_active" } },
      { type: "update_checklist_task_action", itemId: "item_two", action: { type: "launch_guide", experienceId: "guide_draft" } },
      { type: "update_checklist_task_completion", itemId: "item_two", completion: { type: "guide_completed", experienceId: "guide_draft" } },
    ] }, references);
    expect(result.definition.items[0]).toMatchObject({ action: { type: "launch_guide", experienceId: "guide_live" }, completion: { type: "segment", segmentId: "segment_active" } }); expect(result.warnings.join(" ")).toMatch(/not published/);
    expect(() => applyChecklistAiProposal(source(), { summary: "Invent", operations: [{ type: "update_checklist_task_completion", itemId: "item_one", completion: { type: "segment", segmentId: "made_up" } }] }, references)).toThrow(/Unknown site Segment/);
  });

  it("updates behavior, all three visual states, completion copy and protected styles atomically", () => {
    const current = source(), document = onsiteDocumentFromBuilder(current.builder)!, launcher = listBlocks(document.root).find(block => block.type === "checklist_text" && block.role === "launcher-label")!;
    const result = applyChecklistAiProposal(current, { summary: "Restyle", operations: [{ type: "update_checklist_behavior", patch: { order: "sequential", position: "bottom-left", initialState: "collapsed" } }, { type: "update_checklist_completion_message", patch: { title: "You're all set!", acknowledgeLabel: "Celebrate" } }, { type: "update_checklist_visual_state", view: "expanded", width: 420 }, { type: "update_checklist_visual_state", view: "launcher", width: 180 }, { type: "update_checklist_visual_state", view: "completion", width: 380 }, { type: "update_checklist_style", blockId: launcher.id, patch: { text: "2 steps left", fontSize: 12, color: "#334455" } }] }, references), next = onsiteDocumentFromBuilder(result.definition.builder)!;
    expect(result.definition.behavior).toMatchObject({ order: "sequential", position: "bottom-left", initialState: "collapsed" }); expect(result.definition.completionMessage).toMatchObject({ title: "You're all set!", acknowledgeLabel: "Celebrate" }); expect(next.root.children!.map(cell => cell.checklistWidth)).toEqual([420, 180, 380]); expect(validateOnsiteChecklistDocument(next, result.definition)).toEqual([]);
  });

  it("rolls the complete proposal back when a protected structure or final task would become invalid", () => {
    const current = source(), before = JSON.stringify(current), document = onsiteDocumentFromBuilder(current.builder)!;
    expect(() => applyChecklistAiProposal(current, { summary: "Unsafe", operations: [{ type: "update_checklist_task", itemId: "item_one", patch: { title: "Changed" } }, { type: "remove_cell", cellId: document.root.children![0].id }] }, references)).toThrow(); expect(JSON.stringify(current)).toBe(before);
    expect(() => applyChecklistAiProposal(current, { summary: "Empty", operations: [{ type: "remove_checklist_task", itemId: "item_one" }, { type: "remove_checklist_task", itemId: "item_two" }, { type: "remove_checklist_task", itemId: "item_three" }] }, references)).toThrow(/final Checklist task/);
  });

  it("extracts bounded authored context, current view, selection and verified resources", () => {
    const current = source(), document = onsiteDocumentFromBuilder(current.builder)!, task = listBlocks(document.root).find(block => block.type === "checklist_task")!, context = checklistAiContext({ experience: { id: "checklist_1", name: "Onboarding", builderMode: "onsite" }, revision: 7, checklist: current, references, currentView: "launcher", selection: { kind: "block", label: "Task", cellId: "cell", blockId: task.id, blockType: task.type } });
    expect(context).toMatchObject({ revision: 7, currentView: "launcher", selectedItemId: "item_one", checklist: { totalTasks: 3 } }); expect((context.resources as { guides: unknown[] }).guides).toHaveLength(2); expect(JSON.stringify(context)).not.toMatch(/visitor|cookie|localStorage|primarySelector|fallbackSelectors|accessToken/);
  });
});
