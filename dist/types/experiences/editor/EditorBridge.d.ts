import type { EditorDraft } from "../types";
export declare class EditorBridge {
    private apiBase;
    private sessionId;
    private accessToken;
    constructor(apiBase: string, sessionId: string, accessToken: string);
    private headers;
    load(): Promise<EditorDraft>;
    save(definition: unknown, revision: number): Promise<EditorDraft["version"]>;
}
export declare class DraftConflictError extends Error {
    readonly currentRevision?: number | undefined;
    constructor(currentRevision?: number | undefined);
}
export declare class EditorSessionExpiredError extends Error {
    constructor();
}
