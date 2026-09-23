import type { ExperienceDesign, ExperienceSize, WidgetType } from "../types";
interface WidgetSizeConstraint {
    width: {
        default: number | "full";
        min?: number;
        max?: number;
        allowFull?: boolean;
    };
    height: {
        allowFixed?: boolean;
        allowViewport?: boolean;
        min?: number;
        max?: number;
    };
    viewportGutter: number;
}
export declare const WIDGET_SIZE_CONSTRAINTS: Record<WidgetType, WidgetSizeConstraint>;
export declare function normalizeWidgetSize(widgetType: WidgetType, design: ExperienceDesign): ExperienceSize;
export declare function applyWidgetSizeEnvelope(card: HTMLElement, widgetType: WidgetType, design: ExperienceDesign): void;
export declare function applyBuilderSizeContent(card: HTMLElement, widgetType: WidgetType, design: ExperienceDesign): void;
export {};
