import type { EditorDraft } from "../types";

export class EditorBridge {
  constructor(private apiBase: string, private sessionId: string, private accessToken: string) {}
  private headers() { return { "Content-Type": "application/json", Authorization: `Bearer ${this.accessToken}` }; }
  async load(): Promise<EditorDraft> {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { headers: this.headers(), credentials: "omit" });
    if (!response.ok) throw new Error("Editor session expired"); return response.json() as Promise<EditorDraft>;
  }
  async save(definition: unknown): Promise<void> {
    const response = await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/draft`, { method: "PATCH", headers: this.headers(), credentials: "omit", body: JSON.stringify({ definition }) });
    if (!response.ok) throw new Error("Draft could not be saved");
  }
}

