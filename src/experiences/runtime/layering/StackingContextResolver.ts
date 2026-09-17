export interface StackingContextEntry {
  element: Element;
  zIndex: number | null;
  createsStackingContext: boolean;
}

export interface StackingContextInfo {
  /** The outermost context that controls how the target participates in the document stack. */
  element: Element | null;
  zIndex: number;
  /** Ordered from the inspected element toward the document root. */
  chain: StackingContextEntry[];
}

export class StackingContextResolver {
  resolve(element: Element | null): StackingContextInfo {
    if (!element) return { element: null, zIndex: 0, chain: [] };
    const chain: StackingContextEntry[] = [];
    let current: Element | null = element;
    while (current && current !== document.documentElement) {
      const style = getComputedStyle(current);
      chain.push({ element: current, zIndex: numericZIndex(style.zIndex), createsStackingContext: createsStackingContext(style) });
      current = current.parentElement;
    }
    const outermost = [...chain].reverse().find(entry => entry.createsStackingContext);
    return { element: outermost?.element ?? null, zIndex: outermost?.zIndex ?? 0, chain };
  }
}

function numericZIndex(value: string): number | null {
  if (!value || value === "auto") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function createsStackingContext(style: CSSStyleDeclaration): boolean {
  const position = style.position;
  if (((position === "absolute" || position === "relative") && numericZIndex(style.zIndex) !== null) || position === "fixed" || position === "sticky") return true;
  if (Number.parseFloat(style.opacity || "1") < 1) return true;
  if (property(style, "transform") !== "none" || property(style, "filter") !== "none" || property(style, "perspective") !== "none") return true;
  if (style.isolation === "isolate" || (!!style.mixBlendMode && style.mixBlendMode !== "normal")) return true;
  const contain = property(style, "contain");
  if (/(^|\s)(layout|paint|strict|content)(\s|$)/.test(contain)) return true;
  const willChange = property(style, "willChange").split(",").map(value => value.trim());
  return willChange.some(value => ["transform", "opacity", "filter", "perspective", "contain"].includes(value));
}

function property(style: CSSStyleDeclaration, name: "transform" | "filter" | "perspective" | "contain" | "willChange"): string {
  return (style[name] || "none").trim();
}
