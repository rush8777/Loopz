import type { ChecklistProgress, DeliveredChecklist, DeliveredExperience } from "../types";
import type { ExperienceSession } from "../runtimeInterfaces";
import { ChecklistRenderer } from "./ChecklistRenderer";

interface ChecklistActionResponse { impressionId?: string; progress?: ChecklistProgress; item?: DeliveredChecklist["definition"]["items"][number] }

export class ChecklistManager {
  private renderer = new ChecklistRenderer();
  private current: DeliveredChecklist | null = null;
  private impressionId: string | null = null;
  private shown = new Set<string>();
  private forceLauncher = false;
  private destroyed = false;
  private refreshPromise: Promise<void> | null = null;
  private trailingRefresh = false;

  constructor(private apiBase: string, private siteId: string, private session: ExperienceSession, private launchGuide: (id: string, context: { source: "checklist"; checklistExperienceId: string; itemId: string }) => Promise<void>) {}

  setChecklist(checklist: DeliveredChecklist | null): void {
    if (this.destroyed) return;
    if (!checklist) { this.current = null; this.impressionId = null; this.renderer.destroy(); return; }
    if (this.current?.id !== checklist.id || this.current.versionId !== checklist.versionId) this.impressionId = null;
    this.current = checklist; this.render();
    const key = `${checklist.id}:${checklist.versionId}`;
    if (!this.shown.has(key)) { this.shown.add(key); void this.action("shown").then(response => { if (response?.impressionId) this.impressionId = response.impressionId; }); }
  }

  setTransientActive(active: boolean): void { this.forceLauncher = active; if (this.current) this.render(); }

  hasChecklist(): boolean { return Boolean(this.current); }

  refresh(): Promise<void> {
    if (!this.current || this.destroyed) return Promise.resolve();
    if (this.refreshPromise) { this.trailingRefresh = true; return this.refreshPromise; }
    const current = this.current;
    this.refreshPromise = this.request(`${this.path(current)}/refresh`, { versionId: current.versionId }).then(response => { if (this.current === current && response?.items) { current.progress = response as ChecklistProgress; this.render(); } }).finally(() => { this.refreshPromise = null; if (this.trailingRefresh) { this.trailingRefresh = false; void this.refresh(); } });
    return this.refreshPromise;
  }

  destroy(): void { this.destroyed = true; this.current = null; this.renderer.destroy(); }

  private render(): void {
    const current = this.current; if (!current) return;
    const mounted = this.renderer.render(current, { onOpen: () => void this.transition("open"), onCollapse: () => void this.transition("collapse"), onDismiss: () => void this.transition("dismiss"), onAcknowledge: () => void this.transition("completion_acknowledged"), onItemClick: id => void this.clickItem(id) }, this.forceLauncher);
    if (!mounted) { this.current = null; this.renderer.destroy(); }
  }

  private async transition(action: "open" | "collapse" | "dismiss" | "completion_acknowledged") {
    const current = this.current; if (!current) return;
    const response = await this.action(action); if (this.current !== current) return;
    if (response?.progress) current.progress = response.progress;
    if (action === "dismiss" || action === "completion_acknowledged") { this.current = null; this.renderer.destroy(); return; }
    current.progress.collapsed = action === "collapse"; this.render();
  }

  private async clickItem(itemId: string) {
    const current = this.current; if (!current) return;
    const response = await this.action("item_click", itemId); if (!response || this.current !== current) return;
    if (response.progress) current.progress = response.progress; this.render();
    const item = response.item; if (!item) return;
    if (item.action.type === "launch_guide") await this.launchGuide(item.action.experienceId, { source: "checklist", checklistExperienceId: current.id, itemId });
    else if (item.action.type === "navigate") { try { const url = new URL(item.action.url, location.href); if (url.origin === location.origin) location.assign(url.href); } catch { /* invalid saved URLs fail closed */ } }
    else if (item.action.type === "open_url") { try { const url = new URL(item.action.url); if (/^https?:$/.test(url.protocol)) window.open(url.href, "_blank", "noopener,noreferrer"); } catch { /* fail closed */ } }
  }

  private action(action: "shown" | "open" | "collapse" | "dismiss" | "item_click" | "completion_acknowledged", itemId?: string) { const current = this.current; if (!current) return Promise.resolve(null); return this.request(`${this.path(current)}/actions`, { versionId: current.versionId, impressionId: this.impressionId ?? undefined, action, itemId }) as Promise<ChecklistActionResponse | null>; }
  private path(current: DeliveredChecklist) { return `/public/sites/${encodeURIComponent(this.siteId)}/checklists/${encodeURIComponent(current.id)}`; }
  private async request(path: string, body: Record<string, unknown>): Promise<any | null> { try { const userId = this.session.getIdentifiedUserId(); const response = await fetch(`${this.apiBase}${path}`, { method: "POST", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, url: location.href, anonymousId: this.session.getAnonymousId(), ...(userId ? { trackedUserId: userId } : {}), sessionId: this.session.getSessionId(), pageViewId: this.session.getPageViewId(), timestamp: Date.now() }) }); return response.ok ? await response.json() : null; } catch { return null; } }
}
