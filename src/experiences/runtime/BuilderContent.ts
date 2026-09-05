import type { WidgetBuilderState } from "../types";
import type { RenderCallbacks } from "./AnchoredCardRenderer";

const ALLOWED_TAGS = new Set(["DIV", "SECTION", "H1", "H2", "H3", "H4", "P", "SPAN", "BUTTON", "IMG", "HR"]);
const ALLOWED_ATTRIBUTES = new Set(["class", "id", "title", "role", "aria-label", "alt", "src", "width", "height", "data-loopz-action-id", "data-loopz-content", "data-loopz-widget-type"]);

export function mountBuilderContent(root: ShadowRoot, card: HTMLElement, builder: WidgetBuilderState, callbacks: RenderCallbacks): boolean {
  const html = sanitizeBuilderHtml(builder.html);
  const css = safeBuilderCss(builder.css);
  if (!html || css === null) return false;
  let style = root.querySelector<HTMLStyleElement>("style[data-loopz-builder-style]");
  if (!style) { style = document.createElement("style"); style.dataset.loopzBuilderStyle = ""; root.appendChild(style); }
  style.textContent = `${css}\n${ISOLATION_CSS}`;
  const content = document.createElement("div");
  content.className = "builder-content";
  content.dataset.loopzBuilderSurface = "";
  content.append(...html);
  card.appendChild(content);
  card.classList.add("builder-card");
  card.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-loopz-action-id]") : null;
    if (!target || !card.contains(target)) return;
    if (target.dataset.loopzActionId === "primary") callbacks.onPrimary();
    if (target.dataset.loopzActionId === "secondary") callbacks.onSecondary();
  });
  return true;
}

const ISOLATION_CSS = `[data-loopz-builder-surface]{position:relative;overflow:hidden;contain:layout style paint}[data-loopz-builder-surface]>.loopz-widget{position:relative!important;inset:auto!important;max-width:100%!important}`;

export function sanitizeBuilderHtml(input: string): ChildNode[] | null {
  const template = document.createElement("template");
  template.innerHTML = input;
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/i.test(element.tagName)) element.remove();
      else element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (!ALLOWED_ATTRIBUTES.has(name) || name.startsWith("on") || /javascript\s*:/i.test(attribute.value)) element.removeAttribute(attribute.name);
    }
    const action = element.getAttribute("data-loopz-action-id");
    if (action && action !== "primary" && action !== "secondary") element.removeAttribute("data-loopz-action-id");
    if (element.tagName === "IMG") {
      const source = element.getAttribute("src") ?? "";
      if (source && !/^(https?:|data:image\/(?:png|gif|jpeg|webp);base64,|\/)/i.test(source)) element.removeAttribute("src");
    }
  }
  const root = template.content.querySelector(".loopz-widget");
  if (!root) return null;
  for (const slot of ["primary", "secondary"]) {
    const actions = Array.from(template.content.querySelectorAll(`[data-loopz-action-id="${slot}"]`));
    actions.slice(1).forEach(action => action.remove());
  }
  return Array.from(template.content.childNodes);
}

export function safeBuilderCss(input: string): string | null {
  const css = input.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (/@import|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding/i.test(css)) return null;
  const rule = /([^{}]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = rule.exec(css)) !== null) {
    const prelude = match[1].trim();
    if (!prelude || prelude.startsWith("@")) continue;
    if (prelude.split(",").some((selector: string) => !selector.trim().includes(".loopz-widget"))) return null;
  }
  return css;
}
