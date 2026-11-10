const ONCE_KEY = "__movcues_experiences_seen__";
const SESSION_KEY = "__movcues_experiences_session_seen__";
const GUIDE_KEY = "__movcues_active_guide__";

export interface GuideProgress {
  experienceId: string;
  versionId: string;
  currentStepId: string;
  status: "active" | "paused";
  impressionId?: string;
  launchContext?: { source: "api" } | { source: "checklist"; sourceExperienceId: string; sourceItemId: string };
  navigationAttempted?: boolean;
  shownRequested?: boolean;
  seenStepIds?: string[];
  completedStepIds?: string[];
  routePath?: string;
}

function read(storage: Storage, key: string): Set<string> {
  try { return new Set(JSON.parse(storage.getItem(key) ?? "[]") as string[]); } catch { return new Set(); }
}

export class ExperienceStateStore {
  constructor(private scope = "") {}
  private key(base: string): string { return this.scope ? `${base}:${this.scope}` : base; }
  hasEver(id: string): boolean { return read(localStorage, this.key(ONCE_KEY)).has(id); }
  hasInSession(id: string): boolean { return read(sessionStorage, this.key(SESSION_KEY)).has(id); }
  markSeen(id: string): void {
    for (const [storage, key] of [[localStorage, ONCE_KEY], [sessionStorage, SESSION_KEY]] as const) {
      const values = read(storage, this.key(key)); values.add(id);
      try { storage.setItem(this.key(key), JSON.stringify([...values])); } catch { /* storage is best effort */ }
    }
  }
  getGuideProgress(): GuideProgress | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(this.key(GUIDE_KEY)) ?? "null") as (Partial<GuideProgress> & { ownerScope?: string }) | null;
      return value && (value.ownerScope ?? "") === this.scope && typeof value.experienceId === "string" && typeof value.versionId === "string" && typeof value.currentStepId === "string" && (value.status === "active" || value.status === "paused") && (value.impressionId === undefined || typeof value.impressionId === "string") ? value as GuideProgress : null;
    } catch { return null; }
  }
  setGuideProgress(progress: GuideProgress): void { try { sessionStorage.setItem(this.key(GUIDE_KEY), JSON.stringify({ ...progress, ownerScope: this.scope })); } catch { /* storage is best effort */ } }
  clearGuideProgress(experienceId?: string): void {
    try { if (!experienceId || this.getGuideProgress()?.experienceId === experienceId) sessionStorage.removeItem(this.key(GUIDE_KEY)); } catch { /* storage is best effort */ }
  }
}
