import { type OnsiteBlock, type OnsiteButtonAction, type OnsiteDocument } from "../onsite/OnsiteDocument";
import type { CompositionSelection } from "./OnsiteCompositionEditor";
import { type ExperienceTarget, type ExperienceTargeting, type GuidePresentation, type GuideStep, type RuntimeGuideDefinition, type WidgetBuilderState } from "../types";
import { type ReplaceMarkupOperation } from "./SourceAuthoring";
export type EditorAiOperation = {
    type: "update_text";
    stepId?: string;
    blockId: string;
    text: string;
} | {
    type: "update_block";
    stepId?: string;
    blockId: string;
    patch: Record<string, unknown>;
} | {
    type: "update_cell";
    stepId?: string;
    cellId: string;
    patch: Record<string, unknown>;
} | {
    type: "update_button_action";
    stepId?: string;
    blockId: string;
    action: Omit<OnsiteButtonAction, "id">;
} | {
    type: "insert_block";
    stepId?: string;
    targetCellId: string;
    position: "inside" | "before" | "after";
    blockType: "heading" | "text" | "button" | "image" | "divider" | "spacer" | "icon";
    text?: string;
} | {
    type: "remove_cell";
    stepId?: string;
    cellId: string;
} | {
    type: "duplicate_cell";
    stepId?: string;
    cellId: string;
} | {
    type: "move_cell";
    stepId?: string;
    cellId: string;
    targetCellId: string;
    before?: boolean;
} | ReplaceMarkupOperation;
export type GuideAiOperation = {
    type: "add_guide_step";
    afterStepId?: string;
    pattern: "modal" | "anchored_card";
    label?: string;
    heading: string;
    body: string;
} | {
    type: "duplicate_guide_step";
    stepId: string;
    afterStepId?: string;
    label?: string;
    heading?: string;
    body?: string;
} | {
    type: "remove_guide_step";
    stepId: string;
} | {
    type: "move_guide_step";
    stepId: string;
    beforeStepId?: string;
} | {
    type: "update_guide_step";
    stepId: string;
    patch: {
        label?: string;
        pattern?: "modal" | "anchored_card";
    };
} | {
    type: "update_guide_step_behavior";
    stepId: string;
    patch: Partial<Pick<GuideStep["behavior"], "placement" | "alignment" | "offset" | "pointer" | "dismissible" | "backdrop" | "backdropOpacity" | "closeOnBackdrop">>;
} | {
    type: "update_guide_advance";
    stepId: string;
    advance: {
        type: "button";
    } | {
        type: "element_click";
    } | {
        type: "element_hover";
        durationMs: number;
    } | {
        type: "custom_event";
        eventName: string;
    } | {
        type: "route";
        pageRules: Array<Omit<import("../types").PageRule, "id">>;
    };
} | {
    type: "update_guide_presentation";
    stepId: string;
    presentation: {
        delayMs?: number;
        missingTarget?: GuidePresentation["missingTarget"] | null;
    };
} | {
    type: "update_guide_targeting";
    patch: Partial<Omit<Pick<ExperienceTargeting, "pageRules" | "trigger" | "frequency" | "priority" | "interruptPolicy">, "pageRules">> & {
        pageRules?: Array<Omit<import("../types").PageRule, "id">>;
    };
} | {
    type: "request_guide_target";
    stepId: string;
    targetKind: "position" | "advance";
};
export interface EditorAiProposal {
    summary: string;
    operations: Array<EditorAiOperation | GuideAiOperation>;
}
export interface GuideAiApplyResult {
    guide: RuntimeGuideDefinition & {
        targeting: ExperienceTargeting;
    };
    affectedStepIds: string[];
    order: string[];
    warnings: string[];
}
/** Applies a complete AI proposal to a clone. The live document is untouched unless every operation validates. */
export declare function applyEditorAiProposal(document: OnsiteDocument, proposal: EditorAiProposal): OnsiteDocument;
/** Applies Guide and within-step operations to one clone. No caller state is mutated on failure. */
export declare function applyGuideAiProposal(source: RuntimeGuideDefinition & {
    targeting: ExperienceTargeting;
}, proposal: EditorAiProposal, resolvedTargets?: ReadonlyMap<number, ExperienceTarget>): GuideAiApplyResult;
export declare function editorAiContext(input: {
    experience: {
        id: string;
        name: string;
        widgetType: string | null;
        builderMode: "onsite";
    };
    selection: CompositionSelection;
    document: OnsiteDocument;
    builder?: WidgetBuilderState;
    theme?: Record<string, string | number | boolean | null>;
}): {
    theme?: Record<string, string | number | boolean | null> | undefined;
    source?: {
        html: string;
        css: string;
        authoringSurface: "source" | "onsite";
        actionBindings: {};
        supportedActions: readonly ["dismiss", "next_step", "previous_step", "open_url", "track_event"] | readonly ["dismiss", "open_url", "track_event"];
    } | undefined;
    experience: {
        id: string;
        name: string;
        widgetType: string | null;
        builderMode: "onsite";
    };
    selection: CompositionSelection;
    document: OnsiteDocument;
};
export declare function guideAiContext(input: {
    experience: {
        id: string;
        name: string;
        builderMode: "onsite";
    };
    revision: number;
    guide: RuntimeGuideDefinition & {
        targeting: ExperienceTargeting;
    };
    currentStepId: string;
    selection: CompositionSelection;
    theme?: unknown;
    scope?: "guide" | "step";
}): {
    source?: {
        html: string;
        css: string;
        authoringSurface: "source" | "onsite";
        actionBindings: {};
        supportedActions: readonly ["dismiss", "next_step", "previous_step", "open_url", "track_event"] | readonly ["dismiss", "open_url", "track_event"];
    } | undefined;
    experience: {
        kind: "guide";
        widgetType: null;
        id: string;
        name: string;
        builderMode: "onsite";
    };
    selection: {
        scope: "guide" | "step";
        stepId: string;
        kind: "step";
        label: string;
    } | {
        scope: "guide" | "step";
        stepId: string;
        kind: "cell";
        label: string;
        cellId: string;
    } | {
        scope: "guide" | "step";
        stepId: string;
        kind: "block";
        label: string;
        cellId: string;
        blockId: string;
        blockType: OnsiteBlock["type"];
    };
    guide: {
        theme: {} | null;
        behavior?: {
            layer: {
                mode: "auto";
            } | {
                mode: "always_on_top";
            } | {
                mode: "custom";
                zIndex: number;
            } | {
                mode: "relative";
                relation: "above" | "below";
                target: {
                    configured: boolean;
                    label: string | undefined;
                    reliability: "reliable" | "moderate" | "fragile";
                    pagePath: string | undefined;
                } | {
                    configured: boolean;
                    label?: undefined;
                    reliability?: undefined;
                    pagePath?: undefined;
                };
            };
        } | undefined;
        id: string;
        name: string;
        revision: number;
        currentStepId: string;
        totalSteps: number;
        steps: {
            id: string;
            index: number;
            label: string | undefined;
            pattern: import("../types").GuideStepPattern;
            heading: string;
            description: string;
            buttons: {
                id: string;
                label: string;
                action: "dismiss" | "next_step" | "previous_step" | "open_url" | "track_event";
            }[];
            advance: {
                target?: {
                    configured: boolean;
                    label: string | undefined;
                    reliability: "reliable" | "moderate" | "fragile";
                    pagePath: string | undefined;
                } | {
                    configured: boolean;
                    label?: undefined;
                    reliability?: undefined;
                    pagePath?: undefined;
                } | undefined;
                type: "button";
            } | {
                target?: ExperienceTarget | {
                    configured: boolean;
                    label: string | undefined;
                    reliability: "reliable" | "moderate" | "fragile";
                    pagePath: string | undefined;
                } | {
                    configured: boolean;
                    label?: undefined;
                    reliability?: undefined;
                    pagePath?: undefined;
                } | undefined;
                type: "element_click";
            } | {
                target?: ExperienceTarget | {
                    configured: boolean;
                    label: string | undefined;
                    reliability: "reliable" | "moderate" | "fragile";
                    pagePath: string | undefined;
                } | {
                    configured: boolean;
                    label?: undefined;
                    reliability?: undefined;
                    pagePath?: undefined;
                } | undefined;
                type: "element_hover";
                durationMs?: number;
            } | {
                target?: {
                    configured: boolean;
                    label: string | undefined;
                    reliability: "reliable" | "moderate" | "fragile";
                    pagePath: string | undefined;
                } | {
                    configured: boolean;
                    label?: undefined;
                    reliability?: undefined;
                    pagePath?: undefined;
                } | undefined;
                type: "custom_event";
                eventName: string;
            } | {
                target?: {
                    configured: boolean;
                    label: string | undefined;
                    reliability: "reliable" | "moderate" | "fragile";
                    pagePath: string | undefined;
                } | {
                    configured: boolean;
                    label?: undefined;
                    reliability?: undefined;
                    pagePath?: undefined;
                } | undefined;
                type: "route";
                pageRules: import("../types").PageRule[];
            } | {
                type: string;
            };
            presentation: GuidePresentation | undefined;
            dismissible: boolean;
            positionTarget: {
                configured: boolean;
                label: string | undefined;
                reliability: "reliable" | "moderate" | "fragile";
                pagePath: string | undefined;
            } | {
                configured: boolean;
                label?: undefined;
                reliability?: undefined;
                pagePath?: undefined;
            };
        }[];
        targeting: ExperienceTargeting;
    };
    currentDocument: OnsiteDocument | null;
};
