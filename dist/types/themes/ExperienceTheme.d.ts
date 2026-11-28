import type { SiteThemeTokens, ThemeComponent, VisualPresetId, VisualThemeState } from "./types";
export declare const EXPERIENCE_PRESETS: Record<VisualPresetId, SiteThemeTokens>;
export declare function resolvedTheme(state: VisualThemeState): SiteThemeTokens;
export declare function snapshotTheme(tokens: SiteThemeTokens, component: ThemeComponent): SiteThemeTokens;
export declare function authoringThemeSnapshot(tokens: SiteThemeTokens, component: ThemeComponent): SiteThemeTokens;
