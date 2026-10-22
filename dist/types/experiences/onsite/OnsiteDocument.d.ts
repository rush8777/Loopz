import type { ExperienceContent, WidgetBuilderState, WidgetType } from "../types";
export declare const ONSITE_SCHEMA_VERSION: 2;
export declare const ONSITE_LIMITS: {
    readonly maxDepth: 8;
    readonly maxNodes: 120;
    readonly maxRichText: 10000;
    readonly maxImageUrl: 2000;
    readonly maxSerializedBytes: 250000;
    readonly minFixedSize: 24;
    readonly maxFixedSize: 1200;
};
export type OnsiteDirection = "row" | "column";
export type OnsiteSizing = {
    mode: "flexible";
    weight: number;
} | {
    mode: "hug";
} | {
    mode: "fixed";
    value: number;
};
export interface OnsiteSpacing {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface OnsiteCellStyle {
    background?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
}
export interface OnsiteCell {
    type: "cell";
    id: string;
    direction: OnsiteDirection;
    sizing: OnsiteSizing;
    align: "start" | "center" | "end" | "stretch";
    justify: "start" | "center" | "end" | "space-between";
    gap: number;
    padding: OnsiteSpacing;
    responsiveStack?: boolean;
    style?: OnsiteCellStyle;
    children?: OnsiteCell[];
    block?: OnsiteBlock;
}
interface BlockBase {
    id: string;
    align?: "left" | "center" | "right";
}
export type OnsiteButtonAction = {
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
export type OnsiteBlock = (BlockBase & {
    type: "heading";
    html: string;
    level: 1 | 2 | 3 | 4;
    fontSize: number;
    weight: 400 | 500 | 600 | 700;
    color?: string;
    lineHeight?: number;
}) | (BlockBase & {
    type: "text";
    html: string;
    fontSize: number;
    weight: 400 | 500 | 600 | 700;
    color?: string;
    lineHeight?: number;
}) | (BlockBase & {
    type: "button";
    label: string;
    action: OnsiteButtonAction;
    variant: "primary" | "secondary" | "outline";
    background?: string;
    color?: string;
    radius: number;
    paddingX: number;
    paddingY: number;
    width: "hug" | "full";
}) | (BlockBase & {
    type: "image";
    src: string;
    alt: string;
    fit: "contain" | "cover";
    width: number;
    height?: number;
    radius: number;
}) | (BlockBase & {
    type: "divider";
    orientation: "horizontal" | "vertical";
    thickness: number;
    color: string;
}) | (BlockBase & {
    type: "spacer";
    size: number;
}) | (BlockBase & {
    type: "icon";
    icon: OnsiteIcon;
    size: number;
    color?: string;
});
export type OnsiteIcon = "check" | "star" | "info" | "warning" | "sparkles" | "arrow" | "heart" | "rocket";
export interface OnsiteDocument {
    schemaVersion: 2;
    id: string;
    root: OnsiteCell;
}
export interface CompiledOnsiteDocument {
    html: string;
    css: string;
    content: ExperienceContent;
    actionBindings: Record<string, OnsiteButtonAction>;
}
export interface OnsiteValidationResult {
    valid: boolean;
    errors: string[];
}
export declare function onsiteId(prefix?: "document" | "cell" | "block" | "action"): string;
export declare function emptyCell(block?: OnsiteBlock): OnsiteCell;
export declare function createBlock(type: OnsiteBlock["type"], guide?: boolean): OnsiteBlock;
export declare function createOnsiteDocument(guide?: boolean): OnsiteDocument;
export declare function onsiteDocumentFromBuilder(builder?: WidgetBuilderState): OnsiteDocument | null;
export declare function applyOnsiteDocument(builder: WidgetBuilderState, document: OnsiteDocument, widgetType: WidgetType | "anchored_card" | "modal"): CompiledOnsiteDocument;
export declare function compileOnsiteDocument(document: OnsiteDocument, widgetType: string): CompiledOnsiteDocument;
export declare function validateOnsiteDocument(value: unknown): OnsiteValidationResult;
export declare function findCell(document: OnsiteDocument, id: string): OnsiteCell | null;
export declare function findBlock(document: OnsiteDocument, id: string): OnsiteBlock | null;
export declare function parentCell(document: OnsiteDocument, id: string): OnsiteCell | null;
export declare function cellForBlock(document: OnsiteDocument, id: string): OnsiteCell | null;
export declare function listBlocks(cell: OnsiteCell): OnsiteBlock[];
export declare function splitCell(document: OnsiteDocument, cellId: string, direction: OnsiteDirection): string | null;
export declare function insertEdgeCell(document: OnsiteDocument, edge: "top" | "right" | "bottom" | "left"): string;
/** Insert beside one cell, wrapping only that cell when its parent's axis differs. */
export declare function insertAdjacentCell(document: OnsiteDocument, cellId: string, edge: "top" | "right" | "bottom" | "left"): string | null;
export declare function removeCell(document: OnsiteDocument, id: string): boolean;
export declare function moveCell(document: OnsiteDocument, id: string, delta: -1 | 1): boolean;
export declare function resizeSiblings(document: OnsiteDocument, firstId: string, secondId: string, firstWeight: number): boolean;
export declare function duplicateCell(document: OnsiteDocument, id: string): string | null;
export declare function duplicateDocument(document: OnsiteDocument): OnsiteDocument;
export declare function cloneOnsite<T>(value: T): T;
export declare function migrateV1Builder(builder: WidgetBuilderState, content: ExperienceContent, widgetType: WidgetType | "anchored_card" | "modal", guide?: boolean): OnsiteDocument | null;
export declare function sanitizeRichText(input: string): string;
export {};
