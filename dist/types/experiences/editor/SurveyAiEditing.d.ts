import type { CompositionSelection } from "./OnsiteCompositionEditor";
import { type EditorAiOperation, type EditorAiProposal } from "./AiEditing";
import type { ExperienceTargeting, RuntimeWidgetDefinition, SurveyBranching, SurveyConfig } from "../types";
export type SurveyQuestionInput = {
    type: "single_choice" | "multiple_choice";
    label: string;
    required?: boolean;
    options: Array<{
        label: string;
    }>;
} | {
    type: "short_text" | "long_text";
    label: string;
    required?: boolean;
    placeholder?: string;
    maxLength?: number;
} | {
    type: "rating";
    label: string;
    required?: boolean;
    min: number;
    max: number;
} | {
    type: "nps";
    label: string;
    required?: boolean;
};
export type SurveyAiOperation = {
    type: "add_survey_step";
    afterStepId?: string;
    heading: string;
    body?: string;
    questions?: SurveyQuestionInput[];
} | {
    type: "duplicate_survey_step";
    stepId: string;
    afterStepId?: string;
} | {
    type: "remove_survey_step";
    stepId: string;
    removeBranchRules?: boolean;
} | {
    type: "move_survey_step";
    stepId: string;
    beforeStepId?: string;
} | {
    type: "update_survey_step";
    stepId: string;
    patch: {
        heading?: string;
        body?: string;
    };
} | {
    type: "add_survey_question";
    stepId: string;
    afterQuestionId?: string;
    question: SurveyQuestionInput;
} | {
    type: "duplicate_survey_question";
    stepId: string;
    questionId: string;
    afterQuestionId?: string;
} | {
    type: "remove_survey_question";
    stepId: string;
    questionId: string;
    removeBranchRules?: boolean;
} | {
    type: "move_survey_question";
    stepId: string;
    questionId: string;
    beforeQuestionId?: string;
} | {
    type: "update_survey_question";
    stepId: string;
    questionId: string;
    patch: {
        label?: string;
        required?: boolean;
        placeholder?: string;
        maxLength?: number;
        min?: number;
        max?: number;
    };
} | {
    type: "change_survey_question_type";
    stepId: string;
    questionId: string;
    question: SurveyQuestionInput;
    removeInvalidBranchRules?: boolean;
} | {
    type: "add_survey_option";
    stepId: string;
    questionId: string;
    afterOptionId?: string;
    label: string;
} | {
    type: "update_survey_option";
    stepId: string;
    questionId: string;
    optionId: string;
    label: string;
} | {
    type: "remove_survey_option";
    stepId: string;
    questionId: string;
    optionId: string;
    removeBranchRules?: boolean;
} | {
    type: "move_survey_option";
    stepId: string;
    questionId: string;
    optionId: string;
    beforeOptionId?: string;
} | {
    type: "update_survey_branching";
    stepId: string;
    branching: SurveyBranching | null;
} | {
    type: "remove_survey_branch_rule";
    stepId: string;
    ruleIndex: number;
} | {
    type: "update_survey_configuration";
    patch: Partial<Pick<SurveyConfig, "showProgress" | "allowBack" | "submitLabel">>;
};
export interface SurveyAiProposal extends Omit<EditorAiProposal, "operations"> {
    operations: Array<EditorAiOperation | SurveyAiOperation>;
}
export interface SurveyAiApplyResult {
    definition: RuntimeWidgetDefinition & {
        targeting: ExperienceTargeting;
    };
    affectedStepIds: string[];
    order: string[];
    warnings: string[];
}
/** Applies the whole proposal to one clone and returns it only after every Survey invariant passes. */
export declare function applySurveyAiProposal(source: RuntimeWidgetDefinition & {
    targeting: ExperienceTargeting;
}, proposal: SurveyAiProposal): SurveyAiApplyResult;
export declare function surveyAiContext(input: {
    experience: {
        id: string;
        name: string;
        builderMode: "onsite";
    };
    revision: number;
    definition: RuntimeWidgetDefinition & {
        targeting: ExperienceTargeting;
    };
    currentStepId: string;
    selection: CompositionSelection;
    scope?: "survey" | "step";
}): Record<string, unknown>;
