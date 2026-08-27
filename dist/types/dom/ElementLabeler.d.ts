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
export declare function computeElementLabel(el: Element): string;
/**
 * Computes a coarse semantic role for an element - explicit `role`
 * attribute when present, else a small tag-based mapping. Kept
 * intentionally simple (no full ARIA computed-role algorithm); good
 * enough to distinguish "this is a button-like thing" from "this is a
 * text input" for analysis purposes without pulling in a full
 * accessibility-tree implementation.
 */
export declare function computeElementRole(el: Element): string | undefined;
