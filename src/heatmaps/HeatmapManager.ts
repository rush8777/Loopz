import { currentScriptUrl } from "../core/scriptOrigin";
import { classifyHeatmapDevice, type HeatmapDeviceClass } from "./deviceClass";
interface PublicHeatmapState { id: string; selector: string }
export class HeatmapManager {
  private states: PublicHeatmapState[] = [];
  private lastResolvedAt = 0;
  private cachedStateId: string | undefined;
  private loadPromise: Promise<(() => Promise<string>) | null> | null = null;
  constructor(private apiBase: string, private siteId: string, private bundleUrl?: string) {}
  initialize(): void {
    if (!this.apiBase || typeof fetch === "undefined") return;
    void fetch(`${this.apiBase}/public/config/${this.siteId}`, { credentials: "omit" }).then((r) => r.ok ? r.json() : null)
      .then((body) => { this.states = Array.isArray(body?.heatmapStates) ? body.heatmapStates : []; }).catch(() => void 0);
  }
  context(): { stateId?: string; deviceClass: HeatmapDeviceClass } {
    return { stateId: this.resolveVisibleState(), deviceClass: classifyHeatmapDevice(window.innerWidth) };
  }
  async captureReference(captureToken: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const capture = await this.loadCaptureFunction();
      if (!capture) return { ok: false, error: "snapshot_library_unavailable" };
      const imageDataUrl = await capture();
      const doc = document.documentElement;
      const response = await fetch(`${this.apiBase}/public/sites/${this.siteId}/heatmap-snapshots/${encodeURIComponent(captureToken)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit",
        body: JSON.stringify({ pagePath: location.pathname, deviceClass: classifyHeatmapDevice(window.innerWidth), viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, documentWidth: Math.max(doc.scrollWidth, doc.clientWidth), documentHeight: Math.max(doc.scrollHeight, doc.clientHeight), imageDataUrl }),
      });
      return response.ok ? { ok: true } : { ok: false, error: "snapshot_upload_failed" };
    } catch { return { ok: false, error: "snapshot_capture_failed" }; }
  }
  private resolveVisibleState(): string | undefined {
    const now = Date.now();
    if (now - this.lastResolvedAt < 200) return this.cachedStateId;
    this.lastResolvedAt = now; this.cachedStateId = undefined;
    for (const state of this.states) {
      try {
        const el = document.querySelector(state.selector);
        if (!el) continue;
        const style = getComputedStyle(el);
        if (style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0) { this.cachedStateId = state.id; break; }
      } catch { /* invalid selector */ }
    }
    return this.cachedStateId;
  }
  private loadCaptureFunction(): Promise<(() => Promise<string>) | null> {
    if (window.__loopzHeatmapCapture__) return Promise.resolve(window.__loopzHeatmapCapture__);
    if (this.loadPromise) return this.loadPromise;
    const url = this.bundleUrl || deriveHeatmapBundleUrl(currentScriptUrl);
    if (!url) return Promise.resolve(null);
    this.loadPromise = new Promise((resolve) => { const script = document.createElement("script"); script.src = url; script.async = true; script.onload = () => resolve(window.__loopzHeatmapCapture__ ?? null); script.onerror = () => resolve(null); document.head.appendChild(script); });
    return this.loadPromise;
  }
}
declare global { interface Window { __loopzHeatmapCapture__?: () => Promise<string> } }
function deriveHeatmapBundleUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("sdk.min.js")) return url.replace("sdk.min.js", "sdk-heatmap.min.js");
  if (url.includes("sdk.js")) return url.replace("sdk.js", "sdk-heatmap.js");
  return null;
}
