import type { WidgetBuilderState } from "../types";
import type { RenderCallbacks } from "./AnchoredCardRenderer";
import { type OrdinaryButtonAction as BuilderAction, type OrdinaryButtonContext } from "../OrdinaryButtonAction";
export type { OrdinaryButtonAction as BuilderAction } from "../OrdinaryButtonAction";
export type BuilderRenderCallbacks = RenderCallbacks & {
    onActionId?: (action: BuilderAction, label: string) => void;
};
export declare function mountBuilderContent(root: ShadowRoot, card: HTMLElement, builder: WidgetBuilderState, callbacks: BuilderRenderCallbacks, allowSurveyInputs?: boolean, actionContext?: OrdinaryButtonContext): boolean;
export declare function sanitizeBuilderHtml(input: string, allowSurveyInputs?: boolean): ChildNode[] | null;
export declare function safeBuilderCss(input: string): string | null;
