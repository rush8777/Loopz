import type { ThemeCapturePayload, ThemeShadow } from "./types";

const TRANSPARENT = new Set(["transparent", "rgba(0, 0, 0, 0)", "rgba(0,0,0,0)"]);

function visible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function firstVisible(selectors: string): HTMLElement | null {
  return Array.from(document.querySelectorAll(selectors)).find(visible) ?? null;
}

function visibleElements(selectors: string): HTMLElement[] {
  return Array.from(document.querySelectorAll(selectors)).filter(visible);
}

function px(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : fallback;
}

function weight(value: string, fallback: number): number {
  if (value === "normal") return 400;
  if (value === "bold") return 700;
  return Math.min(900, Math.max(100, Math.round(px(value, fallback) / 100) * 100));
}

function lineHeight(value: string, fontSize: number, fallback: number): number {
  if (value === "normal") return fallback;
  const parsed = px(value, 0);
  if (!parsed) return fallback;
  return Math.round((value.includes("px") ? parsed / fontSize : parsed) * 100) / 100;
}

function color(value: string, fallback: string): string { return value && !TRANSPARENT.has(value) ? value : fallback; }

function isOpaqueColor(value: string): boolean { return Boolean(value) && !TRANSPARENT.has(value); }

function recurringStyle(elements: HTMLElement[], read: (style: CSSStyleDeclaration) => string, accept: (value: string, style: CSSStyleDeclaration, element: HTMLElement) => boolean = value => Boolean(value)): { value: string; element: HTMLElement; count: number } | null {
  const grouped = new Map<string, { element: HTMLElement; count: number }>();
  elements.forEach(element => {
    const style = getComputedStyle(element);
    const value = read(style).trim();
    if (!accept(value, style, element)) return;
    const current = grouped.get(value);
    grouped.set(value, current ? { ...current, count: current.count + 1 } : { element, count: 1 });
  });
  const best = [...grouped.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  return best ? { value: best[0], ...best[1] } : null;
}

function shadow(value: string): ThemeShadow {
  if (!value || value === "none") return { x: 0, y: 0, blur: 0, spread: 0, color: "rgba(0, 0, 0, 0)" };
  const lengths: number[] = [];
  const lengthPattern = /(-?\d+(?:\.\d+)?)px/g;
  let lengthMatch: RegExpExecArray | null;
  while (lengths.length < 4 && (lengthMatch = lengthPattern.exec(value))) lengths.push(Number(lengthMatch[1]));
  const foundColor = value.match(/rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0] ?? "rgba(0, 0, 0, 0.2)";
  return { x: lengths[0] ?? 0, y: lengths[1] ?? 0, blur: Math.max(0, lengths[2] ?? 0), spread: lengths[3] ?? 0, color: foundColor };
}

function cssVariables(): Record<string, string> {
  const result: Record<string, string> = {};
  const style = getComputedStyle(document.documentElement);
  for (let index = 0; index < style.length && Object.keys(result).length < 100; index += 1) {
    const name = style.item(index);
    if (!name.startsWith("--") || !/(color|font|radius|shadow|background|surface|border|primary|text|brand|accent|ink|muted|line|soft|canvas|panel)/i.test(name)) continue;
    const value = style.getPropertyValue(name).trim();
    if (value && value.length <= 300 && !/[{}]|url\s*\(|javascript\s*:/i.test(value)) result[name] = value;
  }
  return result;
}

function semanticVariable(variables: Record<string, string>, pattern: RegExp): string | undefined {
  return Object.entries(variables).find(([name, value]) => pattern.test(name) && isOpaqueColor(value))?.[1];
}

function hasVisibleBorder(style: CSSStyleDeclaration): boolean {
  return style.borderTopStyle !== "none" && px(style.borderTopWidth, 0) > 0;
}

function readyForCapture(): Promise<void> {
  const domReady = document.readyState === "loading" ? new Promise<void>(resolve => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })) : Promise.resolve();
  return domReady.then(async () => {
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
    if (fonts) await Promise.race([fonts.catch(() => undefined), new Promise(resolve => setTimeout(resolve, 1_500))]);
  });
}

