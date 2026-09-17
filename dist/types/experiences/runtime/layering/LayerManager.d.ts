import type { ExperienceLayer, ExperienceTarget } from "../../types";
import { StackingContextResolver, type StackingContextInfo } from "./StackingContextResolver";
/** Maximum ordinary CSS layer. Native dialog/popover top-layer content can still render above it. */
export declare const ALWAYS_ON_TOP_Z_INDEX = 2147483000;
export declare const SAFE_DEFAULT_Z_INDEX = 1;
export interface LayerResolution {
    zIndex: number;
    mode: ExperienceLayer["mode"] | "legacy";
    context: StackingContextInfo | null;
    fallback?: "relative_target_missing";
}
export interface LayerOptions {
    layer?: ExperienceLayer;
    legacyZIndex?: number;
    targetElement?: Element | null;
}
export interface AppliedLayer {
    refresh(): LayerResolution;
    destroy(): void;
}
export declare class LayerManager {
    private resolver;
    private findTarget;
    constructor(resolver?: StackingContextResolver, findTarget?: (target: ExperienceTarget) => Element | null);
    resolve(options: LayerOptions): LayerResolution;
    private auto;
    apply(host: HTMLElement, options: LayerOptions): AppliedLayer;
}
