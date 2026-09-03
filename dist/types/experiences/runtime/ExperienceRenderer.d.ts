import type { DeliveredExperience, ExperienceAction } from "../types";
export interface ExperienceRendererCallbacks {
    onVisible: () => void;
    onDismiss: () => void;
    onAction: (action: ExperienceAction) => void;
    onComplete: () => void;
}
export declare class ExperienceRenderer {
    private host;
    private renderer;
    private step;
    render(experience: DeliveredExperience, callbacks: ExperienceRendererCallbacks): boolean;
    private root;
    private renderWidget;
    private renderGuide;
    private callbacks;
    private clearSurface;
    destroy(): void;
}
