import { E as ExperienceRenderer } from "./ExperienceRenderer-DBO1IkW7.js";
class EligibilityEngine {
  choose(experiences) {
    return [...experiences].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
  }
}
const ONCE_KEY = "__loopz_experiences_seen__";
const SESSION_KEY = "__loopz_experiences_session_seen__";
function read(storage, key) {
  try {
    return new Set(JSON.parse(storage.getItem(key) ?? "[]"));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
class ExperienceStateStore {
  hasEver(id) {
    return read(localStorage, ONCE_KEY).has(id);
  }
  hasInSession(id) {
    return read(sessionStorage, SESSION_KEY).has(id);
  }
  markSeen(id) {
    for (const [storage, key] of [[localStorage, ONCE_KEY], [sessionStorage, SESSION_KEY]]) {
      const values = read(storage, key);
      values.add(id);
      try {
        storage.setItem(key, JSON.stringify([...values]));
      } catch {
      }
    }
  }
}
class ExperienceLoader {
  constructor(apiBase, siteId, session, trackEvent) {
    this.apiBase = apiBase;
    this.siteId = siteId;
    this.session = session;
    this.trackEvent = trackEvent;
    this.renderer = new ExperienceRenderer();
    this.eligibility = new EligibilityEngine();
    this.state = new ExperienceStateStore();
    this.activeId = null;
    this.impressionId = null;
    this.destroyed = false;
  }
  async evaluate(trigger) {
    if (this.destroyed || this.activeId) return;
    try {
      const query = new URLSearchParams({ url: location.href, anonymousId: this.session.getAnonymousId(), sessionId: this.session.getSessionId() });
      const userId = this.session.getIdentifiedUserId();
      if (userId) query.set("trackedUserId", userId);
      if (trigger) query.set("trigger", trigger);
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experiences?${query}`, { credentials: "omit" });
      if (!response.ok) return;
      const manifest = await response.json();
      const chosen = this.eligibility.choose(Array.isArray(manifest.experiences) ? manifest.experiences : []);
      if (!chosen) return;
      const mounted = this.renderer.render(chosen, {
        onVisible: () => void this.shown(chosen),
        onDismiss: () => void this.record(chosen, "dismissed"),
        onAction: (action) => this.handleAction(chosen, action),
        onComplete: () => void this.record(chosen, "completed")
      });
      if (mounted) this.activeId = chosen.id;
    } catch {
    }
  }
  onRouteChange() {
    this.renderer.destroy();
    this.activeId = null;
    this.impressionId = null;
    void this.evaluate();
  }
  onCustomEvent(name) {
    void this.evaluate(name);
  }
  destroy() {
    this.destroyed = true;
    this.renderer.destroy();
    this.activeId = null;
  }
  async shown(experience) {
    if (this.activeId !== experience.id || this.impressionId) return;
    this.state.markSeen(experience.id);
    const result = await this.post(experience, "shown");
    this.impressionId = (result == null ? void 0 : result.impressionId) ?? null;
  }
  handleAction(experience, action) {
    var _a;
    void this.record(experience, "action", action.type);
    if (action.type === "open_url" && action.url) window.location.assign(action.url);
    if (action.type === "track_event" && action.eventName) (_a = this.trackEvent) == null ? void 0 : _a.call(this, action.eventName);
  }
  async record(experience, event, action) {
    await this.post(experience, event, action);
    if (event !== "action") {
      this.activeId = null;
      this.impressionId = null;
    }
  }
  async post(experience, event, action) {
    try {
      const response = await fetch(`${this.apiBase}/public/sites/${encodeURIComponent(this.siteId)}/experience-events`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ experienceId: experience.id, versionId: experience.versionId, anonymousId: this.session.getAnonymousId(), trackedUserId: this.session.getIdentifiedUserId() ?? void 0, sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), impressionId: this.impressionId ?? void 0, event, action }) });
      return response.ok && response.status !== 204 ? await response.json() : null;
    } catch {
      return null;
    }
  }
}
export {
  ExperienceLoader
};
//# sourceMappingURL=ExperienceLoader-UYz9Xr_n.js.map
