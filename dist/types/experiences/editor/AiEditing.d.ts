import { type OnsiteButtonAction, type OnsiteDocument } from "../onsite/OnsiteDocument";
import type { CompositionSelection } from "./OnsiteCompositionEditor";
export type EditorAiOperation = {
    type: "update_text";
    blockId: string;
    text: string;
} | {
    type: "update_block";
    blockId: string;
    patch: Record<string, unknown>;
} | {
    type: "update_cell";
    cellId: string;
    patch: Record<string, unknown>;
} | {
    type: "update_button_action";
    blockId: string;
    action: Omit<OnsiteButtonAction, "id">;
} | {
    type: "insert_block";
    targetCellId: string;
    position: "inside" | "before" | "after";
    blockType: "heading" | "text" | "button" | "image" | "divider" | "spacer" | "icon";
    text?: string;
} | {
    type: "remove_cell";
    cellId: string;
} | {
    type: "duplicate_cell";
    cellId: string;
} | {
    type: "move_cell";
    cellId: string;
    targetCellId: string;
    before?: boolean;
};
export interface EditorAiProposal {
    summary: string;
    operations: EditorAiOperation[];
}
/** Applies a complete AI proposal to a clone. The live document is untouched unless every operation validates. */
export declare function applyEditorAiProposal(document: OnsiteDocument, proposal: EditorAiProposal): OnsiteDocument;
export declare function editorAiContext(input: {
    experience: {
        id: string;
        name: string;
        widgetType: string | null;
        builderMode: "onsite";
    };
    selection: CompositionSelection;
    document: OnsiteDocument;
    theme?: Record<string, string | number | boolean | null>;
}): {
    theme?: Record<string, string | number | boolean | null> | undefined;
    experience: {
        id: string;
        name: string;
        widgetType: string | null;
        builderMode: "onsite";
    };
    selection: CompositionSelection;
    document: OnsiteDocument;
};
