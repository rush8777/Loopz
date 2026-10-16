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
    onSelectionChange(selection: OnsiteComponentSelection | null): void;
}
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
    private onPointerOver;
    private onPointerOut;
    private onClick;
    private onDoubleClick;
    private onInput;
    private onCompositionStart;
    private onCompositionEnd;
    private onKeyDown;
    private onPaste;
    private componentFrom;
    private selectionKind;
    private emitSelection;
    private finishEditing;
    private getSelection;
    private rememberSelection;
    private restoreSelection;
    private wrapSelection;
    private serialize;
    private syncStructuredContent;
    private commit;
    private pushHistory;
    private moveHistory;
    private componentKey;
    private findByKey;
    private scheduleOutline;
    private renderOutline;
}
export {};
