/** Runtime mirror of the backend-authoritative builder security contract. */
export declare const BUILDER_ALLOWED_TAGS: Set<string>;
export declare const BUILDER_SURVEY_INPUT_TAGS: Set<string>;
export declare const BUILDER_ALLOWED_ATTRIBUTES: Set<string>;
export declare const BUILDER_BLOCKED_TAGS: RegExp;
export declare const BUILDER_UNSAFE_CSS: RegExp;
export declare function builderImageUrlIsSafe(value: string): boolean;
export declare function builderInputTypeIsSafe(value: string): boolean;
export declare function safeScopedBuilderCss(input: string): string | null;
