export type HeatmapDeviceClass = "desktop" | "tablet" | "mobile";
export function classifyHeatmapDevice(viewportWidth: number): HeatmapDeviceClass {
  if (viewportWidth < 768) return "mobile";
  if (viewportWidth < 1024) return "tablet";
  return "desktop";
}
