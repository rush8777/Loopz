const ONCE_KEY = "__movecues_experiences_seen__";
const SESSION_KEY = "__movecues_experiences_session_seen__";
const GUIDE_KEY = "__movecues_active_guide__";

export interface GuideProgress {
  experienceId: string;
  versionId: string;
  currentStepId: string;
  status: "active" | "paused";
  impressionId?: string;
  launchContext?: { source: "api" } | { source: "checklist"; sourceExperienceId: string; sourceItemId: string };
  navigationAttempted?: boolean;
}

function read(storage: Storage, key: string): Set<string> {
  try { return new Set(JSON.parse(storage.getItem(key) ?? "[]") as string[]); } catch { return new Set(); }
}

export class ExperienceStateStore {
  hasEver(id: string): boolean { return read(localStorage, ONCE_KEY).has(id); }
  hasInSession(id: string): boolean { return read(sessionStorage, SESSION_KEY).has(id); }
  markSeen(id: string): void {
    for (const [storage, key] of [[localStorage, ONCE_KEY], [sessionStorage, SESSION_KEY]] as const) {
      const values = read(storage, key); values.add(id);
      try { storage.setItem(key, JSON.stringify([...values])); } catch { /* storage is best effort */ }
    }
  }
  getGuideProgress(): GuideProgress | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(GUIDE_KEY) ?? "null") as Partial<GuideProgress> | null;
      return value && typeof value.experienceId === "string" && typeof value.versionId === "string" && typeof value.currentStepId === "string" && (value.status === "active" || value.status === "paused") && (value.impressionId === undefined || typeof value.impressionId === "string") ? value as GuideProgress : null;
    } catch { return null; }
  }
  setGuideProgress(progress: GuideProgress): void { try { sessionStorage.setItem(GUIDE_KEY, JSON.stringify(progress)); } catch { /* storage is best effort */ } }
  clearGuideProgress(experienceId?: string): void {
    try { if (!experienceId || this.getGuideProgress()?.experienceId === experienceId) sessionStorage.removeItem(GUIDE_KEY); } catch { /* storage is best effort */ }
  }
}
