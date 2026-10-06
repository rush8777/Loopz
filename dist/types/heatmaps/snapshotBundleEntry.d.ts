declare global {
    interface Window {
        __movcuesHeatmapCapture__?: () => Promise<string>;
    }
}
export {};
