import type { EditorAuthoringState, EditorContinuation, EditorSession } from "./runtimeInterfaces";

export const EDITOR_CONTINUATION_KEY = "__movecues_experience_editor_session__";

export function readEditorContinuation(): EditorContinuation | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(EDITOR_CONTINUATION_KEY) ?? "null") as Partial<EditorContinuation & EditorSession> | null;
    const session = value && isSession(value.session) ? value.session : isSession(value) ? value : null;
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      clearEditorContinuation();
      return null;
    }
    return { session, editorState: isEditorState(value?.editorState) ? value.editorState : undefined };
  } catch {
    clearEditorContinuation();
    return null;
  }
}

export function storeEditorContinuation(continuation: EditorContinuation): void {
  try { sessionStorage.setItem(EDITOR_CONTINUATION_KEY, JSON.stringify(continuation)); } catch { /* continuation is best effort */ }
}

export function clearEditorContinuation(): void {
  try { sessionStorage.removeItem(EDITOR_CONTINUATION_KEY); } catch { /* storage may be unavailable */ }
}

function isSession(value: unknown): value is EditorSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<EditorSession>;
  return typeof session.sessionId === "string" && !!session.sessionId && typeof session.accessToken === "string" && !!session.accessToken && typeof session.expiresAt === "string" && Number.isFinite(Date.parse(session.expiresAt));
}

function isEditorState(value: unknown): value is EditorAuthoringState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<EditorAuthoringState>;
  return typeof state.experienceId === "string" && !!state.experienceId && (state.selectedStepId === undefined || typeof state.selectedStepId === "string") && (state.mode === "select" || state.mode === "navigate");
}
