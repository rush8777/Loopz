import { describe, expect, it } from "vitest";
import fixture from "./fixtures/checklist-v4.json";
import { applyChecklistAiProposal, checklistAiContext } from "../src/experiences/editor/ChecklistAiEditing";
import { applyOnsiteDocument, listBlocks, onsiteDocumentFromBuilder, validateOnsiteChecklistDocument, type OnsiteDocument } from "../src/experiences/onsite/OnsiteDocument";
import type { EditorChecklistDefinition, EditorDraft, WidgetBuilderState } from "../src/experiences/types";

const references: NonNullable<EditorDraft["references"]> = { guides: [{ id: "guide_live", name: "Product tour", status: "published" }, { id: "guide_draft", name: "Draft tour", status: "draft" }], segments: [{ id: "segment_active", name: "Activated" }] };
function source(): EditorChecklistDefinition { const f = structuredClone(fixture), builder: WidgetBuilderState = { version: 1, projectData: {}, html: "", css: "" }, definition = { ...f.definition, targeting: { pageRules: [], audience: { type: "all" }, priority: 0 }, builder } as EditorChecklistDefinition; applyOnsiteDocument(builder, f.document as OnsiteDocument, "checklist", undefined, definition); return definition; }

describe("Checklist AI editing", () => {
  it("generates a complete five-task Checklist with fresh IDs and synchronized task blocks", () => {
    const tasks = ["Create a workspace", "Invite teammates", "Create a project", "Take the product tour", "Ship the first update"].map((title, index) => ({ title, description: `Step ${index + 1}`, action: { type: "navigate" as const, url: `/setup/${index + 1}` }, completion: { type: "item_clicked" as const } }));
    const result = applyChecklistAiProposal(source(), { summary: "Generate onboarding", operations: [{ type: "generate_checklist", title: "Launch your workspace", description: "Five quick steps", items: tasks }] }, references), document = onsiteDocumentFromBuilder(result.definition.builder)!;
    expect(result.definition).toMatchObject({ title: "Launch your workspace", description: "Five quick steps" }); expect(result.definition.items.map(item => item.title)).toEqual(tasks.map(item => item.title)); expect(result.definition.items).toHaveLength(5); expect(result.definition.items.some(item => ["item_one", "item_two", "item_three"].includes(item.id))).toBe(false); expect(new Set(result.definition.items.map(item => item.id)).size).toBe(5); expect(validateOnsiteChecklistDocument(document, result.definition)).toEqual([]);
  });

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

  it("redesigns every Checklist state while preserving protected tasks, controls and runtime references", () => {
    const original = source(), ids = original.items.map(item => item.id), result = applyChecklistAiProposal(original, { summary: "Premium redesign", operations: [{ type: "redesign_checklist_views", design: { views: { expanded: { width: 440, gap: 14, padding: { top: 24, right: 24, bottom: 24, left: 24 }, style: { background: "#ffffff", borderColor: "#dbeafe", borderWidth: 1, borderRadius: 20 }, before: [{ type: "icon", icon: "rocket", size: 32, color: "#2563eb", align: "center" }] }, launcher: { width: 210, gap: 8, padding: { top: 12, right: 14, bottom: 12, left: 14 }, style: { background: "#eff6ff", borderRadius: 18 }, before: [{ type: "icon", icon: "sparkles", size: 18, color: "#2563eb" }] }, completion: { width: 400, gap: 12, padding: { top: 28, right: 24, bottom: 28, left: 24 }, style: { background: "#f0fdf4", borderColor: "#86efac", borderWidth: 1, borderRadius: 20 }, before: [{ type: "icon", icon: "star", size: 36, color: "#16a34a", align: "center" }] } }, title: { fontSize: 24, color: "#0f172a", align: "center" }, description: { color: "#64748b", align: "center" }, task: { fontSize: 15, color: "#1e293b", indicator: "rocket" }, progress: { color: "#2563eb" }, completionTitle: { fontSize: 24, color: "#166534", align: "center" }, control: { color: "#2563eb" }, items: { gap: 10 } } }] }, references), document = onsiteDocumentFromBuilder(result.definition.builder)!;
    expect(result.definition.items.map(item => item.id)).toEqual(ids); expect(document.root.children!.map(view => view.checklistWidth)).toEqual([440, 210, 400]); expect(listBlocks(document.root).filter(block => block.type === "checklist_task").every(block => block.type === "checklist_task" && block.indicator === "rocket")).toBe(true); expect(listBlocks(document.root).filter(block => block.type === "icon")).toHaveLength(3); expect(validateOnsiteChecklistDocument(document, result.definition)).toEqual([]);
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
