import type { ElementDescriptor } from "../types/events";
import { computeElementLabel, computeElementRole } from "./ElementLabeler";

const STABLE_DATA_ATTRS = ["data-testid", "data-test", "data-qa", "data-cy", "data-analytics-id"];
const SEMANTIC_ATTRS = ["role", "aria-label", "name", "type", "href"];

// Class tokens that look auto-generated / non-semantic (hashed CSS modules,
// atomic utility classes, etc.) are unreliable across builds and are
// filtered out of selector construction.
const DYNAMIC_CLASS_PATTERN = /^(css-|sc-|jsx-|_|[a-z0-9]{6,}$)/i;

/**
 * Utility-class namespaces from Tailwind (and Tailwind-alike atomic CSS
 * systems) - these describe layout/spacing/color, never element
 * identity, and the same visual component (e.g. a badge or a card)
 * commonly ships a different exact class *combination* per occurrence
 * depending on conditional styling. Treating any of these as part of a
 * "stable class selector" is what produced selectors like
 * `span.inline-flex.items-center.rounded-full.px-2\.5` - visually
 * meaningless and liable to drift release to release. This is a
 * deliberately broad prefix/name list, not a full parse of Tailwind's
 * config - false negatives (an unrecognized utility slipping through)
 * degrade gracefully back to today's behavior; false positives (a
 * genuinely custom, meaningful class getting excluded) are the safer
 * failure direction here since `limitedStructuralPath` is still a
 * reasonable fallback.
 */
const TAILWIND_UTILITY_PATTERN =
  /^(-?(m|p)[trblxy]?-|w-|h-|min-|max-|inset-|top-|right-|bottom-|left-|z-|order-|col-|row-|gap-|space-|grid-|flex-\d|flex$|inline-flex$|inline-block$|inline$|block$|hidden$|table|items-|justify-|content-|self-|place-|text-|font-|leading-|tracking-|whitespace-|break-|truncate$|bg-|from-|via-|to-|border|divide-|rounded|shadow|opacity-|blur-|brightness-|contrast-|grayscale|invert|saturate|sepia|backdrop-|transition|duration-|ease-|delay-|animate-|cursor-|select-|resize-|scroll-|snap-|touch-|pointer-events-|will-change-|appearance-|outline-|ring-|overflow-|overscroll-|absolute$|relative$|fixed$|sticky$|static$|visible$|invisible$|float-|clear-|isolate$|object-|aspect-|columns-|underline$|line-through$|no-underline$|uppercase$|lowercase$|capitalize$|normal-case$|italic$|not-italic$|antialiased$)/;
const TAILWIND_VARIANT_PREFIX_PATTERN =
  /^(sm|md|lg|xl|2xl|hover|focus|active|disabled|dark|group-hover|focus-visible|first|last|odd|even):/;

function isTailwindUtilityClass(cls: string): boolean {
  // Tailwind escapes special characters (., :, /, [, ]) with a backslash
  // when they appear in the class="" attribute itself, e.g. "px-2\.5" or
  // "hover\:bg-blue-500" - undo that before pattern matching.
  const unescaped = cls.replace(/\\/g, "");
  return TAILWIND_UTILITY_PATTERN.test(unescaped) || TAILWIND_VARIANT_PREFIX_PATTERN.test(unescaped);
}

function isStableClass(cls: string): boolean {
  if (!cls) return false;
  if (DYNAMIC_CLASS_PATTERN.test(cls)) return false;
  if (/^\d/.test(cls)) return false;
  if (isTailwindUtilityClass(cls)) return false;
  return true;
}

/**
 * A path segment that looks like a generated record identifier rather
 * than a meaningful route name - UUIDs, pure numeric ids, and
 * prefixed-hex ids like this project's own `trc_96fa356cd0b5439e` /
 * `sess_msxkb167...` style. Canonicalizing these to `:id` is what turns
 * `a[href="/dashboard/incidents/trc_96fa356cd0b5439e"]` and
 * `a[href="/dashboard/incidents/trc_981efdf889a74992"]` (two different
 * incidents, functionally the same link) into the same selector instead
 * of fragmenting one recurring behavior into a distinct "pattern" per
 * record.
 */
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;
const PREFIXED_HEX_ID_SEGMENT = /^[a-z]{1,12}_[0-9a-f]{6,}$/i;
const BARE_HEX_ID_SEGMENT = /^[0-9a-f]{12,}$/i;

function canonicalizePathSegment(segment: string): string {
  if (UUID_SEGMENT.test(segment) || NUMERIC_SEGMENT.test(segment) || PREFIXED_HEX_ID_SEGMENT.test(segment) || BARE_HEX_ID_SEGMENT.test(segment)) {
    return ":id";
  }
  return segment;
}

/**
 * Canonicalizes the path portion of an href for use in a selector.
 * Query string and fragment are dropped entirely (never meaningful for
 * element identity, and query strings can carry incidental PII) rather
 * than canonicalized.
 */
function canonicalizeHref(href: string): string {
  const path = href.split("?")[0].split("#")[0];
  return path
    .split("/")
    .map((segment) => (segment ? canonicalizePathSegment(segment) : segment))
    .join("/");
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
      const rawValue = el.getAttribute(attr);
      if (!rawValue) continue;
      const value = attr === "href" ? canonicalizeHref(rawValue) : rawValue;
      if (value.length < 100) {
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
      label: computeElementLabel(el),
      role: computeElementRole(el),
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
