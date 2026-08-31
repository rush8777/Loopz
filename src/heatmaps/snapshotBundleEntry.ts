import { domToWebp } from "modern-screenshot";
declare global { interface Window { __loopzHeatmapCapture__?: () => Promise<string> } }
window.__loopzHeatmapCapture__ = () => domToWebp(document.documentElement, { scale: 1, backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff" });
