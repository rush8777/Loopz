import type { DesignEvidence, DesignRole, DesignSample, ThemeShadow } from "./types";

const rules: Array<[DesignRole, string]> = [
  ["navigation", "nav,[role=navigation]"],
  ["heading", "h1,h2,h3,h4,[role=heading]"],
  ["dialog", "dialog,[role=dialog],[aria-modal=true]"],
  ["card", "article,[class~='card'],[data-slot=card],[class~='panel']"],
  ["button", "button,[role=button],input[type=button],input[type=submit],a[class*='btn'],a[class*='button']"],
  ["input", "input:not([type=hidden]),textarea,select,[role=combobox]"],
  ["label", "label,legend"],
  ["badge", "[class~='badge'],[data-slot=badge]"],
  ["notification", "[role=alert],[role=status],[class~='toast']"],
  ["popover", "[popover],[role=menu],[role=listbox],[data-slot=popover-content]"],
  ["tooltip", "[role=tooltip]"],
  ["body", "p,small"],
];
const excluded = "[hidden],[inert],[aria-hidden=true],iframe,svg,script,style,[data-movcues-experience],[data-movcues-experience-root],[data-movcues-checklist],[id^=movcues],[data-movcues-editor],[class*='intercom-'],[id*=onetrust],[id*=hubspot],[id*=cookie-banner],[id*=crisp-chatbox]";
const variableNames = {
  "--primary": "primary", "--brand": "primary", "--brand-color": "primary", "--color-primary": "primary",
  "--primary-foreground": "primaryForeground", "--background": "background", "--foreground": "text",
  "--ink": "text", "--card": "surface", "--surface": "surface", "--soft": "surface",
  "--muted-foreground": "mutedText", "--muted": "mutedText", "--border": "border", "--line": "border",
} as const;
const colorPattern = /^(?:#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s-]+\))$/i;
const fontPattern = /^[\p{L}\p{N} _,'"-]{1,140}$/u;

function number(value: string, fallback: number, max = 160): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(Math.min(max, Math.max(0, parsed)) * 100) / 100 : fallback;
}

function color(value: string): string | undefined {
  return colorPattern.test(value) && !/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(value) ? value : undefined;
}

function shadow(value: string): ThemeShadow | undefined {
  if (!value || value === "none" || value.includes("inset")) return;
  const first = value.match(/^(?:[^,(]|\([^)]*\))+/)?.[0] ?? "";
  const paint = first.match(/rgba?\([^)]*\)|#[0-9a-f]+/i)?.[0];
  const lengths = first.match(/-?\d+(?:\.\d+)?px/g)?.map(parseFloat);
  if (lengths && lengths.length >= 2 && paint && color(paint)) {
    const [x, y, blur = 0, spread = 0] = lengths;
    if ([x, y, blur, spread].every(value => Math.abs(value) <= 100)) return { x, y, blur, spread, color: paint };
  }
}

function chromatic(value: string | undefined): boolean {
  const channels = value?.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/)?.slice(1).map(Number);
  return Boolean(channels && Math.max(...channels) - Math.min(...channels) >= 28);
}

async function readyForCapture(): Promise<void> {
  if (document.readyState === "loading") await new Promise<void>(resolve => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
  if (document.fonts?.ready) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([document.fonts.ready.catch(() => undefined), new Promise(resolve => { timer = setTimeout(resolve, 1_000); })]);
    } finally { clearTimeout(timer); }
  }
}

