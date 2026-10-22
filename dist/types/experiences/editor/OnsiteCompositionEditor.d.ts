import type { ExperienceContent, WidgetBuilderState, WidgetType } from "../types";
import { type OnsiteBlock, type OnsiteCell, type OnsiteDocument, type OnsiteSizing } from "../onsite/OnsiteDocument";
export type CompositionSelection = {
    kind: "step";
    label: string;
} | {
    kind: "cell";
    label: string;
    cellId: string;
} | {
    kind: "block";
    label: string;
    cellId: string;
    blockId: string;
    blockType: OnsiteBlock["type"];
};
interface Callbacks {
    onChange(): void;
    onSelectionChange(selection: CompositionSelection): void;
    onValidation(errors: string[]): void;
    onImageStatus?(message: string): void;
}
type CellEdge = "top" | "right" | "bottom" | "left";
/** Structured on-site authoring. It is imported only by the lazy editor bundle. */
export declare class OnsiteCompositionEditor {
    private root;
    private builder;
    private content;
    private widgetType;
    private guide;
    private callbacks;
    private document;
    private surface;
    private toolbar;
    private palette;
    private edgeButtons;
    private insertion;
    private paletteAnchor;
    private toolFrame;
    private handles;
    private selection;
    private history;
    private historyIndex;
    private historyBytes;
    private compileTimer;
    private typingTimer;
    private composing;
    private resizeCleanup;
    private resizeFrame;
    private destroyed;
    private readonly migrated;
    private imageInput;
    private imageFileTarget;
    private imageRequest;
    private imagePlaceholders;
    private imageDropTarget;
    constructor(root: ShadowRoot, builder: WidgetBuilderState, content: ExperienceContent, widgetType: WidgetType | "anchored_card" | "modal", guide: boolean, callbacks: Callbacks);
    start(): void;
    getDocument(): OnsiteDocument;
    getSelection(): CompositionSelection;
    getSelectedCell(): OnsiteCell | null;
    getSelectedBlock(): OnsiteBlock | null;
    canUndo(): boolean;
    canRedo(): boolean;
    isComposing(): boolean;
    getValidation(): string[];
    flush(): boolean;
    snapshot(): {
        builder: WidgetBuilderState;
        content: ExperienceContent;
    };
    undo(): void;
    redo(): void;
    selectStep(): void;
    selectParent(): void;
    selectChild(): void;
    insertBlock(type: OnsiteBlock["type"], insertion?: {
        cellId: string;
        edge: CellEdge;
    }): boolean;
    split(direction: "row" | "column"): boolean;
    addEdge(edge: "top" | "right" | "bottom" | "left"): void;
    duplicate(): boolean;
    remove(): boolean;
    move(delta: -1 | 1): boolean;
    updateCell(update: Partial<Pick<OnsiteCell, "direction" | "align" | "justify" | "gap" | "padding" | "style" | "responsiveStack">> & {
        sizing?: OnsiteSizing;
    }): void;
    updateBlock(update: Partial<OnsiteBlock>): void;
    chooseImageFile(blockId?: string): void;
    setImageSource(src: string): boolean;
    setImageFile(file: File, blockId?: string): Promise<boolean>;
    updateButtonAction(action: {
        type: "next_step" | "previous_step" | "dismiss";
    } | {
        type: "open_url";
        url: string;
    } | {
        type: "track_event";
        eventName: string;
    }): void;
    editSelected(): void;
    setAlignment(align: "left" | "center" | "right"): void;
    formatInline(tag: "strong" | "em" | "u"): boolean;
    toggleList(tag: "ul" | "ol"): boolean;
    applyLink(url: string): boolean;
    private wrapSelection;
    private select;
    private beforeTransaction;
    private commit;
    private compileAndPatch;
    private scheduleCompile;
    private repairDocumentStructure;
    private pushHistory;
    private restore;
    private onSurfaceClick;
    private onImageDragOver;
    private onImageDragLeave;
    private clearImageDrop;
    private onImageDrop;
    private onDoubleClick;
    private onInput;
    private onBlur;
    private onCompositionStart;
    private onCompositionEnd;
    private onSurfaceKeyDown;
    private onToolbarClick;
    private onPaletteClick;
    private openPalette;
    private closePalette;
    private dismissPalette;
    private onPaletteKeyDown;
    private syncToolbarState;
    private positionTools;
    private updateToolPositions;
    private availableCanvasBounds;
    private renderResizeHandles;
    private positionHandles;
    private startResize;
    private resizeWithKeyboard;
    destroy(): void;
}
export {};
