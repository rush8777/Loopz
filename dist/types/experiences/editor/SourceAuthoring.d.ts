import { type SourceElement } from "./SourceEditability";
import type { ExperienceContent, WidgetBuilderState } from "../types";
export type SourceAction = {
    type: "dismiss" | "next_step" | "previous_step";
} | {
    type: "open_url";
    url: string;
} | {
    type: "track_event";
    eventName: string;
};
export interface ReplaceMarkupOperation {
    type: "replace_markup";
    stepId?: string;
    widthPx?: number;
    html: string;
    css: string;
    actionBindings: Record<string, SourceAction>;
}
export declare function validateSourceMarkup(operation: ReplaceMarkupOperation, options: {
    widgetType: string;
    guide: boolean;
    survey?: {
        questions: Array<{
            id: string;
            type: string;
            options?: Array<{
                id: string;
            }>;
            min?: number;
            max?: number;
            maxLength?: number;
            required?: boolean;
        }>;
    };
    checklist?: {
        items: Array<{
            id: string;
        }>;
    };
    editable?: boolean;
    previousHtml?: string;
}): string[];
export declare function applySourceMarkup(builder: WidgetBuilderState, content: ExperienceContent, operation: ReplaceMarkupOperation, options: Parameters<typeof validateSourceMarkup>[1]): void;
export declare function sourceContext(builder: WidgetBuilderState, guide: boolean): {
    html: string;
    css: string;
    authoringSurface: "source" | "onsite";
    actionBindings: {};
    supportedActions: readonly ["dismiss", "next_step", "previous_step", "open_url", "track_event"] | readonly ["dismiss", "open_url", "track_event"];
};
/**
 * Keep the structured document useful to the AI without duplicating large inline
 * images that are already present, byte-for-byte, in sourceContext().html.
 */
export declare function aiDocumentContext<T>(value: T): T;
export declare function isSourceAuthored(builder?: WidgetBuilderState): boolean;
export declare function sourceElement(element: Element): SourceElement;
