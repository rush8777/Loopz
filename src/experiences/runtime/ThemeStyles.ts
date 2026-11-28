import type { SiteThemeTokens, ThemeControl } from "../../themes/types";
import type { ExperienceDesign } from "../types";

const controlNames: Record<ThemeControl, string> = {
  primaryButton: "primary", secondaryButton: "secondary", input: "input", selection: "selection",
  progress: "progress", closeButton: "close", checklistItem: "checklist-item", navigation: "navigation",
};

function setVariable(element: HTMLElement, name: string, value: string | number | undefined, unit = "") {
  if (value !== undefined) element.style.setProperty(`--movcues-${name}`, `${value}${unit}`);
}

export function applyThemeStyles(element: HTMLElement, design: ExperienceDesign, checklist = false) {
  const { background, foreground, primary, spacing, siteTheme } = design.theme;
  setVariable(element, "bg", background);
  setVariable(element, "fg", foreground);
  setVariable(element, "primary", primary);
  setVariable(element, "theme-spacing", spacing, "px");
  if (!siteTheme) return;

  const { colors, typography, radii, shadows } = siteTheme;
  setVariable(element, "surface", colors.surface);
  setVariable(element, "muted", colors.mutedText);
  setVariable(element, "border", colors.border);
  setVariable(element, "primary-fg", colors.primaryForeground);
  setVariable(element, "font-body", typography.bodyFontFamily);
  setVariable(element, "font-heading", typography.headingFontFamily);
  setVariable(element, "theme-radius", radii.lg, "px");
  setVariable(element, "button-radius", radii.md, "px");
  const { x, y, blur, spread, color } = shadows.md;
  setVariable(element, "theme-shadow", `${x}px ${y}px ${blur}px ${spread}px ${color}`);
  if (!checklist || siteTheme.version === 2) {
    setVariable(element, "font-body-size", typography.bodyFontSize, "px");
    setVariable(element, "font-heading-size", typography.headingFontSize, "px");
    setVariable(element, "font-body-weight", typography.bodyFontWeight);
    setVariable(element, "font-heading-weight", typography.headingFontWeight);
    setVariable(element, "font-body-line-height", typography.bodyLineHeight);
    setVariable(element, "font-heading-line-height", typography.headingLineHeight);
  }
  if (siteTheme.version !== 2) return;

  element.dataset.movcuesTheme = "2";
  setVariable(element, "survey-body-size", typography.bodyFontSize, "px");
  if (siteTheme.motion === "off") element.dataset.movcuesMotion = "off";
  setVariable(element, "focus", siteTheme.focusColor ?? colors.primary);
  if (siteTheme.width !== undefined) {
    element.dataset.movcuesThemedWidth = "";
    setVariable(element, "theme-width", siteTheme.width, "px");
  }
  for (const control of Object.keys(controlNames) as ThemeControl[]) {
    const settings = siteTheme.shared?.[control];
    if (!settings) continue;
    const name = controlNames[control];
    setVariable(element, `${name}-radius`, settings.radius, "px");
    setVariable(element, `${name}-height`, settings.minHeight, "px");
    setVariable(element, `${name}-bg`, settings.background);
    setVariable(element, name === "primary" ? "primary-fg" : `${name}-fg`, settings.foreground);
  }
}

type ControlStyles = NonNullable<SiteThemeTokens["shared"]>;
export function styleRuntimeClose(button: HTMLButtonElement, theme: SiteThemeTokens | undefined) {
  const control: ControlStyles["closeButton"] = theme?.version === 2 ? theme.shared?.closeButton : undefined;
  if (theme?.version !== 2) return;
  button.style.minHeight = `${control?.minHeight ?? 24}px`;
  button.style.minWidth = button.style.minHeight;
  button.style.borderRadius = `${control?.radius ?? 7}px`;
  button.style.background = control?.background ?? "transparent";
  button.style.color = control?.foreground ?? theme.colors.text;
}

