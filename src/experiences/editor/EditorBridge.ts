import type { EditorDraft } from "../types";

export class EditorBridge {
  constructor(private apiBase: string, private sessionId: string, private accessToken: string) {}
  private headers() { return { "Content-Type": "application/json", Authorization: `Bearer ${this.accessToken}` }; }
  async load(): Promise<EditorDraft> {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { headers: this.headers(), credentials: "omit" });
    if (!response.ok) throw new Error("Editor session expired"); return response.json() as Promise<EditorDraft>;
  }
  async save(definition: unknown, revision: number): Promise<EditorDraft["version"]> {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { method: "PATCH", headers: this.headers(), credentials: "omit", body: JSON.stringify({ definition, revision }) });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; currentRevision?: number } | null;
      if (response.status === 409 && body?.error === "draft_conflict") throw new DraftConflictError(body.currentRevision);
      if (response.status === 401 || response.status === 403 || response.status === 404 || response.status === 410) throw new EditorSessionExpiredError();
      throw new Error("Draft could not be saved");
    }
    const body = await response.json() as { version: EditorDraft["version"] };
    return body.version;
  }
}

export class DraftConflictError extends Error {
  constructor(readonly currentRevision?: number) { super("Draft changed in another editor"); }
}

export class EditorSessionExpiredError extends Error {
  constructor() { super("Editor session expired"); }
}

