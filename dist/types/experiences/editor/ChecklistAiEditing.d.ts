import type { CompositionSelection } from "./OnsiteCompositionEditor";
import { type EditorAiOperation, type EditorAiProposal, type UiCellDesign, type UiLayoutNode } from "./AiEditing";
import type { ChecklistItem, EditorChecklistDefinition, EditorDraft } from "../types";
import type { ChecklistView } from "../checklist/ChecklistMarkup";
export type ChecklistItemInput = Omit<ChecklistItem, "id">;
export interface ChecklistViewDesign extends UiCellDesign {
    width?: number;
    before?: UiLayoutNode[];
    after?: UiLayoutNode[];
}
export interface ChecklistBlockDesign {
    align?: "left" | "center" | "right";
    fontSize?: number;
    color?: string;
    indicator?: "check" | "star" | "rocket" | "heart" | "info" | "warning" | "sparkles" | "arrow";
}
export interface ChecklistVisualDesign {
    views: {
        expanded: ChecklistViewDesign;
        launcher: ChecklistViewDesign;
        completion: ChecklistViewDesign;
    };
    title?: ChecklistBlockDesign;
    description?: ChecklistBlockDesign;
    progress?: ChecklistBlockDesign;
    task?: ChecklistBlockDesign;
    launcherLabel?: ChecklistBlockDesign;
    remainingCount?: ChecklistBlockDesign;
    completionTitle?: ChecklistBlockDesign;
    completionDescription?: ChecklistBlockDesign;
    control?: ChecklistBlockDesign;
    items?: UiCellDesign;
}
export type ChecklistAiOperation = {
    type: "generate_checklist";
    title?: string;
    description?: string;
    items: ChecklistItemInput[];
} | {
    type: "add_checklist_task";
    afterItemId?: string;
    item: ChecklistItemInput;
} | {
    type: "duplicate_checklist_task";
    itemId: string;
    afterItemId?: string;
} | {
    type: "remove_checklist_task";
    itemId: string;
} | {
    type: "move_checklist_task";
    itemId: string;
    beforeItemId?: string;
} | {
    type: "update_checklist_task";
    itemId: string;
    patch: {
        title?: string;
        description?: string | null;
    };
} | {
    type: "update_checklist_task_action";
    itemId: string;
    action: ChecklistItem["action"];
} | {
    type: "update_checklist_task_completion";
    itemId: string;
    completion: ChecklistItem["completion"];
} | {
    type: "update_checklist_behavior";
    patch: Partial<EditorChecklistDefinition["behavior"]>;
} | {
    type: "update_checklist_completion_message";
    patch: Partial<EditorChecklistDefinition["completionMessage"]>;
} | {
    type: "update_checklist_visual_state";
    view: ChecklistView;
    width: number;
} | {
    type: "update_checklist_style";
    blockId: string;
    patch: {
        fontSize?: number;
        color?: string;
        indicator?: "check" | "star" | "rocket" | "heart" | "info" | "warning" | "sparkles" | "arrow";
        text?: string;
    };
} | {
    type: "redesign_checklist_views";
    design: ChecklistVisualDesign;
};
export interface ChecklistAiProposal extends Omit<EditorAiProposal, "operations"> {
    operations: Array<EditorAiOperation | ChecklistAiOperation>;
}
export interface ChecklistAiApplyResult {
    definition: EditorChecklistDefinition;
    affectedItemIds: string[];
    order: string[];
    warnings: string[];
}
/** Applies canonical tasks and schema-v4 visuals together, returning nothing until the entire proposal validates. */
export declare function applyChecklistAiProposal(source: EditorChecklistDefinition, proposal: ChecklistAiProposal, references: NonNullable<EditorDraft["references"]>): ChecklistAiApplyResult;
export declare function checklistAiContext(input: {
    experience: {
        id: string;
        name: string;
        builderMode: "onsite";
    };
    revision: number;
    checklist: EditorChecklistDefinition;
    references: NonNullable<EditorDraft["references"]>;
    selection: CompositionSelection;
    currentView: ChecklistView;
    theme?: unknown;
}): Record<string, unknown>;
