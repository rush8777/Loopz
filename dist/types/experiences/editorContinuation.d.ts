import type { EditorSession } from "./runtimeInterfaces";
export declare const EDITOR_CONTINUATION_KEY = "__movecues_experience_editor_session__";
export declare function readEditorContinuation(): EditorSession | null;
export declare function storeEditorContinuation(session: EditorSession): void;
export declare function clearEditorContinuation(): void;
