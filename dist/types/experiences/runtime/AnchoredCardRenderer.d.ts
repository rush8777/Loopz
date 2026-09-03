import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, ExperienceTarget } from "../types";
export interface RenderCallbacks {
    onDismiss: () => void;
    onPrimary: () => void;
    onSecondary: () => void;
    onBack?: () => void;
}
export declare function findTarget(target?: ExperienceTarget): Element | null;
export declare function buildCard(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks): HTMLElement;
export declare class AnchoredCardRenderer {
    private cleanup;
    render(root: ShadowRoot, target: Element, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks): HTMLElement;
    destroy(): void;
}
