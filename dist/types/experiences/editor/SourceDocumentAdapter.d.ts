import { type OnsiteChecklistContext } from "../checklist/ChecklistMarkup";
import type { ExperienceContent, SurveyQuestion, WidgetBuilderState } from "../types";
import { type OnsiteDocument } from "../onsite/OnsiteDocument";
import { validateSourceMarkup } from "./SourceAuthoring";
type Options = Parameters<typeof validateSourceMarkup>[1];
export interface SourceSnapshot {
    builder: WidgetBuilderState;
    content: ExperienceContent;
}
/** Storage adapter only. The document is an ephemeral inspector/interaction view;
 * it is never compiled into, or saved as, a structured onsiteDocument.
 */
export declare class SourceDocumentAdapter {
    private builder;
    private content;
    private options;
    readonly upgraded: boolean;
    private view;
    private root;
    private duplicates;
    private pendingHtml;
    constructor(builder: WidgetBuilderState, content: ExperienceContent, options: Options);
    setContracts(questions?: NonNullable<Options["survey"]>["questions"], items?: NonNullable<Options["checklist"]>["items"]): void;
    getDocument(): OnsiteDocument;
    snapshot(): SourceSnapshot;
    restore(snapshot: SourceSnapshot, view: OnsiteDocument): void;
    captureButtonHtml(blockId: string, html: string): void;
    refresh(): void;
    synchronizeQuestion(next: SurveyQuestion, current: SurveyQuestion, questions: SurveyQuestion[]): void;
    synchronizeChecklist(next: OnsiteChecklistContext): void;
    duplicate(from: string, to: string): void;
    removeCell(view: OnsiteDocument, id: string): boolean;
    isProtected(cellId: string): boolean;
    componentIsCell(id: string): boolean;
    canResize(parentId: string): boolean;
    validate(view: OnsiteDocument): string[];
    apply(view: OnsiteDocument): {
        html: string;
        css: string;
        content: ExperienceContent;
    };
    private operation;
    prepareSurface(surface: HTMLElement): void;
    private element;
    private styles;
    private addLegacyIdentities;
    private project;
    private candidate;
    private cloneDuplicate;
    private newBlock;
    private updateCell;
    private updateBlock;
}
export {};
