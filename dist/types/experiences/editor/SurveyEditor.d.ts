import type { SurveyConfig } from '../types';
import type { OnsiteCompositionEditor } from './OnsiteCompositionEditor';
interface Options {
    index(): number;
    composer(): OnsiteCompositionEditor | null;
    canEdit(): boolean;
    flush(): boolean;
    changed(): void;
    stepsChanged(index: number): void;
    error(errors: string[]): void;
}
/** Editor-only Survey controls. The existing cell editor owns layout and history. */
export declare class SurveyEditor {
    private root;
    private survey;
    private options;
    private questionHost;
    private stepHost;
    private dock;
    private style;
    constructor(root: ShadowRoot, survey: SurveyConfig, options: Options);
    sync(): void;
    private destinations;
    private ruleMarkup;
    private onChange;
    private onClick;
    private defaultRule;
    private recompile;
    private value;
    private check;
    destroy(): void;
}
export {};
