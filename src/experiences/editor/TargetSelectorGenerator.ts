import { computeElementLabel, computeElementRole } from "../../dom/ElementLabeler";
import type { ExperienceTarget } from "../types";

const STABLE_DATA_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy", "data-analytics-id"];
const SEMANTIC_ATTRS = ["role", "aria-label", "name", "type", "href"];
const DYNAMIC_CLASS_PATTERN = /^(css-|sc-|jsx-|_|[a-z0-9]{6,}$)/i;
const UTILITY_CLASS_PATTERN = /^(sm:|md:|lg:|xl:|2xl:|hover:|focus:|active:|disabled:|dark:|-?(m|p)[trblxy]?-|w-|h-|min-|max-|inset-|top-|right-|bottom-|left-|z-|gap-|space-|grid|flex|items-|justify-|text-|font-|leading-|tracking-|bg-|border|rounded|shadow|opacity-|transition|duration-|absolute$|relative$|fixed$|sticky$|hidden$|block$|inline)/;

interface SelectorCandidate {
  selector: string;
  reliability: ExperienceTarget["reliability"];
}

export interface TargetSelectorDescriptor extends ExperienceTarget {
  primarySelector: string;
}

/** Generates selectors for experience anchoring only. Every emitted selector
 * is verified to resolve uniquely to the exact element that was selected. */
export class TargetSelectorGenerator {
  generate(element: Element): Pick<ExperienceTarget, "primarySelector" | "fallbackSelectors" | "reliability"> {
    const verified: SelectorCandidate[] = [];
    const seen = new Set<string>();
    const add = (selector: string, reliability: ExperienceTarget["reliability"]) => {
      if (!selector || seen.has(selector)) return;
      seen.add(selector);
      if (uniquelyMatches(selector, element)) verified.push({ selector, reliability });
    };
    const tag = element.tagName.toLowerCase();

    const id = shortValue(element.getAttribute("id"));
    if (id) add(`${tag}#${cssIdentifier(id)}`, "reliable");

    for (const selector of attributeSelectors(element, STABLE_DATA_ATTRS)) add(selector, "reliable");
    const semantics = attributeSelectors(element, SEMANTIC_ATTRS);
    for (const selector of semantics) add(selector, "moderate");
    for (const selector of attributeCombinations(element, SEMANTIC_ATTRS)) add(selector, "moderate");
    for (const selector of classSelectors(element)) add(selector, "moderate");

    const childSelectors = [...semantics, ...attributeCombinations(element, SEMANTIC_ATTRS), ...classSelectors(element), tag];
    let ancestor = element.parentElement;
    let depth = 1;
    while (ancestor && ancestor !== document.documentElement && depth <= 4) {
      const relation = depth === 1 ? " > " : " ";
      for (const parentSelector of identitySelectors(ancestor)) {
        for (const childSelector of childSelectors) add(`${parentSelector}${relation}${childSelector}`, "moderate");
      }
      ancestor = ancestor.parentElement;
      depth++;
    }

    for (const selector of structuralSelectors(element)) add(selector, "fragile");
    const primary = verified[0];
    if (!primary) throw new Error("Could not generate a unique selector for the selected element");
    return { primarySelector: primary.selector, fallbackSelectors: verified.slice(1, 6).map(item => item.selector), reliability: primary.reliability };
  }

  describe(element: Element): TargetSelectorDescriptor {
    return {
      ...this.generate(element),
      label: computeElementLabel(element),
      role: computeElementRole(element),
      tagName: element.tagName.toLowerCase(),
    };
  }
}

function attributeSelectors(element: Element, attributes: string[]): string[] {
  const tag = element.tagName.toLowerCase();
  return attributes.flatMap(attribute => {
    const value = shortValue(element.getAttribute(attribute));
    return value ? [`${tag}[${attribute}="${cssString(value)}"]`] : [];
  });
}

function attributeCombinations(element: Element, attributes: string[]): string[] {
  const tag = element.tagName.toLowerCase();
  const present = attributes.flatMap(attribute => {
    const value = shortValue(element.getAttribute(attribute));
    return value ? [{ attribute, value }] : [];
  });
  const selectors: string[] = [];
  for (let first = 0; first < present.length; first++) {
    for (let second = first + 1; second < present.length; second++) {
      selectors.push(`${tag}[${present[first].attribute}="${cssString(present[first].value)}"][${present[second].attribute}="${cssString(present[second].value)}"]`);
    }
  }
  return selectors;
}

function classSelectors(element: Element): string[] {
  const tag = element.tagName.toLowerCase();
  const classes = (element.getAttribute("class") ?? "").split(/\s+/).filter(isStableClass).slice(0, 4);
  if (!classes.length) return [];
  const selectors = [`${tag}.${classes.map(cssIdentifier).join(".")}`];
  if (classes.length > 1) {
    for (let first = 0; first < classes.length; first++) for (let second = first + 1; second < classes.length; second++) selectors.push(`${tag}.${cssIdentifier(classes[first])}.${cssIdentifier(classes[second])}`);
  }
  selectors.push(...classes.map(value => `${tag}.${cssIdentifier(value)}`));
  return [...new Set(selectors)];
}

function identitySelectors(element: Element): string[] {
  const tag = element.tagName.toLowerCase();
  const selectors: string[] = [];
  const id = shortValue(element.getAttribute("id"));
  if (id) selectors.push(`${tag}#${cssIdentifier(id)}`);
  selectors.push(...attributeSelectors(element, STABLE_DATA_ATTRS), ...attributeSelectors(element, SEMANTIC_ATTRS), ...attributeCombinations(element, SEMANTIC_ATTRS), ...classSelectors(element));
  return [...new Set(selectors)];
}

function structuralSelectors(element: Element): string[] {
  const selectors: string[] = [];
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.documentElement) {
    const parent: Element | null = node.parentElement;
    let part = node.tagName.toLowerCase();
    if (parent) {
      const siblings = Array.from(parent.children).filter(sibling => sibling.tagName === node!.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    selectors.push(parts.join(" > "));
    node = parent;
  }
  return selectors;
}

function uniquelyMatches(selector: string, selected: Element): boolean {
  try { const matches = document.querySelectorAll(selector); return matches.length === 1 && matches[0] === selected; }
  catch { return false; }
}

function shortValue(value: string | null): string | null { return value && value.length <= 160 ? value : null; }
function isStableClass(value: string): boolean { const unescaped = value.replace(/\\/g, ""); return !!unescaped && !/^\d/.test(unescaped) && !DYNAMIC_CLASS_PATTERN.test(unescaped) && !UTILITY_CLASS_PATTERN.test(unescaped); }
function cssIdentifier(value: string): string { return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
function cssString(value: string): string { return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n\f]/g, " "); }
