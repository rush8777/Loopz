import type { ExperienceBehavior, ExperienceContent, ExperienceDesign, WidgetBuilderState } from "../types";
import { type RenderCallbacks } from "./AnchoredCardRenderer";
export declare class HotspotRenderer {
    private cleanup;
    private cardRenderer;
    private card;
    render(root: ShadowRoot, target: Element, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks, builder?: WidgetBuilderState): HTMLElement;
    destroy(): void;
}
