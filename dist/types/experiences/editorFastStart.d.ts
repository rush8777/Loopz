import type { EditorDraft } from "./types";
import type { EditorSession } from "./runtimeInterfaces";
/** An exchange response can carry the initial authorized draft on newer backends. */
export interface FastEditorSession {
    session: EditorSession;
    draft?: EditorDraft;
}
/** Begin the single-use exchange while the editor JavaScript is still downloading. */
export declare function exchangeEditorSession(apiBase: string, token: string): Promise<FastEditorSession | null>;
/** Fresh, access-controlled draft, fetched in parallel with editor JavaScript on page reloads. */
export declare function prefetchEditorDraft(apiBase: string, session: EditorSession): Promise<EditorDraft | null>;
