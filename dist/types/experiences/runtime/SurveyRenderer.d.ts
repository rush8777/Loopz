import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, SurveyAnswers, SurveyConfig } from "../types";
export interface SurveyResume {
    answers: SurveyAnswers;
    currentStepId?: string;
    closed?: boolean;
}
export interface SurveyCallbacks {
    onLoad?: () => Promise<SurveyResume>;
    onAnswersChange?: (answers: SurveyAnswers) => void;
    onDismiss: () => Promise<void> | void;
    onProgress: (answers: SurveyAnswers, currentStepId: string, direction: "next" | "back", destinationStepId?: string) => Promise<void> | void;
    onSubmit: (answers: SurveyAnswers, currentStepId: string) => Promise<void> | void;
    onStepChange?: (stepId: string) => void;
}
export declare class SurveyRenderer {
    private modal;
    private stepIndex;
    private answers;
    private root;
    private content;
    private design;
    private behavior;
    private survey;
    private callbacks;
    private busy;
    private completed;
    private generation;
    private retry;
    render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, survey: SurveyConfig, callbacks: SurveyCallbacks, requestedStepId?: string): HTMLElement | null;
    private renderStep;
    private syncQuestions;
    private bindQuestion;
    private syncNavigation;
    private dismiss;
    private run;
    private setBusy;
    private syncProgress;
    private validateStep;
    private validateAll;
    private validateQuestions;
    destroy(): void;
}
