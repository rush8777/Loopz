import type { DeliveredExperience, ExperienceAction } from "../types";
export interface ExperienceRendererCallbacks {
    onVisible: () => void;
    onDismiss: () => void;
    onAction: (action: ExperienceAction) => void;
    onComplete: () => void;
    onGuideAdvance?: () => void;
    onGuideBack?: () => void;
    onUnavailable?: () => void;
}
export declare class ExperienceRenderer {
    private host;
    private renderer;
    private cancelPendingTarget;
    private cleanupAdvance;
    render(experience: DeliveredExperience, callbacks: ExperienceRendererCallbacks, guideStepId?: string): boolean;
    private root;
    private renderWidget;
    private renderGuide;
    private listenForAdvance;
    private callbacks;
    private clearSurface;
    destroy(): void;
}
