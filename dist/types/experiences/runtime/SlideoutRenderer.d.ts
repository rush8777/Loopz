import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, WidgetBuilderState } from "../types";
import { type RenderCallbacks } from "./AnchoredCardRenderer";
export declare class SlideoutRenderer {
    render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState): HTMLElement;
    destroy(): void;
}
