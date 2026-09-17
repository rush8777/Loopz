export interface StackingContextEntry {
    element: Element;
    zIndex: number | null;
    createsStackingContext: boolean;
}
export interface StackingContextInfo {
    /** The outermost context that controls how the target participates in the document stack. */
    element: Element | null;
    zIndex: number;
    /** Ordered from the inspected element toward the document root. */
    chain: StackingContextEntry[];
}
export declare class StackingContextResolver {
    resolve(element: Element | null): StackingContextInfo;
}
