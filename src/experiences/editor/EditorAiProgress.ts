import type { EditorAiResponse } from "./EditorBridge";

export const EDITOR_AI_STREAM_MEDIA_TYPE = "application/x-ndjson";
export type EditorAiProgressStage = "creating" | "checking" | "repairing" | "rechecking" | "ready";

export type EditorAiStreamEvent =
  | { type: "progress"; requestId: string; sequence: number; elapsedMs: number; stage: EditorAiProgressStage; detail: string; attempt: 1 | 2 }
  | { type: "heartbeat"; requestId: string; sequence: number; elapsedMs: number }
  | { type: "result"; requestId: string; sequence: number; elapsedMs: number; result: EditorAiResponse }
  | { type: "error"; requestId: string; sequence: number; elapsedMs: number; error: string; message: string; conversationId?: string };

export function parseEditorAiStreamEvent(line: string): EditorAiStreamEvent {
  const value = JSON.parse(line) as Partial<EditorAiStreamEvent>;
  if (!value || typeof value !== "object" || !["progress", "heartbeat", "result", "error"].includes(value.type ?? "") || typeof value.requestId !== "string" || !value.requestId || !Number.isSafeInteger(value.sequence) || (value.sequence ?? 0) < 1 || !Number.isFinite(value.elapsedMs) || (value.elapsedMs ?? -1) < 0) throw new Error("The AI progress stream contained an invalid event.");
  if (value.type === "progress" && (!(["creating", "checking", "repairing", "rechecking", "ready"] as string[]).includes(value.stage ?? "") || typeof value.detail !== "string" || ![1, 2].includes(value.attempt ?? 0))) throw new Error("The AI progress stream contained an invalid progress update.");
  if (value.type === "result" && (!value.result || typeof value.result.conversationId !== "string" || typeof value.result.revision !== "number" || typeof value.result.markdown !== "string")) throw new Error("The AI progress stream contained an invalid result.");
  if (value.type === "error" && (typeof value.error !== "string" || typeof value.message !== "string")) throw new Error("The AI progress stream contained an invalid error.");
  return value as EditorAiStreamEvent;
}
