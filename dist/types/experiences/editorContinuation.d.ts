import type { EditorContinuation } from "./runtimeInterfaces";
export declare const EDITOR_CONTINUATION_KEY = "__movecues_experience_editor_session__";
export declare function readEditorContinuation(): EditorContinuation | null;
export declare function storeEditorContinuation(continuation: EditorContinuation): void;
export declare function clearEditorContinuation(): void;
