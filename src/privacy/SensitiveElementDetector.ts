const SENSITIVE_INPUT_TYPES = new Set(["password", "email", "tel", "credit-card", "cc-number"]);
const SENSITIVE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const PRIVATE_ATTRIBUTES = ["data-private", "data-ignore", "data-analytics-ignore"];

/**
 * Pure DOM inspection helpers used by PrivacyFilter. No event knowledge here -
 * just "is this node, or a value derived from it, sensitive".
 */
export class SensitiveElementDetector {
  isSensitiveFormElement(el: Element): boolean {
    const tag = el.tagName;
    if (!SENSITIVE_TAGS.has(tag)) return false;
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (SENSITIVE_INPUT_TYPES.has(type)) return true;
      // Any free-text input is treated conservatively as potentially sensitive.
      if (type === "text" || type === "search" || type === "number") return true;
    }
    return tag === "TEXTAREA" || tag === "SELECT" ? false : false || tag === "INPUT";
  }

  hasPrivacyMarker(el: Element): boolean {
    return PRIVATE_ATTRIBUTES.some((attr) => el.hasAttribute(attr));
  }

  /** Walk up the tree - if any ancestor (or the element itself) is marked private, the whole subtree is private. */
  isWithinPrivateSubtree(el: Element): boolean {
    let node: Element | null = el;
    while (node) {
      if (this.hasPrivacyMarker(node)) return true;
      node = node.parentElement;
    }
    return false;
  }
}
