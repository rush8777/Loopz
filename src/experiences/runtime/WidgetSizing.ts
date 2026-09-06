import type { ExperienceDesign, ExperienceSize, WidgetType } from "../types";

interface WidgetSizeConstraint {
  width: { default: number | "full"; min?: number; max?: number; allowFull?: boolean };
  height: { allowFixed?: boolean; allowViewport?: boolean; min?: number; max?: number };
  viewportGutter: number;
}

export const WIDGET_SIZE_CONSTRAINTS: Record<WidgetType, WidgetSizeConstraint> = {
  anchored_card: { width: { default: 320, min: 240, max: 480 }, height: {}, viewportGutter: 24 },
  toast: { width: { default: 380, min: 280, max: 520 }, height: {}, viewportGutter: 24 },
  cursor_follow: { width: { default: 280, min: 200, max: 360 }, height: {}, viewportGutter: 24 },
  modal: { width: { default: 600, min: 320, max: 960, allowFull: true }, height: { allowFixed: true, allowViewport: true, min: 200, max: 900 }, viewportGutter: 24 },
  slideout: { width: { default: 400, min: 320, max: 640 }, height: { allowFixed: true, allowViewport: true, min: 240, max: 900 }, viewportGutter: 24 },
  hotspot: { width: { default: 300, min: 220, max: 420 }, height: {}, viewportGutter: 24 },
  banner: { width: { default: "full" }, height: {}, viewportGutter: 0 },
};

export function normalizeWidgetSize(widgetType: WidgetType, design: ExperienceDesign): ExperienceSize {
  const constraint = WIDGET_SIZE_CONSTRAINTS[widgetType];
  if (widgetType === "banner") return { width: { mode: "full" }, height: { mode: "auto" } };
  const legacyValue = design.width === "sm" ? constraint.width.min! : design.width === "lg" ? constraint.width.max! : constraint.width.default as number;
  const requestedWidth = design.size?.width;
  const width = requestedWidth?.mode === "full" && constraint.width.allowFull
    ? { mode: "full" as const }
    : { mode: "fixed" as const, value: clamp(requestedWidth?.value ?? legacyValue, constraint.width.min!, constraint.width.max!) };
  const requestedHeight = design.size?.height;
  const height = requestedHeight?.mode === "fixed" && constraint.height.allowFixed
    ? { mode: "fixed" as const, value: clamp(requestedHeight.value ?? constraint.height.min!, constraint.height.min!, constraint.height.max!) }
    : requestedHeight?.mode === "viewport" && constraint.height.allowViewport ? { mode: "viewport" as const } : { mode: "auto" as const };
  return { width, height };
}

export function applyWidgetSizeEnvelope(card: HTMLElement, widgetType: WidgetType, design: ExperienceDesign): void {
  const constraint = WIDGET_SIZE_CONSTRAINTS[widgetType]; const size = normalizeWidgetSize(widgetType, design); const gutter = Math.max(24, constraint.viewportGutter);
  card.dataset.sizeWidth = size.width.mode; card.dataset.sizeHeight = size.height.mode;
  if (size.width.mode === "full") {
    card.style.width = widgetType === "banner" ? "100%" : `calc(100vw - ${gutter}px)`;
    card.style.minWidth = "0"; card.style.maxWidth = "none";
  } else {
    card.style.width = `${size.width.value}px`;
    card.style.minWidth = `min(${constraint.width.min}px, calc(100vw - ${gutter}px))`;
    card.style.maxWidth = `min(${constraint.width.max}px, calc(100vw - ${gutter}px))`;
  }
  card.style.height = size.height.mode === "fixed" ? `${size.height.value}px` : size.height.mode === "viewport" ? `calc(100vh - ${gutter}px)` : "auto";
  card.style.maxHeight = `calc(100vh - ${gutter}px)`;
  card.style.overflowX = "hidden"; card.style.overflowY = "auto";
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min)); }
