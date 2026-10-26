import type { EditorDraft } from "../types";
import type { SiteThemeTokens } from "../../themes/types";
export declare class EditorBridge {
    private apiBase;
    private sessionId;
    private accessToken;
    constructor(apiBase: string, sessionId: string, accessToken: string);
    private headers;
    load(): Promise<EditorDraft>;
    save(definition: unknown, revision: number): Promise<EditorDraft["version"]>;
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
