import { domToWebp } from "modern-screenshot";
declare global { interface Window { __movecuesHeatmapCapture__?: () => Promise<string> } }
window.__movecuesHeatmapCapture__ = () => domToWebp(document.documentElement, { scale: 1, backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff" });
