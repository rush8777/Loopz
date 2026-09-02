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
    const liveToken = new URL(location.href).searchParams.get("__loopz_heatmap_capture");
    if (liveToken) {
      void this.enterLiveCapture(liveToken);
      return;
    }
    void fetch(`${this.apiBase}/public/config/${this.siteId}`, { credentials: "omit" }).then((r) => r.ok ? r.json() : null)
      .then((body) => {
        this.states = Array.isArray(body?.heatmapStates) ? body.heatmapStates : [];
        return this.requestAutomaticReference();
      }).catch(() => void 0);
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
  private async requestAutomaticReference(): Promise<void> {
    try {
      const device = classifyHeatmapDevice(window.innerWidth);
      const response = await fetch(`${this.apiBase}/public/sites/${this.siteId}/heatmap-reference?path=${encodeURIComponent(location.pathname)}&device=${device}`, { credentials: "omit" });
      if (!response.ok) return;
      const body = await response.json();
      if (typeof body?.capture?.token === "string") await this.captureReference(body.capture.token);
    } catch { /* reference capture is always best-effort */ }
  }
  private async enterLiveCapture(token: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiBase}/public/sites/${this.siteId}/heatmap-captures/${encodeURIComponent(token)}`, { credentials: "omit" });
      if (!response.ok) return;
      const capture = await response.json();
      const cleanUrl = new URL(location.href); cleanUrl.searchParams.delete("__loopz_heatmap_capture");
      history.replaceState(history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      this.mountToolbar(token, capture);
    } catch { /* an invalid capture link must not affect analytics */ }
  }
  private mountToolbar(token: string, capture: { pageName?: string; stateName?: string; device?: string }): void {
    const host = document.createElement("div"); host.setAttribute("data-loopz-heatmap-toolbar", "");
    const root = host.attachShadow({ mode: "closed" });
    const wrap = document.createElement("div");
    wrap.innerHTML = `<style>:host{all:initial}.bar{position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);display:flex;align-items:center;gap:18px;min-width:560px;padding:14px 16px;border-radius:12px;background:#111827;color:#fff;box-shadow:0 16px 50px #0007;font:13px/1.4 system-ui,sans-serif}.copy{flex:1}.title{font-weight:700}.sub{color:#cbd5e1;margin-top:2px}.actions{display:flex;gap:8px}button{border:0;border-radius:7px;padding:9px 14px;font:600 13px system-ui;cursor:pointer}.cancel{background:#374151;color:#fff}.capture{background:#7c3aed;color:#fff}.status{color:#d1fae5;font-weight:600}</style><div class="bar"><div class="copy"><div class="title">Loopz · Heatmap capture</div><div class="sub"></div></div><div class="actions"><button class="cancel">Cancel</button><button class="capture">Capture</button></div></div>`;
    const sub = wrap.querySelector(".sub")!; sub.textContent = `${capture.pageName ?? "Page"} · ${capture.stateName ?? "Default"} · ${capitalize(capture.device ?? "desktop")} — Arrange this page exactly as you want it shown.`;
    wrap.querySelector(".cancel")!.addEventListener("click", () => host.remove());
    wrap.querySelector(".capture")!.addEventListener("click", async () => {
      const button = wrap.querySelector(".capture") as HTMLButtonElement; button.disabled = true; button.textContent = "Capturing…"; host.style.display = "none";
      const result = await this.captureReference(token); host.style.display = "";
      if (result.ok) { wrap.querySelector(".actions")!.innerHTML = `<span class="status">Captured successfully. You can close this tab.</span>`; }
      else { button.disabled = false; button.textContent = "Try again"; }
    });
    root.appendChild(wrap); document.documentElement.appendChild(host);
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
function capitalize(value: string) { return value ? value[0].toUpperCase() + value.slice(1) : value; }
declare global { interface Window { __loopzHeatmapCapture__?: () => Promise<string> } }
function deriveHeatmapBundleUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.includes("sdk.min.js")) return url.replace("sdk.min.js", "sdk-heatmap.min.js");
  if (url.includes("sdk.js")) return url.replace("sdk.js", "sdk-heatmap.js");
  return null;
}
