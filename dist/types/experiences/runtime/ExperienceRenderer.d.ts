import type { DeliveredExperience, ExperienceAction, SurveyAnswers } from "../types";
import { type SurveyResume } from "./SurveyRenderer";
export interface ExperienceRendererCallbacks {
    onVisible: () => void;
    onDismiss: () => void;
    onAction: (action: ExperienceAction) => void;
    onComplete: () => void;
    onGuideAdvance?: () => void;
    onGuideBack?: () => void;
    onUnavailable?: () => void;
    onGuideStatus?: (status: "delay" | "waiting" | "ready" | "unavailable") => void;
    onSurveyLoad?: () => Promise<SurveyResume>;
    onSurveyAnswersChange?: (answers: SurveyAnswers) => void;
    onSurveyProgress?: (answers: SurveyAnswers, currentStepId: string, direction: "next" | "back", destinationStepId?: string) => Promise<void> | void;
    onSurveySubmit?: (answers: SurveyAnswers, currentStepId: string) => Promise<void> | void;
}
export declare class ExperienceRenderer {
    private host;
    private renderer;
    private cancelPendingTarget;
    private cleanupAdvance;
    private appliedLayer;
    private layerManager;
    private guideTimer;
    private visibleFrame;
    private renderGeneration;
    render(experience: DeliveredExperience, callbacks: ExperienceRendererCallbacks, guideStepId?: string): boolean;
    private root;
    private applyLayer;
    private renderWidget;
    private renderGuide;
    private listenForAdvance;
    private callbacks;
    private dispatchBuilderAction;
    private clearSurface;
    destroy(): void;
}
