import type { DeliveredExperience, ExperienceAction } from "../types";
export interface ExperienceRendererCallbacks {
    onVisible: () => void;
    onDismiss: () => void;
    onAction: (action: ExperienceAction) => void;
    onComplete: () => void;
    onUnavailable?: () => void;
}
export declare class ExperienceRenderer {
    private host;
    private renderer;
    private cancelPendingTarget;
    private step;
    render(experience: DeliveredExperience, callbacks: ExperienceRendererCallbacks): boolean;
    private root;
    private renderWidget;
    private renderGuide;
    private callbacks;
    private clearSurface;
    destroy(): void;
}