export const THEME_RUNTIME_CSS = `
  .card[data-movcues-theme="2"]:not(.builder-card) {
    padding:var(--movcues-theme-spacing,18px);border-radius:var(--movcues-theme-radius);border-color:var(--movcues-border);
    box-shadow:var(--movcues-theme-shadow);font:var(--movcues-font-body-weight) var(--movcues-font-body-size)/var(--movcues-font-body-line-height) var(--movcues-font-body);
  }
  [data-movcues-theme="2"] .legacy-content h2,
  .movcues-widget[data-movcues-theme="2"] :is([data-movcues-checklist-role="title"],[data-movcues-checklist-role="completion-title"]){
    font:var(--movcues-font-heading-weight) var(--movcues-font-heading-size)/var(--movcues-font-heading-line-height) var(--movcues-font-heading);
  }
  .movcues-widget[data-movcues-theme="2"] :is([data-movcues-checklist-role="description"],[data-movcues-checklist-role="completion-description"]){
    font:var(--movcues-font-body-weight) var(--movcues-font-body-size)/var(--movcues-font-body-line-height) var(--movcues-font-body);
  }
  .card[data-movcues-theme="2"] :is(.legacy-content,.builder-content) {overflow-wrap:anywhere}
  .card[data-movcues-theme="2"]:not(.banner) .builder-content > .movcues-widget {max-height:calc(100dvh - 32px);overflow:auto;scrollbar-width:thin}
  :where([data-movcues-theme="2"]) :is(button,input,textarea,select,[tabindex]):focus-visible {
    outline:2px solid var(--movcues-focus);outline-offset:2px;
  }
  :where([data-movcues-theme="2"]) .legacy-content .primary {min-height:var(--movcues-primary-height,32px);border-radius:var(--movcues-primary-radius,var(--movcues-button-radius));background:var(--movcues-primary-bg,var(--movcues-primary));color:var(--movcues-primary-fg)}
  :where([data-movcues-theme="2"]) .legacy-content .secondary {min-height:var(--movcues-secondary-height,32px);border-radius:var(--movcues-secondary-radius,var(--movcues-button-radius));background:var(--movcues-secondary-bg,transparent);color:var(--movcues-secondary-fg,inherit)}
  [data-movcues-theme="2"] .movcues-widget .movcues-survey-input {
    min-height:var(--movcues-input-height,36px);border-color:var(--movcues-border);border-radius:var(--movcues-input-radius,6px);
    background:var(--movcues-input-bg,var(--movcues-surface));color:var(--movcues-input-fg,var(--movcues-fg));
  }
  [data-movcues-theme="2"] .movcues-widget textarea.movcues-survey-input {min-height:max(68px,var(--movcues-input-height,36px))}
  [data-movcues-theme="2"] .movcues-widget .movcues-survey-option {
    min-height:var(--movcues-selection-height,36px);border-color:var(--movcues-border);border-radius:var(--movcues-selection-radius,6px);
    background:var(--movcues-selection-bg,var(--movcues-surface));color:var(--movcues-selection-fg,var(--movcues-fg));
  }
  [data-movcues-theme="2"] .movcues-widget .movcues-survey-option.is-selected {
    border-color:var(--movcues-primary);background:var(--movcues-primary);color:var(--movcues-primary-fg);
  }
  [data-movcues-theme="2"] .movcues-widget [data-movcues-survey-action],.card[data-movcues-theme="2"] > footer .secondary {
    min-height:var(--movcues-navigation-height,36px);border-radius:var(--movcues-navigation-radius,var(--movcues-button-radius));border-color:var(--movcues-border);
    background:var(--movcues-navigation-bg,var(--movcues-surface));color:var(--movcues-navigation-fg,var(--movcues-fg));
  }
  [data-movcues-theme="2"] .movcues-widget [data-movcues-survey-progress-bar],
  .movcues-widget[data-movcues-theme="2"] .movcues-checklist-progress-track {
    height:var(--movcues-progress-height,4px);border-radius:var(--movcues-progress-radius,4px);background:var(--movcues-progress-bg,var(--movcues-border));
  }
  [data-movcues-theme="2"] .movcues-widget [data-movcues-survey-progress-bar],
  .movcues-widget[data-movcues-theme="2"] .movcues-checklist-progress-fill {
    background:var(--movcues-progress-fg,var(--movcues-primary));
  }
  .movcues-widget[data-movcues-theme="2"] .movcues-checklist__item {
    min-height:var(--movcues-checklist-item-height,36px);border-radius:var(--movcues-checklist-item-radius,var(--movcues-button-radius));
    background:var(--movcues-checklist-item-bg,var(--movcues-surface));color:var(--movcues-checklist-item-fg,var(--movcues-fg));
  }
  .movcues-widget[data-movcues-themed-width]:where(:not(:has([data-movcues-checklist-view="launcher"].is-active))) {
    min-width:0;width:var(--movcues-theme-width,360px);
  }
  .movcues-widget[data-movcues-theme="2"] [data-movcues-checklist-role="dismiss"] {
    min-height:var(--movcues-close-height,24px);border-radius:var(--movcues-close-radius,var(--movcues-button-radius));
    background:var(--movcues-close-bg,transparent);color:var(--movcues-close-fg,var(--movcues-fg));
  }
  [data-movcues-motion="off"] *,[data-movcues-motion="off"]::after {animation:none!important;transition:none!important}
  @media(prefers-reduced-motion:reduce){[data-movcues-theme="2"] *,[data-movcues-theme="2"]::after{animation:none!important;transition:none!important}}
`;
