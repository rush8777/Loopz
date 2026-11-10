import type { EditorDraft } from "../types";
import type { SiteThemeTokens } from "../../themes/types";
import type { EditorAiProposal } from "./AiEditing";
import { EDITOR_AI_STREAM_MEDIA_TYPE, parseEditorAiStreamEvent, type EditorAiStreamEvent } from "./EditorAiProgress";

export interface EditorAiResponse { conversationId: string; revision: number; markdown: string; proposal: EditorAiProposal | null }

interface EditorAiErrorBody extends Partial<EditorAiResponse> {
  error?: string;
  message?: string;
  currentRevision?: number;
  details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
}

function editorAiErrorMessage(body: EditorAiErrorBody | null): string {
  if (body?.message) return body.message;
  if (!body?.error) return "Geo could not complete this request.";
  const details = [
    ...(body.details?.formErrors ?? []),
    ...Object.entries(body.details?.fieldErrors ?? {}).flatMap(([field, errors]) => errors.map(error => `${field}: ${error}`)),
  ].join(" ");
  return `AI request rejected: ${body.error}${details ? ` — ${details}` : ""}`;
}

export class EditorBridge {
  constructor(private apiBase: string, private sessionId: string, private accessToken: string) {}
  private headers() { return { "Content-Type": "application/json", Authorization: `Bearer ${this.accessToken}` }; }
  async load(): Promise<EditorDraft> {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { headers: this.headers(), credentials: "omit" });
    if ([401, 403, 404, 410].includes(response.status)) throw new EditorSessionExpiredError();
    if (!response.ok) throw new Error("Draft could not be loaded"); return response.json() as Promise<EditorDraft>;
  }
  async save(definition: unknown, revision: number): Promise<EditorDraft["version"]> {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { method: "PATCH", headers: this.headers(), credentials: "omit", body: JSON.stringify({ definition, revision }) });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; currentRevision?: number } | null;
      if (response.status === 409 && body?.error === "draft_conflict") throw new DraftConflictError(body.currentRevision);
      if (response.status === 401 || response.status === 404 || response.status === 410 || (response.status === 403 && body?.error === "invalid_editor_access")) throw new EditorSessionExpiredError();
      throw new Error(body?.error ? `Draft could not be saved: ${body.error}` : "Draft could not be saved");
    }
    const body = await response.json() as { version: EditorDraft["version"] };
    return body.version;
  }
  async chat(input: { conversationId?: string; prompt: string; revision: number; context: unknown }, signal?: AbortSignal, onEvent?: (event: EditorAiStreamEvent) => void): Promise<EditorAiResponse> {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/ai/chat`, { method: "POST", headers: { ...this.headers(), Accept: `${EDITOR_AI_STREAM_MEDIA_TYPE}, application/json` }, credentials: "omit", body: JSON.stringify(input), signal });
    const streaming = response.ok && response.headers?.get?.("content-type")?.toLowerCase().includes(EDITOR_AI_STREAM_MEDIA_TYPE);
    if (streaming) return consumeEditorAiStream(response, onEvent);
    const body = await response.json().catch(() => null) as EditorAiErrorBody | null;
    if (response.status === 409 && body?.error === "draft_conflict") throw new DraftConflictError(body.currentRevision);
    if ([401, 403, 404, 410].includes(response.status) && body?.error !== "conversation_not_found") throw new EditorSessionExpiredError();
    if (!response.ok) throw new EditorAiRequestError(editorAiErrorMessage(body), body?.conversationId);
    return body as EditorAiResponse;
  }
  async saveStyle(name: string, tokens: SiteThemeTokens): Promise<{id:string;name:string;tokens:SiteThemeTokens}> {
    const response=await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets`,{method:"POST",headers:this.headers(),credentials:"omit",body:JSON.stringify({name,tokens})});
    if(!response.ok)throw new Error((await response.json().catch(()=>null) as {error?:string}|null)?.error??"Style could not be saved");return (await response.json() as {preset:{id:string;name:string;tokens:SiteThemeTokens}}).preset;
  }
  async renameStyle(id:string,name:string):Promise<{id:string;name:string;tokens:SiteThemeTokens}>{const response=await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets/${encodeURIComponent(id)}`,{method:"PATCH",headers:this.headers(),credentials:"omit",body:JSON.stringify({name})});if(!response.ok)throw new Error("Style could not be renamed");return(await response.json() as {preset:{id:string;name:string;tokens:SiteThemeTokens}}).preset;}
  async deleteStyle(id:string):Promise<void>{const response=await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets/${encodeURIComponent(id)}`,{method:"DELETE",headers:this.headers(),credentials:"omit"});if(!response.ok)throw new Error("Style could not be deleted");}
}

async function consumeEditorAiStream(response: Response, onEvent?: (event: EditorAiStreamEvent) => void): Promise<EditorAiResponse> {
  if (!response.body) throw new EditorAiRequestError("The AI progress stream ended before a result was received.");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffered = ""; let requestId = ""; let sequence = 0; let terminal: EditorAiStreamEvent | null = null;
  const accept = (line: string) => {
    if (!line.trim()) return;
    if (line.length > 350_000) throw new EditorAiRequestError("The AI progress stream contained an oversized event.");
    const event = parseEditorAiStreamEvent(line);
    if (requestId && event.requestId !== requestId) throw new EditorAiRequestError("The AI progress stream changed request identity.");
    if (event.sequence <= sequence) throw new EditorAiRequestError("The AI progress stream contained a stale or duplicate update.");
    if (terminal) throw new EditorAiRequestError("The AI progress stream contained more than one terminal event.");
    requestId = event.requestId; sequence = event.sequence;
    try { onEvent?.(event); } catch { /* Rendering progress must not fail the request. */ }
    if (event.type === "result" || event.type === "error") terminal = event;
  };
  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    let newline: number;
    while ((newline = buffered.indexOf("\n")) >= 0) { const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1); accept(line); }
    if (done) break;
  }
  buffered += decoder.decode(); if (buffered.trim()) accept(buffered);
  const completed = terminal as Extract<EditorAiStreamEvent, { type: "result" | "error" }> | null;
  if (!completed) throw new EditorAiRequestError("The AI progress stream was interrupted before completion.");
  if (completed.type === "error") throw new EditorAiRequestError(completed.message, completed.conversationId);
  return completed.result;
}

export class DraftConflictError extends Error {
  constructor(readonly currentRevision?: number) { super("Draft changed in another editor"); }
}

export class EditorSessionExpiredError extends Error {
  constructor() { super("Editor session expired"); }
}

export class EditorAiRequestError extends Error {
  constructor(message: string, readonly conversationId?: string) { super(message); }
}

