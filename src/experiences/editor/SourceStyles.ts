import postcss, { type Root, type Rule, type Declaration } from "postcss";

/** Shared source CSS restrictions, mirrored verbatim by the backend. */
export function sourceEditingCssErrors(css: string): string[] {
  let root: Root;
  try { root = postcss.parse(css); } catch { return ["Source CSS is not valid CSS."]; }
  const errors: string[] = [];
  root.walkAtRules(rule => { if (rule.name.toLowerCase() !== "media") errors.push(`CSS @${rule.name} is not supported.`); });
  root.walkRules(rule => {
    if (rule.parent?.type === "rule") errors.push("Nested CSS rules are not supported by live editing.");
    for (const selector of rule.selectors) {
      if (!/^\.movcues-widget(?:\b|[.#:[>+~\s])/.test(selector.trim())) errors.push(`Unscoped selector: ${selector}`);
      if (selector.includes("::") || /#[A-Za-z_-]/.test(selector) || selector.length > 512) errors.push(`Editable selectors must use classes/attributes, without IDs or pseudo-elements: ${selector}`);
    }
  });
  root.walkDecls(decl => {
    const property = decl.prop.toLowerCase(), value = decl.value.trim().toLowerCase();
    if (/^(?:animation|transition)(?:-|$)/.test(property) || ["behavior", "-moz-binding"].includes(property) || /expression\s*\(|javascript\s*:|url\s*\(/i.test(value)) errors.push(`Unsafe or unsupported CSS declaration: ${property}`);
    if (property === "position" && /^(absolute|fixed)$/.test(value) || property === "order" && value !== "0" || property === "flex-direction" && value.includes("reverse") || property === "grid-auto-flow" && value.includes("dense") || property === "content" && !["normal", "none"].includes(value)) errors.push(`Visual ordering/layout is not supported for live editing: ${property}: ${value}`);
  });
  return [...new Set(errors)];
}

/** Edits one existing declaration when isolated, otherwise one bounded per-element rule.
 * PostCSS preserves untouched declarations, comments, whitespace and @media byte-for-byte.
 */
export class SourceStyles {
  private root: Root;
  constructor(css: string, private widget: HTMLElement) { this.root = postcss.parse(css); }
  toString(): string { return this.root.toString(); }
  append(node: postcss.ChildNode): void { this.root.append(node); }

  responsiveStack(element: HTMLElement, enabled: boolean): void {
    if (!enabled) { element.removeAttribute("data-movcues-responsive-stack"); return; }
    element.dataset.movcuesResponsiveStack = "true";
    const identity = element.dataset.movcuesNodeId ? `data-movcues-node-id="${element.dataset.movcuesNodeId}"` : `data-movcues-block-id="${element.dataset.movcuesBlockId}"`;
    const marker = `[${identity}][data-movcues-responsive-stack="true"]`;
    const selector = element === this.widget ? `.movcues-widget${marker}` : `.movcues-widget ${marker}`;
    let media = this.root.nodes.find((node): node is postcss.AtRule => node.type === "atrule" && node.name === "media" && node.params === "(max-width:480px)");
    if (!media) { media = postcss.atRule({ name: "media", params: "(max-width:480px)" }); this.root.append(media); }
    if (media.nodes?.some(node => node.type === "rule" && node.selector === selector)) return;
    const rule = postcss.rule({ selector }); rule.append(postcss.decl({ prop: "display", value: "flex", important: true }), postcss.decl({ prop: "flex-direction", value: "column", important: true })); media.append(rule);
  }

  removeIdentities(ids: string[]): void {
    if (!ids.length) return;
    this.root.walkRules(rule => {
      const selectors = rule.selectors.filter(selector => !ids.some(id => ["node", "block"].some(key => {
        const marker = `[data-movcues-${key}-id="${id}"]`, count = selector.split(marker).length - 1;
        return count > 0 && (selector === `.movcues-widget ${marker.repeat(count)}` || selector === `.movcues-widget${marker.repeat(count)}`);
      })));
      if (!selectors.length) rule.remove(); else if (selectors.length !== rule.selectors.length) rule.selectors = selectors;
    });
  }

  private active(rule: Rule): boolean {
    let parent = rule.parent;
    while (parent && parent.type !== "root") {
      if (parent.type === "atrule" && parent.name === "media" && typeof matchMedia === "function" && !matchMedia(parent.params).matches) return false;
      if (parent.type === "atrule" && parent.name === "media" && typeof matchMedia !== "function") return false;
      parent = parent.parent;
    }
    return true;
  }

  private matches(rule: Rule, element: HTMLElement): boolean {
    try { return rule.selectors.some(selector => element.matches(selector)); }
    catch { throw new Error(`Cannot safely inspect CSS selector: ${rule.selector}`); }
  }

  value(element: HTMLElement, property: string): string | undefined {
    let value: string | undefined;
    this.root.walkRules(rule => {
      if (!this.active(rule) || !this.matches(rule, element)) return;
      const declaration = document.createElement("span").style;
      rule.walkDecls(decl => declaration.setProperty(decl.prop, decl.value, decl.important ? "important" : ""));
      value = declaration.getPropertyValue(property) || value;
    });
    if (!value && element.parentElement && ["color", "font-size", "font-weight", "line-height", "text-align"].includes(property)) return this.value(element.parentElement, property);
    return value;
  }

  set(element: HTMLElement, property: string, value: string): void {
    const rules: Rule[] = [];
    this.root.walkRules(rule => { if (this.matches(rule, element)) rules.push(rule); });
    const declares = (rule: Rule) => rule.nodes.some(node => node.type === "decl" && (node.prop === property || isShorthandFor(node.prop, property)));
    const active = rules.filter(rule => this.active(rule));
    const responsive = active.filter(rule => rule.parent?.type === "atrule" && declares(rule));
    // An edit follows an already-active responsive declaration, leaving other breakpoints intact.
    const scope = responsive[responsive.length - 1]?.parent ?? this.root;
    const scoped = active.filter(rule => rule.parent === scope);
    const key = element.dataset.movcuesBlockId ? "data-movcues-block-id" : "data-movcues-node-id", id = element.getAttribute(key)!;
    const marker = `[${key}="${id}"]`;
    const all = [this.widget, ...Array.from(this.widget.querySelectorAll<HTMLElement>("*"))];
    const isolated = scoped.filter(rule => all.filter(candidate => this.matches(rule, candidate)).length === 1);
    const declaring = active.filter(declares);
    let target: Rule | undefined = declaring.length === 1 && isolated.includes(declaring[0]) ? declaring[0] : declaring.length === 0 ? isolated[isolated.length - 1] : undefined;
    if (!target) {
      const isDedicated = (rule: Rule) => {
        const count = rule.selector.split(marker).length - 1;
        return count > 0 && rule.selector === (element === this.widget ? ".movcues-widget" : ".movcues-widget ") + marker.repeat(count);
      };
      target = scoped.find(isDedicated);
      // Counting selector tokens is a conservative upper bound (IDs are forbidden by the contract).
      const specificityBound = Math.max(1, ...active.filter(rule => rule !== target).map(rule => (rule.selector.match(/[.[:]/g) ?? []).length + 1));
      const selector = (element === this.widget ? ".movcues-widget" : ".movcues-widget ") + marker.repeat(specificityBound);
      if (target) target.selector = selector;
      else { target = postcss.rule({ selector }); scope!.append(target); }
    }
    let declaration: Declaration | undefined;
    target.walkDecls(property, decl => { declaration = decl; });
    const important = active.some(rule => rule.nodes.some(node => node.type === "decl" && node.important && (node.prop === property || isShorthandFor(node.prop, property))));
    if (declaration) { declaration.value = value; declaration.important ||= important; }
    else target.append(postcss.decl({ prop: property, value, important }));
  }
}

function isShorthandFor(shorthand: string, property: string): boolean {
  return shorthand === "font" && (property.startsWith("font-") || property === "line-height") || ["padding", "margin", "border", "background", "flex"].some(group => shorthand === group && property.startsWith(`${group}-`));
}

/** IDs are validated Movcues tokens; update only exact attribute selectors inside parsed CSS rules. */
export function remapSourceSelector(selector: string, attribute: string, ids: ReadonlyMap<string, string>): string {
  for (const [before, after] of ids) for (const quote of ['"', "'", ""]) selector = selector.split(`[${attribute}=${quote}${before}${quote}]`).join(`[${attribute}=${quote}${after}${quote}]`);
  return selector;
}