export async function extractDesignTokens(): Promise<ThemeCapturePayload> {
  await readyForCapture();
  const body = visible(document.body) ? document.body : document.documentElement;
  const bodyStyle = getComputedStyle(body);
  const heading = firstVisible("h1,h2,h3,h4") ?? body;
  const headingStyle = getComputedStyle(heading);
  const variables = cssVariables();
  const actions = visibleElements("button,[role=button],a[href],input[type=button],input[type=submit]");
  const actionBackground = recurringStyle(actions, style => style.backgroundColor, (value) => isOpaqueColor(value));
  const action = actionBackground?.element ?? null;
  const actionStyle = action ? getComputedStyle(action) : bodyStyle;
  const surfaces = visibleElements("dialog,[role=dialog],article,form,input,textarea,[class*=card],[class*=panel],[class*=surface]");
  const surfaceBackground = recurringStyle(surfaces, style => style.backgroundColor, value => isOpaqueColor(value));
  const surface = surfaceBackground?.element ?? body;
  const surfaceStyle = getComputedStyle(surface);
  const muted = recurringStyle(visibleElements("p,small,[class*=muted],[class*=secondary],[class*=subtitle],[class*=description]"), style => style.color, value => isOpaqueColor(value) && value !== bodyStyle.color);
  const bordered = recurringStyle(surfaces, style => style.borderColor, (_value, style) => hasVisibleBorder(style));
  const shadowed = recurringStyle([...actions, ...surfaces], style => style.boxShadow, value => Boolean(value) && value !== "none");
  const bodySize = px(bodyStyle.fontSize, 16);
  const headingSize = px(headingStyle.fontSize, Math.max(20, bodySize * 1.5));
  const background = color(bodyStyle.backgroundColor, "#ffffff");
  const text = color(bodyStyle.color, "#111827");
  const primary = actionBackground?.value ?? semanticVariable(variables, /(?:primary|brand|accent|action)/i) ?? color(actionStyle.color, "#2563eb");
  const primaryForeground = action ? color(actionStyle.color, "#ffffff") : semanticVariable(variables, /(?:primary|brand).*(?:foreground|contrast|on)/i) ?? "#ffffff";
  const surfaceColor = surfaceBackground?.value ?? semanticVariable(variables, /(?:surface|card|panel|soft)/i) ?? background;
  const mutedText = muted?.value ?? semanticVariable(variables, /(?:muted|subtle|secondary).*(?:text|foreground)?|--muted$/i) ?? text;
  const border = bordered?.value ?? semanticVariable(variables, /(?:border|line|divider)/i) ?? "rgba(15, 23, 42, 0.12)";
  const radius = px(actionStyle.borderRadius || surfaceStyle.borderRadius, 8);
  const capturedShadow = shadow(shadowed?.value ?? surfaceStyle.boxShadow);
  const confidence: Record<string, number> = {
    "colors.background": bodyStyle.backgroundColor && !TRANSPARENT.has(bodyStyle.backgroundColor) ? 0.95 : 0.35,
    "colors.text": bodyStyle.color ? 0.95 : 0.35,
    "colors.primary": actionBackground ? Math.min(0.98, 0.7 + actionBackground.count * 0.08) : semanticVariable(variables, /(?:primary|brand|accent|action)/i) ? 0.7 : 0.35,
    "colors.mutedText": muted ? 0.85 : 0.5,
    "colors.border": bordered ? 0.85 : 0.5,
    "typography.bodyFontFamily": bodyStyle.fontFamily ? 0.95 : 0.35,
    "typography.headingFontFamily": heading !== body ? 0.9 : 0.5,
    "radii.md": action ? 0.75 : 0.4,
  };
  return {
    tokens: {
      version: 1,
      colors: { background, surface: surfaceColor, text, mutedText, primary, primaryForeground, border },
      typography: { bodyFontFamily: bodyStyle.fontFamily || "system-ui, sans-serif", headingFontFamily: headingStyle.fontFamily || bodyStyle.fontFamily || "system-ui, sans-serif", bodyFontSize: bodySize, headingFontSize: headingSize, bodyFontWeight: weight(bodyStyle.fontWeight, 400), headingFontWeight: weight(headingStyle.fontWeight, 700), bodyLineHeight: lineHeight(bodyStyle.lineHeight, bodySize, 1.5), headingLineHeight: lineHeight(headingStyle.lineHeight, headingSize, 1.25) },
      radii: { sm: Math.max(0, Math.round(radius / 2)), md: radius, lg: Math.min(100, Math.round(radius * 2)) },
      shadows: { sm: capturedShadow, md: capturedShadow },
    },
    evidence: { confidence, cssVariables: variables, sdkVersion: "0.1.0" },
  };
}
