import type { EditorDraft } from "../types";
export declare class EditorBridge {
    private apiBase;
    private sessionId;
    private accessToken;
    constructor(apiBase: string, sessionId: string, accessToken: string);
    private headers;
    load(): Promise<EditorDraft>;
    save(definition: unknown): Promise<void>;
}
