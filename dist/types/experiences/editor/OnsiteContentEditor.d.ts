import type { ExperienceContent, WidgetBuilderState } from "../types";
export type OnsiteComponentKind = "text" | "button" | "image";
export interface OnsiteComponentSelection {
    kind: OnsiteComponentKind;
    label: string;
    editing: boolean;
    src?: string;
    alt?: string;
}
interface Callbacks {
    onChange(): void;
    onValidation?(errors: string[]): void;
    onSelectionChange(selection: OnsiteComponentSelection | null): void;
}
export declare function componentPlainText(element: Element): string;
/** Delegated direct-content editing scoped to one rendered experience surface.
 * It never observes or scans the customer document and never serializes its UI. */
export declare class OnsiteContentEditor {
    private root;
    private builder;
    private content;
    private callbacks;
    private surface;
    private selected;
    private hovered;
    private outline;
    private style;
    private frame;
    private composing;
    private savedRange;
    private history;
    private transactionTimer;
    private pending;
    private errors;
    private fieldErrors;
    private deferredFinish;
    private tabStops;
    private historyIndex;
    constructor(root: ShadowRoot, builder: WidgetBuilderState, content: ExperienceContent, callbacks: Callbacks);
    start(): boolean;
    destroy(): void;
    editSelected(): void;
    deselect(): void;
    formatInline(tag: "strong" | "em" | "u"): void;
    applyLink(url: string): boolean;
    setAlignment(alignment: "left" | "center" | "right"): void;
    toggleList(kind: "ul" | "ol"): void;
    updateImage(src: string, alt: string): boolean;
    undo(): boolean;
    redo(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;
    private makeFocusable;
    private onFocus;
    private onPointerOver;
    private onPointerOut;
    private onClick;
    private onDoubleClick;
    private onOutsidePointer;
    private onInput;
    private onCompositionStart;
    private onCompositionEnd;
    private onBeforeInput;
    private onDrop;
    private onKeyDown;
    private onPaste;
    private componentFrom;
    private selectionKind;
    private emitSelection;
    private isEditing;
    isComposing(): boolean;
    private finishEditing;
    rememberSelection: () => void;
    private restoreSelection;
    private wrapSelection;
    private serialize;
    private syncStructuredContent;
    snapshot(): {
        builder: WidgetBuilderState;
        content: ExperienceContent;
    };
    getValidation(): string[];
    /** Flush DOM into the draft before saving or replacing a rendered step. */
    flush(): boolean;
    private commit;
    private sanitizeActive;
    private beforeOperation;
    private selectionOffsets;
    private selectionState;
    private restoreOffsets;
    private pushHistory;
    private moveHistory;
    private componentKey;
    private findByKey;
    private scheduleOutline;
    private renderOutline;
}
export {};
