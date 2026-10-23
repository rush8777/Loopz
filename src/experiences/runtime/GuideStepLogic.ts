import type { ExperienceTarget, GuideStep, PageRule } from "../types";
import { guideStepRequiresTarget } from "../types";

export function guideInteractionTarget(step: GuideStep): ExperienceTarget | undefined {
  return step.advance?.type === "element_click" || step.advance?.type === "element_hover" ? step.advance.target ?? step.target : undefined;
}

export function matchesGuideRoute(path: string, rules: PageRule[]): boolean {
  const match = (rule: PageRule): boolean => {
    if (rule.operator === "equals") return path === rule.value;
    if (rule.operator === "starts_with") return path.startsWith(rule.value);
    if (rule.operator === "ends_with") return path.endsWith(rule.value);
    if (rule.operator === "contains") return path.includes(rule.value);
    const escaped = rule.value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try { return new RegExp(`^${escaped}$`).test(path); } catch { return false; }
  };
  return rules.some(rule => rule.kind === "include" && match(rule)) && !rules.some(rule => rule.kind === "exclude" && match(rule));
}

/** Draft validation deliberately allows unselected targets while authoring. */
export function guideStepConfigurationErrors(step: GuideStep, index: number): string[] {
  const errors: string[] = []; const add = (message: string) => errors.push(`Step ${index + 1}: ${message}`);
  const bounded = (value: number | undefined, min: number, max: number) => value === undefined || Number.isInteger(value) && value >= min && value <= max;
  if (!bounded(step.presentation?.delayMs, 0, 30_000)) add("Presentation delay must be 0–30,000 ms.");
  if (step.presentation?.missingTarget && (!bounded(step.presentation.missingTarget.timeoutMs, 100, 60_000) || !["wait", "skip", "dismiss"].includes(step.presentation.missingTarget.action))) add("Choose a missing-target action and a timeout of 100–60,000 ms.");
  if (step.presentation?.missingTarget && !guideStepRequiresTarget(step)) add("Missing-target behavior requires an Anchored Card step.");
  const advance = step.advance;
  if (!advance) return errors;
  if ((advance.type === "element_click" || advance.type === "element_hover") && !guideStepRequiresTarget(step)) add("Website click and hover triggers require an Anchored Card step.");
  if (advance.type === "element_hover" && !bounded(advance.durationMs, 100, 60_000)) add("Hover duration must be 100–60,000 ms.");
  if (advance.type === "custom_event" && (!advance.eventName.trim() || advance.eventName.length > 200 || /[\u0000-\u001f\u007f]/.test(advance.eventName))) add("Enter an event name of 1–200 characters without control characters.");
  if (advance.type === "route" && (!advance.pageRules.length || !advance.pageRules.some(rule => rule.kind === "include") || advance.pageRules.some(rule => !rule.value.trim() || rule.value.length > 500))) add("Enter at least one valid matching page rule.");
  return errors;
}
