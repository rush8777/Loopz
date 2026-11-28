import type { SiteThemeTokens, ThemeComponent, VisualPresetId, VisualThemeState } from "./types";

const shadow=(y:number,blur:number,color:string)=>({x:0,y,blur,spread:0,color});
export const EXPERIENCE_PRESETS:Record<VisualPresetId,SiteThemeTokens>={
 minimal:{version:1,colors:{background:"#ffffff",surface:"#ffffff",text:"#111827",mutedText:"#64748b",primary:"#2563eb",primaryForeground:"#ffffff",border:"#e2e8f0"},typography:{bodyFontFamily:"ui-sans-serif, system-ui, sans-serif",headingFontFamily:"ui-sans-serif, system-ui, sans-serif",bodyFontSize:15,headingFontSize:24,bodyFontWeight:400,headingFontWeight:700,bodyLineHeight:1.5,headingLineHeight:1.2},radii:{sm:4,md:8,lg:12},shadows:{sm:shadow(2,8,"rgba(15,23,42,.08)"),md:shadow(12,36,"rgba(15,23,42,.16)")}},
 modern:{version:1,colors:{background:"#ffffff",surface:"#f8fafc",text:"#0f172a",mutedText:"#64748b",primary:"#4f46e5",primaryForeground:"#ffffff",border:"#e2e8f0"},typography:{bodyFontFamily:"Inter, ui-sans-serif, system-ui, sans-serif",headingFontFamily:"Inter, ui-sans-serif, system-ui, sans-serif",bodyFontSize:15,headingFontSize:28,bodyFontWeight:400,headingFontWeight:700,bodyLineHeight:1.55,headingLineHeight:1.15},radii:{sm:6,md:12,lg:20},shadows:{sm:shadow(4,14,"rgba(15,23,42,.09)"),md:shadow(24,70,"rgba(15,23,42,.20)")}},
 soft:{version:1,colors:{background:"#f8fafc",surface:"#ffffff",text:"#1e293b",mutedText:"#64748b",primary:"#0284c7",primaryForeground:"#ffffff",border:"#dbeafe"},typography:{bodyFontFamily:"ui-rounded, ui-sans-serif, system-ui, sans-serif",headingFontFamily:"ui-rounded, ui-sans-serif, system-ui, sans-serif",bodyFontSize:15,headingFontSize:26,bodyFontWeight:400,headingFontWeight:700,bodyLineHeight:1.6,headingLineHeight:1.2},radii:{sm:10,md:16,lg:24},shadows:{sm:shadow(6,18,"rgba(14,116,144,.10)"),md:shadow(22,58,"rgba(14,116,144,.16)")}},
 dark:{version:1,colors:{background:"#0f172a",surface:"#1e293b",text:"#f8fafc",mutedText:"#cbd5e1",primary:"#818cf8",primaryForeground:"#0f172a",border:"#334155"},typography:{bodyFontFamily:"ui-sans-serif, system-ui, sans-serif",headingFontFamily:"ui-sans-serif, system-ui, sans-serif",bodyFontSize:15,headingFontSize:26,bodyFontWeight:400,headingFontWeight:700,bodyLineHeight:1.55,headingLineHeight:1.18},radii:{sm:6,md:12,lg:18},shadows:{sm:shadow(5,16,"rgba(0,0,0,.28)"),md:shadow(24,70,"rgba(0,0,0,.42)")}}
};

export function resolvedTheme(state:VisualThemeState):SiteThemeTokens{
 const value=structuredClone(state.baseTokens),o=state.overrides;
 if(o.primary){value.colors.primary=o.primary;if(value.shared?.primaryButton)value.shared.primaryButton.background=o.primary;}if(o.secondary)value.colors.surface=o.secondary;if(o.background)value.colors.background=o.background;if(o.text)value.colors.text=o.text;
 if(o.bodyFontFamily)value.typography.bodyFontFamily=o.bodyFontFamily;if(o.headingFontFamily)value.typography.headingFontFamily=o.headingFontFamily;
 if(o.bodyFontSize)value.typography.bodyFontSize=o.bodyFontSize;if(o.headingFontSize)value.typography.headingFontSize=o.headingFontSize;
 if(o.radius!==undefined)value.radii={sm:Math.max(0,o.radius/2),md:o.radius,lg:Math.min(100,o.radius*1.5)};if(o.buttonRadius!==undefined){value.radii.md=o.buttonRadius;if(value.shared?.primaryButton)value.shared.primaryButton.radius=o.buttonRadius;if(value.shared?.secondaryButton)value.shared.secondaryButton.radius=o.buttonRadius;}
 if(o.shadow)value.shadows={sm:o.shadow,md:o.shadow};return value;
}

export function snapshotTheme(tokens: SiteThemeTokens, component: ThemeComponent): SiteThemeTokens {
  const { components, ...base } = structuredClone(tokens);
  const defaults = components?.[component];
  if (!defaults) return base;
  base.spacing = defaults.spacing ?? base.spacing;
  base.width = defaults.width ?? base.width;
  base.radii.lg = defaults.radius ?? base.radii.lg;
  if (defaults.buttonRadius !== undefined) {
    base.radii.md = defaults.buttonRadius;
    if (base.shared?.primaryButton) base.shared.primaryButton.radius = defaults.buttonRadius;
    if (base.shared?.secondaryButton) base.shared.secondaryButton.radius = defaults.buttonRadius;
  }
  if (defaults.bodyFontSize !== undefined) base.typography.bodyFontSize = defaults.bodyFontSize;
  if (defaults.headingFontSize !== undefined) base.typography.headingFontSize = defaults.headingFontSize;
  if (defaults.bodyLineHeight !== undefined) base.typography.bodyLineHeight = defaults.bodyLineHeight;
  if (defaults.headingLineHeight !== undefined) base.typography.headingLineHeight = defaults.headingLineHeight;
  if (defaults.background !== undefined) base.colors.background = defaults.background;
  if (defaults.surface !== undefined) base.colors.surface = defaults.surface;
  if (defaults.text !== undefined) base.colors.text = defaults.text;
  if (defaults.shadow !== undefined) base.shadows.md = defaults.shadow;
  return base;
}


export function authoringThemeSnapshot(tokens: SiteThemeTokens, component: ThemeComponent): SiteThemeTokens {
  if (tokens.version !== 2 || component !== "guide") return snapshotTheme(tokens, component);
  return structuredClone({ ...tokens, components: { guide: tokens.components?.guide, modal: tokens.components?.modal } });
}
