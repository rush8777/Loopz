import { domToWebp } from "modern-screenshot";
declare global { interface Window { __movcuesHeatmapCapture__?: () => Promise<string> } }
window.__movcuesHeatmapCapture__ = () => domToWebp(document.documentElement, { scale: 1, backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff" });
