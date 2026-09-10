import type { EditorSession } from "./runtimeInterfaces";

export const EDITOR_CONTINUATION_KEY = "__movecues_experience_editor_session__";

export function readEditorContinuation(): EditorSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(EDITOR_CONTINUATION_KEY) ?? "null") as Partial<EditorSession> | null;
    if (!value || typeof value.sessionId !== "string" || !value.sessionId || typeof value.accessToken !== "string" || !value.accessToken || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) {
      clearEditorContinuation();
      return null;
    }
    return value as EditorSession;
  } catch {
    clearEditorContinuation();
    return null;
  }
}

export function storeEditorContinuation(session: EditorSession): void {
  try { sessionStorage.setItem(EDITOR_CONTINUATION_KEY, JSON.stringify(session)); } catch { /* continuation is best effort */ }
}

export function clearEditorContinuation(): void {
  try { sessionStorage.removeItem(EDITOR_CONTINUATION_KEY); } catch { /* storage may be unavailable */ }
}
