declare global {
    interface Window {
        __loopzHeatmapCapture__?: () => Promise<string>;
    }
}
export {};
