import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, SurveyAnswers, SurveyConfig } from "../types";
export interface SurveyCallbacks {
    onDismiss: () => void;
    onProgress: (answers: SurveyAnswers, currentStepId: string) => Promise<void> | void;
    onSubmit: (answers: SurveyAnswers, currentStepId: string) => Promise<void> | void;
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
    private submitting;
    render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, survey: SurveyConfig, callbacks: SurveyCallbacks, requestedStepId?: string): HTMLElement | null;
    private renderStep;
    private syncQuestions;
    private bindQuestion;
    private syncNavigation;
    private validateStep;
    private validateAll;
    private validateQuestions;
    destroy(): void;
}
