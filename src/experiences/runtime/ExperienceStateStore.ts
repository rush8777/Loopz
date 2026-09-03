const ONCE_KEY = "__loopz_experiences_seen__";
const SESSION_KEY = "__loopz_experiences_session_seen__";

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
}

