import type { EditorAiResponse } from "./EditorBridge";
export declare const EDITOR_AI_STREAM_MEDIA_TYPE = "application/x-ndjson";
export type EditorAiProgressStage = "creating" | "checking" | "repairing" | "rechecking" | "ready";
export type EditorAiStreamEvent = {
    type: "progress";
    requestId: string;
    sequence: number;
    elapsedMs: number;
    stage: EditorAiProgressStage;
    detail: string;
    attempt: 1 | 2;
} | {
    type: "heartbeat";
    requestId: string;
    sequence: number;
    elapsedMs: number;
} | {
    type: "result";
    requestId: string;
    sequence: number;
    elapsedMs: number;
    result: EditorAiResponse;
} | {
    type: "error";
    requestId: string;
    sequence: number;
    elapsedMs: number;
    error: string;
    message: string;
    conversationId?: string;
};
export declare function parseEditorAiStreamEvent(line: string): EditorAiStreamEvent;
