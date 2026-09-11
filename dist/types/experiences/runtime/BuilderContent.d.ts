import type { WidgetBuilderState } from "../types";
import type { RenderCallbacks } from "./AnchoredCardRenderer";
export declare function mountBuilderContent(root: ShadowRoot, card: HTMLElement, builder: WidgetBuilderState, callbacks: RenderCallbacks, allowSurveyInputs?: boolean): boolean;
export declare function sanitizeBuilderHtml(input: string, allowSurveyInputs?: boolean): ChildNode[] | null;
export declare function safeBuilderCss(input: string): string | null;
