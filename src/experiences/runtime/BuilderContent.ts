import type { WidgetBuilderState } from "../types";
import type { RenderCallbacks } from "./AnchoredCardRenderer";
import { BUILDER_ALLOWED_ATTRIBUTES, BUILDER_ALLOWED_TAGS, BUILDER_BLOCKED_TAGS, BUILDER_SURVEY_INPUT_TAGS, builderImageUrlIsSafe, builderInputTypeIsSafe, builderLinkUrlIsSafe, safeScopedBuilderCss } from "./BuilderContentContract";
export type BuilderAction = { id: string; type: "next_step" | "previous_step" | "dismiss" } | { id: string; type: "open_url"; url: string } | { id: string; type: "track_event"; eventName: string };
export type BuilderRenderCallbacks = RenderCallbacks & { onActionId?: (action: BuilderAction, label: string) => void };

export function mountBuilderContent(root: ShadowRoot, card: HTMLElement, builder: WidgetBuilderState, callbacks: BuilderRenderCallbacks, allowSurveyInputs = false): boolean {
  const html = sanitizeBuilderHtml(builder.html, allowSurveyInputs);
  const css = safeBuilderCss(builder.css);
  if (!html || css === null) return false;
  let style = root.querySelector<HTMLStyleElement>("style[data-movcues-builder-style]");
  if (!style) { style = document.createElement("style"); style.dataset.movcuesBuilderStyle = ""; root.appendChild(style); }
  style.textContent = `${css}\n${ISOLATION_CSS}`;
  const content = document.createElement("div");
  content.className = "builder-content";
  content.dataset.movcuesBuilderSurface = "";
  content.append(...html);
  card.appendChild(content);
  card.classList.add("builder-card");
  card.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-movcues-action-id]") : null;
    if (!target || !card.contains(target)) return;
    const actionId = target.dataset.movcuesActionId;
    if (actionId === "primary") callbacks.onPrimary();
    else if (actionId === "secondary") callbacks.onSecondary();
    else {
      const action = findOnsiteAction(builder, actionId ?? "");
      if (action) callbacks.onActionId?.(action, target.textContent?.trim() ?? "");
    }
  });
  return true;
}

// Keep the builder surface scoped, but do not clip its visual overflow. The
// authored widget owns internal scrolling (`.movcues-widget { overflow: … }`)
// while shadows, outlines, and corner decorations must be able to paint beyond
// its layout box just as they do in the GrapesJS canvas.
const ISOLATION_CSS = `[data-movcues-builder-surface]{position:relative;overflow:visible;contain:layout style}[data-movcues-builder-surface]>.movcues-widget{position:relative!important;inset:auto!important}`;

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
    const action = element.getAttribute("data-movcues-action-id");
    if (action && action !== "primary" && action !== "secondary" && !/^[A-Za-z][A-Za-z0-9_-]{2,63}$/.test(action)) element.removeAttribute("data-movcues-action-id");
    const surveyAction = element.getAttribute("data-movcues-survey-action");
    if (surveyAction && surveyAction !== "back" && surveyAction !== "next" && surveyAction !== "submit") element.removeAttribute("data-movcues-survey-action");
    if (element.tagName === "IMG") {
      const source = element.getAttribute("src") ?? "";
      if (!builderImageUrlIsSafe(source)) element.removeAttribute("src");
    }
    if (element.hasAttribute("src") && element.tagName !== "IMG") element.removeAttribute("src");
    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      if (!builderLinkUrlIsSafe(href)) element.removeAttribute("href");
      const target = element.getAttribute("target");
      if (target && target !== "_blank" && target !== "_self") element.removeAttribute("target");
      if (target === "_blank") element.setAttribute("rel", "noopener noreferrer");
    } else {
      element.removeAttribute("href"); element.removeAttribute("target"); element.removeAttribute("rel");
    }
    if (element.tagName === "INPUT") {
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      if (!builderInputTypeIsSafe(type)) element.setAttribute("type", "text");
    }
  }
  const root = template.content.querySelector(".movcues-widget");
  if (!root) return null;
  for (const slot of ["primary", "secondary"]) {
    const actions = Array.from(template.content.querySelectorAll(`[data-movcues-action-id="${slot}"]`));
    actions.slice(1).forEach(action => action.remove());
  }
  return Array.from(template.content.childNodes);
}

function findOnsiteAction(builder: WidgetBuilderState, id: string): BuilderAction | null {
  const movcues = builder.projectData.movcues; const bindings = movcues && typeof movcues === "object" ? (movcues as Record<string, unknown>).actionBindings : null;
  const candidate = bindings && typeof bindings === "object" ? (bindings as Record<string, unknown>)[id] : null;
  if (!candidate || typeof candidate !== "object") return null;
  const action = candidate as Record<string, unknown>;
  if (action.id !== id || !["next_step", "previous_step", "dismiss", "open_url", "track_event"].includes(String(action.type))) return null;
  if (action.type === "open_url" && (typeof action.url !== "string" || !/^https?:\/\//i.test(action.url) || !builderLinkUrlIsSafe(action.url))) return null;
  if (action.type === "track_event" && (typeof action.eventName !== "string" || !action.eventName.trim() || action.eventName.length > 200)) return null;
  return action as BuilderAction;
}

export function safeBuilderCss(input: string): string | null {
  return safeScopedBuilderCss(input);
}
