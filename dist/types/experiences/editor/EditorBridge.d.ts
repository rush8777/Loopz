import type { CapturePlan, CapturePreview, GuideCaptureCheckpoint, GuideCaptureRevision, StoredGuideCapture } from "./GuideCaptureTypes";
import type { EditorDraft } from "../types";
import type { SiteThemeTokens } from "../../themes/types";
import type { EditorAiProposal } from "./AiEditing";
import { type EditorAiStreamEvent } from "./EditorAiProgress";
export interface EditorAiResponse {
    conversationId: string;
    revision: number;
    markdown: string;
    proposal: EditorAiProposal | null;
}
export declare class EditorBridge {
    private apiBase;
    private sessionId;
    private accessToken;
    constructor(apiBase: string, sessionId: string, accessToken: string);
    private headers;
    load(): Promise<EditorDraft>;
    /** Validate session liveness without downloading a full guide every 15 seconds.
     * A 404 falls back to the old draft endpoint during a staggered deployment. */
    checkSession(): Promise<void>;
    save(definition: unknown, revision: number): Promise<EditorDraft["version"]>;
    loadCapture(): Promise<StoredGuideCapture>;
    saveCapture(checkpoint: GuideCaptureCheckpoint, checkpointRevision: number): Promise<{
        checkpointRevision: number;
    }>;
    planCapture(input: GuideCaptureRevision & {
        prompt: string;
    }, signal: AbortSignal): Promise<{
        plan: CapturePlan;
    }>;
    previewCapture(input: GuideCaptureRevision & {
        plan: CapturePlan;
    }, signal: AbortSignal): Promise<CapturePreview>;
    applyCapture(input: GuideCaptureRevision & {
        plan: CapturePlan;
        previewTicket: string;
    }): Promise<{
        version: EditorDraft["version"];
    }>;
    private captureRequest;
    chat(input: {
        conversationId?: string;
        prompt: string;
        revision: number;
        context: unknown;
    }, signal?: AbortSignal, onEvent?: (event: EditorAiStreamEvent) => void): Promise<EditorAiResponse>;
    saveStyle(name: string, tokens: SiteThemeTokens): Promise<{
        id: string;
        name: string;
        tokens: SiteThemeTokens;
    }>;
    renameStyle(id: string, name: string): Promise<{
        id: string;
        name: string;
        tokens: SiteThemeTokens;
    }>;
    deleteStyle(id: string): Promise<void>;
}
export declare class DraftConflictError extends Error {
    readonly currentRevision?: number | undefined;
    constructor(currentRevision?: number | undefined);
}
export declare class EditorSessionExpiredError extends Error {
    constructor();
}
export declare class EditorAiRequestError extends Error {
    readonly conversationId?: string | undefined;
    constructor(message: string, conversationId?: string | undefined);
}
export declare class CaptureRequestError extends Error {
    readonly code: string | undefined;
    constructor(code: string | undefined, message: string);
}
