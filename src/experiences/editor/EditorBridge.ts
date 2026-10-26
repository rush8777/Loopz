import type { EditorDraft } from "../types";
import type { SiteThemeTokens } from "../../themes/types";

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
  async saveStyle(name: string, tokens: SiteThemeTokens): Promise<{id:string;name:string;tokens:SiteThemeTokens}> {
    const response=await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets`,{method:"POST",headers:this.headers(),credentials:"omit",body:JSON.stringify({name,tokens})});
    if(!response.ok)throw new Error((await response.json().catch(()=>null) as {error?:string}|null)?.error??"Style could not be saved");return (await response.json() as {preset:{id:string;name:string;tokens:SiteThemeTokens}}).preset;
  }
  async renameStyle(id:string,name:string):Promise<{id:string;name:string;tokens:SiteThemeTokens}>{const response=await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets/${encodeURIComponent(id)}`,{method:"PATCH",headers:this.headers(),credentials:"omit",body:JSON.stringify({name})});if(!response.ok)throw new Error("Style could not be renamed");return(await response.json() as {preset:{id:string;name:string;tokens:SiteThemeTokens}}).preset;}
  async deleteStyle(id:string):Promise<void>{const response=await fetch(`${this.apiBase}/public/experience-editor/${encodeURIComponent(this.sessionId)}/style-presets/${encodeURIComponent(id)}`,{method:"DELETE",headers:this.headers(),credentials:"omit"});if(!response.ok)throw new Error("Style could not be deleted");}
}

export class DraftConflictError extends Error {
  constructor(readonly currentRevision?: number) { super("Draft changed in another editor"); }
}

export class EditorSessionExpiredError extends Error {
  constructor() { super("Editor session expired"); }
}

