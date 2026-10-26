import type { SiteThemeTokens, VisualPresetId, VisualThemeState } from "./types";
export declare const EXPERIENCE_PRESETS: Record<VisualPresetId, SiteThemeTokens>;
export declare function resolvedTheme(state: VisualThemeState): SiteThemeTokens;
