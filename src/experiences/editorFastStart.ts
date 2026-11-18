import type { EditorDraft } from "./types";
import type { EditorSession } from "./runtimeInterfaces";

/** An exchange response can carry the initial authorized draft on newer backends. */
export interface FastEditorSession {
  session: EditorSession;
  draft?: EditorDraft;
}

function isEditorSession(value: unknown): value is EditorSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<EditorSession>;
  return typeof session.sessionId === "string" && !!session.sessionId
    && typeof session.accessToken === "string" && !!session.accessToken
    && typeof session.expiresAt === "string" && Number.isFinite(Date.parse(session.expiresAt))
    && Date.parse(session.expiresAt) > Date.now();
}

function isEditorDraft(value: unknown): value is EditorDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<EditorDraft>;
  return typeof draft.experience?.id === "string"
    && typeof draft.version?.revision === "number"
    && !!draft.version.definition;
}

/** Begin the single-use exchange while the editor JavaScript is still downloading. */
export async function exchangeEditorSession(apiBase: string, token: string): Promise<FastEditorSession | null> {
  try {
    const response = await fetch(`${apiBase}/public/experience-editor/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return null;
    const data = await response.json() as Partial<EditorSession> & { draft?: unknown };
    if (!isEditorSession(data)) return null;
    return { session: data, ...(isEditorDraft(data.draft) ? { draft: data.draft } : {}) };
  } catch {
    return null;
  }
}

/** Fresh, access-controlled draft, fetched in parallel with editor JavaScript on page reloads. */
export async function prefetchEditorDraft(apiBase: string, session: EditorSession): Promise<EditorDraft | null> {
  try {
    if (!isEditorSession(session)) return null;
    const response = await fetch(`${apiBase}/public/experience-editor/${encodeURIComponent(session.sessionId)}/draft`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const draft = await response.json() as unknown;
    return isEditorDraft(draft) ? draft : null;
  } catch {
    return null;
  }
}
