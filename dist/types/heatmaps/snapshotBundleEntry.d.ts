declare global {
    interface Window {
        __movecuesHeatmapCapture__?: () => Promise<string>;
    }
}
export {};
