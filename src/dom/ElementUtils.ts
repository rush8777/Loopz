/**
 * Walk up from a target to find the nearest "interactive" element. Shared by
 * ClickCollector (interactive vs. raw click discrimination) and
 * HoverCollector (which elements are worth timing). Returns null - not a
 * fallback to `el` - when nothing interactive is found, so callers can tell
 * "this really is a non-interactive area" from "this is a real widget".
 */
const INTERACTIVE_TAGS = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "LABEL"]);

export function closestInteractive(el: Element | null, maxDepth = 8): Element | null {
  let node: Element | null = el;
  let depth = 0;
  while (node && node !== document.body && depth < maxDepth) {
    if (
      INTERACTIVE_TAGS.has(node.tagName) ||
      node.getAttribute("role") === "button" ||
      node.getAttribute("role") === "link" ||
      node.hasAttribute("onclick") ||
      node.hasAttribute("tabindex") ||
      node.hasAttribute("data-action")
    ) {
      return node;
    }
    node = node.parentElement;
    depth++;
  }
  return null;
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
