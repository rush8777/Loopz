import type { ElementDescriptor } from "../types/events";

const STABLE_DATA_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy", "data-analytics-id"];
const SEMANTIC_ATTRS = ["role", "aria-label", "name", "type", "href"];

// Class tokens that look auto-generated / non-semantic (hashed CSS modules,
// atomic utility classes, etc.) are unreliable across builds and are
// filtered out of selector construction.
const DYNAMIC_CLASS_PATTERN = /^(css-|sc-|jsx-|_|[a-z0-9]{6,}$)/i;

function isStableClass(cls: string): boolean {
  if (!cls) return false;
  if (DYNAMIC_CLASS_PATTERN.test(cls)) return false;
  if (/^\d/.test(cls)) return false;
  return true;
}

/**
 * Produces a human-debuggable, reasonably-stable CSS selector for an
 * element without depending on brittle nth-child structural paths and
 * without reading any user-generated text content.
 */
export class SelectorGenerator {
  generate(el: Element): string {
    // 1. Stable unique ID
    const id = el.getAttribute("id");
    if (id && this.isUniqueId(id)) {
      return `${el.tagName.toLowerCase()}#${cssEscape(id)}`;
    }

    // 2. Stable data attributes
    for (const attr of STABLE_DATA_ATTRS) {
      const value = el.getAttribute(attr);
      if (value) {
        return `${el.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
      }
    }

    // 3. Semantic attributes
    for (const attr of SEMANTIC_ATTRS) {
      const value = el.getAttribute(attr);
      if (value && value.length < 100) {
        return `${el.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
      }
    }

    // 4. Stable class combination
    const classes = this.getClassList(el).filter(isStableClass);
    if (classes.length > 0) {
      return `${el.tagName.toLowerCase()}.${classes.map(cssEscape).join(".")}`;
    }

    // 5 & 6. Tag name + limited structural path (max 3 ancestors, index-based
    // only as a last resort, never relying on full nth-child chains).
    return this.limitedStructuralPath(el);
  }

  describe(el: Element): ElementDescriptor {
    const classes = this.getClassList(el);
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.getAttribute("id") || undefined,
      classes: classes.length ? classes : undefined,
      selector: this.generate(el),
    };
  }

  private getClassList(el: Element): string[] {
    const raw = el.getAttribute("class");
    if (!raw) return [];
    return raw.split(/\s+/).filter(Boolean).slice(0, 5);
  }

  private isUniqueId(id: string): boolean {
    try {
      return document.querySelectorAll(`#${cssEscape(id)}`).length === 1;
    } catch {
      return false;
    }
  }

  private limitedStructuralPath(el: Element, maxDepth = 3): string {
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;

    while (node && node !== document.body && depth < maxDepth) {
      const tag = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === node!.tagName);
        const idx = siblings.indexOf(node) + 1;
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
      } else {
        parts.unshift(tag);
      }
      node = parent;
      depth++;
    }

    return parts.join(" > ") || el.tagName.toLowerCase();
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
