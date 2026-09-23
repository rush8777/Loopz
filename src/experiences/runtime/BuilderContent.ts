import type { WidgetBuilderState } from "../types";
import type { RenderCallbacks } from "./AnchoredCardRenderer";
import { BUILDER_ALLOWED_ATTRIBUTES, BUILDER_ALLOWED_TAGS, BUILDER_BLOCKED_TAGS, BUILDER_SURVEY_INPUT_TAGS, builderImageUrlIsSafe, builderInputTypeIsSafe, safeScopedBuilderCss } from "./BuilderContentContract";

export function mountBuilderContent(root: ShadowRoot, card: HTMLElement, builder: WidgetBuilderState, callbacks: RenderCallbacks, allowSurveyInputs = false): boolean {
  const html = sanitizeBuilderHtml(builder.html, allowSurveyInputs);
  const css = safeBuilderCss(builder.css);
  if (!html || css === null) return false;
  let style = root.querySelector<HTMLStyleElement>("style[data-movecues-builder-style]");
  if (!style) { style = document.createElement("style"); style.dataset.movecuesBuilderStyle = ""; root.appendChild(style); }
  style.textContent = `${css}\n${ISOLATION_CSS}`;
  const content = document.createElement("div");
  content.className = "builder-content";
  content.dataset.movecuesBuilderSurface = "";
  content.append(...html);
  card.appendChild(content);
  card.classList.add("builder-card");
  card.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-movecues-action-id]") : null;
    if (!target || !card.contains(target)) return;
    if (target.dataset.movecuesActionId === "primary") callbacks.onPrimary();
    if (target.dataset.movecuesActionId === "secondary") callbacks.onSecondary();
  });
  return true;
}

// Keep the builder surface scoped, but do not clip its visual overflow. The
// authored widget owns internal scrolling (`.movecues-widget { overflow: … }`)
// while shadows, outlines, and corner decorations must be able to paint beyond
// its layout box just as they do in the GrapesJS canvas.
const ISOLATION_CSS = `[data-movecues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movecues-builder-surface]>.movecues-widget{position:relative!important;inset:auto!important}`;

export function sanitizeBuilderHtml(input: string, allowSurveyInputs = false): ChildNode[] | null {
  const template = document.createElement("template");
  template.innerHTML = input;
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    const allowedTag = BUILDER_ALLOWED_TAGS.has(element.tagName) || (allowSurveyInputs && BUILDER_SURVEY_INPUT_TAGS.has(element.tagName));
    if (!allowedTag) {
      if (BUILDER_BLOCKED_TAGS.test(element.tagName)) element.remove();
      else element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (!BUILDER_ALLOWED_ATTRIBUTES.has(name) || name.startsWith("on") || /javascript\s*:/i.test(attribute.value)) element.removeAttribute(attribute.name);
    }
    const action = element.getAttribute("data-movecues-action-id");
    if (action && action !== "primary" && action !== "secondary") element.removeAttribute("data-movecues-action-id");
    const surveyAction = element.getAttribute("data-movecues-survey-action");
    if (surveyAction && surveyAction !== "back" && surveyAction !== "next" && surveyAction !== "submit") element.removeAttribute("data-movecues-survey-action");
    if (element.tagName === "IMG") {
      const source = element.getAttribute("src") ?? "";
      if (!builderImageUrlIsSafe(source)) element.removeAttribute("src");
    }
    if (element.hasAttribute("src") && element.tagName !== "IMG") element.removeAttribute("src");
    if (element.tagName === "INPUT") {
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      if (!builderInputTypeIsSafe(type)) element.setAttribute("type", "text");
    }
  }
  const root = template.content.querySelector(".movecues-widget");
  if (!root) return null;
  for (const slot of ["primary", "secondary"]) {
    const actions = Array.from(template.content.querySelectorAll(`[data-movecues-action-id="${slot}"]`));
    actions.slice(1).forEach(action => action.remove());
  }
  return Array.from(template.content.childNodes);
}

export function safeBuilderCss(input: string): string | null {
  return safeScopedBuilderCss(input);
}
