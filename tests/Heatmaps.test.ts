import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClickCollector } from "../src/autocapture/ClickCollector";
import { EventBus } from "../src/core/EventBus";
import { PrivacyFilter } from "../src/privacy/PrivacyFilter";
import { HeatmapManager } from "../src/heatmaps/HeatmapManager";
import { classifyHeatmapDevice } from "../src/heatmaps/deviceClass";
import type { ClickEventPayload } from "../src/types/events";

describe("heatmap collection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete window.__loopzHeatmapCapture__;
    Object.defineProperty(window, "scrollX", { configurable: true, value: 0 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });
  afterEach(() => vi.restoreAllMocks());

  it("classifies every heatmap device through centralized breakpoints", () => {
    expect(classifyHeatmapDevice(1440)).toBe("desktop");
    expect(classifyHeatmapDevice(900)).toBe("tablet");
    expect(classifyHeatmapDevice(390)).toBe("mobile");
  });

  it("keeps viewport coordinates and adds document coordinates after scrolling", () => {
    Object.defineProperty(window, "scrollX", { configurable: true, value: 25 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 600 });
    const bus = new EventBus();
    const collector = new ClickCollector(bus, new PrivacyFilter());
    const button = document.createElement("button");
    document.body.appendChild(button);
    const received: ClickEventPayload[] = [];
    bus.on<ClickEventPayload>("click", (payload) => received.push(payload));
    collector.start();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 100, clientY: 80 }));
    collector.stop();
    expect(received[0].coordinates).toMatchObject({ clientX: 100, clientY: 80, documentX: 125, documentY: 680 });
  });

  it("does not load screenshot code during normal startup and detects a modal opened later", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ heatmapStates: [{ id: "modal-state", selector: '[role="dialog"]' }] }) }));
    const manager = new HeatmapManager("https://api.example", "site_public", "https://cdn.example/sdk-heatmap.js");
    manager.initialize();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('script[src*="sdk-heatmap"]')).toBeNull();
    expect(manager.context().stateId).toBeUndefined();

    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.getClientRects = () => ({ length: 1, item: () => null, [Symbol.iterator]: function* () {} }) as DOMRectList;
    document.body.appendChild(modal);
    const later = Date.now() + 250;
    vi.spyOn(Date, "now").mockReturnValue(later);
    expect(manager.context().stateId).toBe("modal-state");
    expect(document.querySelector('script[src*="sdk-heatmap"]')).toBeNull();
  });

  it("captures the currently rendered state only on an explicit request and contains failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ heatmapStates: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    window.__loopzHeatmapCapture__ = vi.fn().mockResolvedValue("data:image/webp;base64,AAAA");
    const manager = new HeatmapManager("https://api.example", "site_public");
    const result = await manager.captureReference("one-time-token");
    expect(result).toEqual({ ok: true });
    expect(window.__loopzHeatmapCapture__).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/heatmap-snapshots/one-time-token"), expect.objectContaining({ method: "POST" }));

    window.__loopzHeatmapCapture__ = vi.fn().mockRejectedValue(new Error("capture failed"));
    await expect(manager.captureReference("bad-token")).resolves.toEqual({ ok: false, error: "snapshot_capture_failed" });
  });
});
