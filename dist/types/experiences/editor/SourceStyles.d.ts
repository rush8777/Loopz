import postcss from "postcss";
/** Shared source CSS restrictions, mirrored verbatim by the backend. */
export declare function sourceEditingCssErrors(css: string): string[];
/** Edits one existing declaration when isolated, otherwise one bounded per-element rule.
 * PostCSS preserves untouched declarations, comments, whitespace and @media byte-for-byte.
 */
export declare class SourceStyles {
    private widget;
    private root;
    constructor(css: string, widget: HTMLElement);
    toString(): string;
    append(node: postcss.ChildNode): void;
    responsiveStack(element: HTMLElement, enabled: boolean): void;
    removeIdentities(ids: string[]): void;
    private active;
    private matches;
    value(element: HTMLElement, property: string): string | undefined;
    set(element: HTMLElement, property: string, value: string): void;
}
/** IDs are validated Movcues tokens; update only exact attribute selectors inside parsed CSS rules. */
export declare function remapSourceSelector(selector: string, attribute: string, ids: ReadonlyMap<string, string>): string;
