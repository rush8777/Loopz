import type { ExperienceTarget, GuideStep, PageRule } from "../types";
export declare function guideInteractionTarget(step: GuideStep): ExperienceTarget | undefined;
export declare function matchesGuideRoute(path: string, rules: PageRule[]): boolean;
/** Draft validation deliberately allows unselected targets while authoring. */
export declare function guideStepConfigurationErrors(step: GuideStep, index: number): string[];
