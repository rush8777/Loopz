import type { ElementDescriptor } from "../types/events";
/**
 * Produces a human-debuggable, reasonably-stable CSS selector for an
 * element without depending on brittle nth-child structural paths and
 * without reading any user-generated text content.
 */
export declare class SelectorGenerator {
    generate(el: Element): string;
    describe(el: Element): ElementDescriptor;
    private getClassList;
    private isUniqueId;
    private limitedStructuralPath;
}
