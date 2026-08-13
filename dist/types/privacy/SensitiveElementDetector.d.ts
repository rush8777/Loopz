/**
 * Pure DOM inspection helpers used by PrivacyFilter. No event knowledge here -
 * just "is this node, or a value derived from it, sensitive".
 */
export declare class SensitiveElementDetector {
    isSensitiveFormElement(el: Element): boolean;
    hasPrivacyMarker(el: Element): boolean;
    /** Walk up the tree - if any ancestor (or the element itself) is marked private, the whole subtree is private. */
    isWithinPrivateSubtree(el: Element): boolean;
}
