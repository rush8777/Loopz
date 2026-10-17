import type { WidgetBuilderState } from "../types";
import type { RenderCallbacks } from "./AnchoredCardRenderer";
export type BuilderAction = {
    id: string;
    type: "next_step" | "previous_step" | "dismiss";
} | {
    id: string;
    type: "open_url";
    url: string;
} | {
    id: string;
    type: "track_event";
    eventName: string;
};
export type BuilderRenderCallbacks = RenderCallbacks & {
    onActionId?: (action: BuilderAction, label: string) => void;
};
export declare function mountBuilderContent(root: ShadowRoot, card: HTMLElement, builder: WidgetBuilderState, callbacks: BuilderRenderCallbacks, allowSurveyInputs?: boolean): boolean;
export declare function sanitizeBuilderHtml(input: string, allowSurveyInputs?: boolean): ChildNode[] | null;
export declare function safeBuilderCss(input: string): string | null;
