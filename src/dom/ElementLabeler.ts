import { SensitiveElementDetector } from "../privacy/SensitiveElementDetector";

const MAX_LABEL_LENGTH = 60;
const OVERRIDE_ATTR = "data-loopz-name";
const detector = new SensitiveElementDetector();

function clean(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_LABEL_LENGTH ? `${trimmed.slice(0, MAX_LABEL_LENGTH - 1)}\u2026` : trimmed;
}

/**
 * Computes a human-readable display label for an element. This is
 * purely for display in the dashboard - `SelectorGenerator` remains
 * the source of truth for element *identity* (grouping/matching stays
 * selector-based and stable); a label is just a friendlier name to
 * show next to that selector.
 *
 * Priority order mirrors how other behavioral analytics platforms name
 * autocaptured elements (explicit override > accessibility metadata >
 * visible text > semantic fallback):
 *
 *   1. data-loopz-name        - explicit developer override, always wins
 *   2. aria-label / aria-labelledby
 *   3. visible text content   - skipped entirely for elements within a
 *                                privacy-marked subtree (data-private
 *                                etc. - see SensitiveElementDetector)
 *   4. alt / title / placeholder
 *   5. tag + role fallback, e.g. "Button", "Link", "Submit button"
 *
 * Always returns *something* (falls through to the tag name itself in
 * the worst case) so callers never have to handle "no label at all".
 */
export function computeElementLabel(el: Element): string {
  const override = clean(el.getAttribute(OVERRIDE_ATTR));
  if (override) return override;

  const ariaLabel = clean(el.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelText = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent)
      .filter(Boolean)
      .join(" ");
    const cleaned = clean(labelText);
    if (cleaned) return cleaned;
  }

  if (!detector.isWithinPrivateSubtree(el)) {
    const text = clean(el.textContent);
    if (text) return text;
  }

  const alt = clean(el.getAttribute("alt"));
  if (alt) return alt;
  const title = clean(el.getAttribute("title"));
  if (title) return title;
  const placeholder = clean(el.getAttribute("placeholder"));
  if (placeholder) return placeholder;

  return semanticFallback(el);
}

function semanticFallback(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");

  if (tag === "button" || role === "button") {
    return el.getAttribute("type") === "submit" ? "Submit button" : "Button";
  }
  if (tag === "a" || role === "link") return "Link";
  if (tag === "input") {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    return `${type.charAt(0).toUpperCase()}${type.slice(1)} field`;
  }
  if (tag === "select") return "Dropdown";
  if (tag === "textarea") return "Text field";

  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

/**
 * Computes a coarse semantic role for an element - explicit `role`
 * attribute when present, else a small tag-based mapping. Kept
 * intentionally simple (no full ARIA computed-role algorithm); good
 * enough to distinguish "this is a button-like thing" from "this is a
 * text input" for analysis purposes without pulling in a full
 * accessibility-tree implementation.
 */
export function computeElementRole(el: Element): string | undefined {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;

  const tag = el.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a") return "link";
  if (tag === "input") return `input:${(el.getAttribute("type") || "text").toLowerCase()}`;
  if (tag === "select") return "select";
  if (tag === "textarea") return "textarea";
  return undefined;
}
