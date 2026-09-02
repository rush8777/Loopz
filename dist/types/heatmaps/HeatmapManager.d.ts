import { type HeatmapDeviceClass } from "./deviceClass";
export declare class HeatmapManager {
    private apiBase;
    private siteId;
    private bundleUrl?;
    private states;
    private lastResolvedAt;
    private cachedStateId;
    private loadPromise;
    constructor(apiBase: string, siteId: string, bundleUrl?: string | undefined);
    initialize(): void;
    context(): {
        stateId?: string;
        deviceClass: HeatmapDeviceClass;
    };
    captureReference(captureToken: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    private requestAutomaticReference;
    private enterLiveCapture;
    private mountToolbar;
    private resolveVisibleState;
    private loadCaptureFunction;
}
declare global {
    interface Window {
        __loopzHeatmapCapture__?: () => Promise<string>;
    }
}
