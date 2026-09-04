import type { ExperienceBehavior, ExperienceContent, ExperienceDesign } from "../types";
import { type RenderCallbacks } from "./AnchoredCardRenderer";
export declare class BannerRenderer {
    render(root: ShadowRoot, content: ExperienceContent, design: ExperienceDesign, behavior: ExperienceBehavior, callbacks: RenderCallbacks): HTMLElement;
    destroy(): void;
}
