export interface ThemeShadow { x: number; y: number; blur: number; spread: number; color: string }
export type ThemeControl = "primaryButton" | "secondaryButton" | "input" | "selection" | "progress" | "closeButton" | "checklistItem" | "navigation";
export interface ThemeControlStyle { radius?: number; minHeight?: number; background?: string; foreground?: string }
export interface ThemeComponentStyle {
  spacing?: number; radius?: number; buttonRadius?: number; width?: number;
  bodyFontSize?: number; headingFontSize?: number; bodyLineHeight?: number; headingLineHeight?: number;
  background?: string; surface?: string; text?: string; shadow?: ThemeShadow;
}

export interface SiteThemeTokens {
  version: 1 | 2;
  colors: { background: string; surface: string; text: string; mutedText: string; primary: string; primaryForeground: string; border: string };
  typography: { bodyFontFamily: string; headingFontFamily: string; bodyFontSize: number; headingFontSize: number; bodyFontWeight: number; headingFontWeight: number; bodyLineHeight: number; headingLineHeight: number };
  radii: { sm: number; md: number; lg: number };
  shadows: { sm: ThemeShadow; md: ThemeShadow };
  spacing?: number;
  width?: number;
  motion?: "system" | "off";
  focusColor?: string;
  shared?: Partial<Record<ThemeControl, ThemeControlStyle>>;
  components?: Partial<Record<ThemeComponent, ThemeComponentStyle>>;
}
export type ThemeComponent = "modal" | "anchored_card" | "survey" | "checklist" | "banner" | "slideout" | "toast" | "hotspot" | "cursor_follow" | "guide";

export type DesignRole = "page" | "navigation" | "heading" | "display" | "dialog" | "card" | "button" |
  "primaryButton" | "secondaryButton" | "input" | "label" | "badge" | "notification" | "popover" | "tooltip" | "body";

export interface DesignSample {
  role: DesignRole;
  count: number;
  fontFamily?: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  color?: string;
  background?: string;
  backdrop?: string;
  borderColor?: string;
  borderWidth: number;
  radius: number;
  padding: number;
  gap: number;
  width?: number;
  height?: number;
  shadow?: ThemeShadow;
}

export interface DesignEvidence {
  version: 2;
  samples: DesignSample[];
  variables: Partial<Record<"primary" | "primaryForeground" | "text" | "mutedText" | "surface" | "background" | "border", string>>;
  confidence: { typography: number; primary: number; surfaces: number };
  provenance?: { typography: "heading" | "page"; primary: "variable" | "button" | "default"; surfaces: "component" | "page" };
}

export type VisualPresetId = "minimal" | "modern" | "soft" | "dark";
export interface VisualThemeState {
  source: "template" | "site" | "preset";
  preset?: VisualPresetId;
  savedStyleId?: string;
  templateId?: string;
  templateTokens: SiteThemeTokens;
  baseTokens: SiteThemeTokens;
  overrides: {
    primary?: string; secondary?: string; background?: string; text?: string;
    bodyFontFamily?: string; headingFontFamily?: string; bodyFontSize?: number; headingFontSize?: number;
    buttonRadius?: number; radius?: number; shadow?: ThemeShadow; spacing?: number;
  };
}