export async function collectDesignEvidence(): Promise<{ evidence: DesignEvidence }> {
  await readyForCapture();
  const body = document.body ?? document.documentElement;
  const rootStyle = getComputedStyle(document.documentElement);
  const styleCache = new WeakMap<Element, CSSStyleDeclaration>([[document.documentElement, rootStyle]]);
  const styleOf = (element: Element) => {
    const cached = styleCache.get(element);
    if (cached) return cached;
    const style = getComputedStyle(element);
    styleCache.set(element, style);
    return style;
  };
  const variables: DesignEvidence["variables"] = {};
  const colorProbe = document.createElement("span").style;
  for (const [name, role] of Object.entries(variableNames)) {
    const raw = rootStyle.getPropertyValue(name).trim();
    const hslChannels = /^-?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(raw);
    colorProbe.color = "";
    colorProbe.color = hslChannels ? `hsl(${raw})` : raw;
    const value = color(raw) ?? color(colorProbe.color);
    if (value && !variables[role]) variables[role] = value;
  }

  const groups = new Map<DesignRole, Map<string, DesignSample>>();
  function sample(element: HTMLElement, role: DesignRole, box?: DOMRect) {
    const style = styleOf(element);
    if (style.visibility === "hidden" || style.visibility === "collapse" || style.display === "none" || style.opacity === "0") return;
    const size = number(style.fontSize, 16, 200);
    const paint = color(style.backgroundColor);
    if (role === "heading" && size >= 38 && !element.closest("dialog,[role=dialog],article,[class~='card']")) role = "display";
    if (role === "button") {
      const secondary = element.matches("[class*=secondary],[class*=outline],[class*=ghost],[data-variant=secondary]");
      const primary = element.matches("[class*=primary],[data-variant=primary],input[type=submit]");
      role = !secondary && (primary || chromatic(paint)) ? "primaryButton" : "secondaryButton";
    }
    let backdrop: string | undefined;
    for (let parent = element.parentElement, depth = 0; parent && depth < 8; parent = parent.parentElement, depth++) {
      const parentStyle = styleOf(parent);
      if (parentStyle.display === "none" || parentStyle.opacity === "0") return;
      backdrop ??= color(parentStyle.backgroundColor);
    }
    const item: DesignSample = {
      role, count: 1, fontFamily: fontPattern.test(style.fontFamily) ? style.fontFamily : undefined,
      fontSize: size, fontWeight: style.fontWeight === "bold" ? 700 : number(style.fontWeight, 400, 900),
      lineHeight: style.lineHeight?.endsWith("px") && size ? Math.min(4, number(style.lineHeight, size, 500) / size) : number(style.lineHeight || "", 1.5, 4),
      letterSpacing: Math.max(-10, Math.min(20, parseFloat(style.letterSpacing) || 0)),
      color: color(style.color), background: paint, backdrop, borderColor: number(style.borderTopWidth, 0) ? color(style.borderTopColor) : undefined,
      borderWidth: number(style.borderTopWidth, 0, 24), radius: number(style.borderTopLeftRadius || style.borderRadius, 0, 100),
      padding: number(style.paddingTop, 0, 80), gap: number(style.gap, 0, 80),
      width: box ? Math.min(1600, Math.round(box.width)) : undefined,
      height: box ? Math.min(1200, Math.round(box.height)) : undefined,
      shadow: shadow(style.boxShadow),
    };
    const { width: _width, height: _height, ...signature } = item;
    const key = JSON.stringify(signature);
    const group = groups.get(role) ?? new Map<string, DesignSample>();
    groups.set(role, group);
    const existing = group.get(key);
    if (existing) existing.count = Math.min(100, existing.count + 1);
    else if (group.size < 12) group.set(key, item);
  }

  sample(body, "page");
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => (node as Element).matches(excluded) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let visited = 0;
  let measured = 0;
  for (let node = walker.nextNode(); node && visited < 1_400 && measured < 180; node = walker.nextNode(), visited++) {
    if (!(node instanceof HTMLElement)) continue;
    const match = rules.find(([, selector]) => node.matches(selector));
    if (!match) continue;
    const box = node.getBoundingClientRect();
    if (box.width < 2 || box.height < 2 || box.right <= 0 || box.bottom <= 0 || box.left >= innerWidth || box.top >= innerHeight) continue;
    measured++;
    sample(node, match[0], box);
  }
  const samples = [...groups.values()].flatMap(group => [...group.values()].sort((a, b) => b.count - a.count).slice(0, 3));
  const hasHeading = samples.some(item => item.role === "heading");
  const hasBrandButton = samples.some(item => item.role === "primaryButton" && chromatic(item.background));
  const hasSurface = samples.some(item => ["card", "dialog", "popover"].includes(item.role) && item.background);
  const confidence = { typography: hasHeading ? .85 : .5, primary: variables.primary ? .95 : hasBrandButton ? .8 : .3, surfaces: hasSurface ? .85 : .5 };
  const provenance: DesignEvidence["provenance"] = {
    typography: hasHeading ? "heading" : "page",
    primary: variables.primary ? "variable" : hasBrandButton ? "button" : "default",
    surfaces: hasSurface ? "component" : "page",
  };
  return { evidence: { version: 2, samples, variables, confidence, provenance } };
}
