import type { EditorDraft, RuntimeChecklistDefinition } from '../types';
import type { ChecklistView } from '../checklist/ChecklistMarkup';
import type { OnsiteCompositionEditor } from './OnsiteCompositionEditor';
interface Options {
    composer(): OnsiteCompositionEditor | null;
    canEdit(): boolean;
    flush(): boolean;
    changed(): void;
    render(): void;
    error(errors: string[]): void;
}
export declare class ChecklistEditor {
    private root;
    private definition;
    private references;
    private options;
    private renderer;
    private step;
    private task;
    private tools;
    private style;
    private view;
    private preview;
    private completed;
    private sample;
    constructor(root: ShadowRoot, definition: RuntimeChecklistDefinition, references: NonNullable<EditorDraft['references']>, options: Options);
    sync(): void;
    render(id: string, versionId: string, preview: boolean): boolean;
    applyDesign(id: string): void;
    private host;
    private closeMobileInspector;
    private transition;
    getView(): ChecklistView;
    setDefinition(value: RuntimeChecklistDefinition): void;
    private onChange;
    private onClick;
    private value;
    private check;
    private hide;
    destroyView(): void;
    destroy(): void;
}
export {};
