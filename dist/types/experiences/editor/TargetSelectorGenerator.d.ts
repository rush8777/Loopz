import type { ExperienceTarget } from "../types";
export interface TargetSelectorDescriptor extends ExperienceTarget {
    primarySelector: string;
}
/** Generates selectors for experience anchoring only. Every emitted selector
 * is verified to resolve uniquely to the exact element that was selected. */
export declare class TargetSelectorGenerator {
    generate(element: Element): Pick<ExperienceTarget, "primarySelector" | "fallbackSelectors" | "reliability">;
    describe(element: Element): TargetSelectorDescriptor;
}
