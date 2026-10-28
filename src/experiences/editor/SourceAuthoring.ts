import { BUILDER_ALLOWED_ATTRIBUTES, BUILDER_ALLOWED_TAGS, BUILDER_SURVEY_INPUT_TAGS, builderImageUrlIsSafe, builderInputTypeIsSafe, builderLinkUrlIsSafe, safeScopedBuilderCss } from "../runtime/BuilderContentContract";
import type { ExperienceContent, WidgetBuilderState } from "../types";

export type SourceAction =
  | { type: "dismiss" | "next_step" | "previous_step" }
  | { type: "open_url"; url: string }
  | { type: "track_event"; eventName: string };
export interface ReplaceMarkupOperation { type: "replace_markup"; stepId?: string; html: string; css: string; actionBindings: Record<string, SourceAction> }

const actionIdPattern = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;

function parse(html: string): HTMLTemplateElement { const template = document.createElement("template"); template.innerHTML = html; return template; }

export function validateSourceMarkup(operation: ReplaceMarkupOperation, options: { widgetType: string; guide: boolean; survey?: { questions: Array<{ id: string; type: string }> }; checklist?: { items: Array<{ id: string }> } }): string[] {
  const errors: string[] = [];
  if (operation.html.length > 100_000 || operation.css.length > 100_000) errors.push("Source proposal is too large.");
  if (safeScopedBuilderCss(operation.css) === null) errors.push("Source CSS is unsafe or contains an unscoped selector.");
  const template = parse(operation.html), elements = Array.from(template.content.querySelectorAll<HTMLElement>("*"));
  for (const element of elements) {
    if (!BUILDER_ALLOWED_TAGS.has(element.tagName) && !(options.survey && BUILDER_SURVEY_INPUT_TAGS.has(element.tagName))) errors.push(`Unsupported element: ${element.tagName.toLowerCase()}`);
    for (const attribute of Array.from(element.attributes)) if (!BUILDER_ALLOWED_ATTRIBUTES.has(attribute.name) || /^on/i.test(attribute.name)) errors.push(`Unsupported attribute: ${attribute.name}`);
    if (element instanceof HTMLImageElement && !builderImageUrlIsSafe(element.getAttribute("src") ?? "")) errors.push("Unsafe image URL.");
    if (element instanceof HTMLAnchorElement && !builderLinkUrlIsSafe(element.getAttribute("href") ?? "")) errors.push("Unsafe link URL.");
    if (element instanceof HTMLInputElement && !builderInputTypeIsSafe(element.type)) errors.push("Unsafe input type.");
  }
  const roots = elements.filter(element => element.classList.contains("movcues-widget"));
  if (roots.length !== 1) errors.push("Source HTML must contain exactly one .movcues-widget root.");
  const topLevelElements = Array.from(template.content.children); if (topLevelElements.length !== 1 || topLevelElements[0] !== roots[0] || Array.from(template.content.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) errors.push("The .movcues-widget root must be the sole top-level element.");
  if (roots[0]?.dataset.movcuesWidgetType !== options.widgetType) errors.push("The widget root type cannot be changed.");
  if (roots[0] && !roots[0].dataset.movcuesDocumentVersion) errors.push("The widget root document version must be preserved.");
  const ids = elements.map(element => element.id).filter(Boolean); if (new Set(ids).size !== ids.length) errors.push("Source HTML contains duplicate IDs.");
  const buttons = elements.filter((element): element is HTMLButtonElement => element instanceof HTMLButtonElement && !element.dataset.movcuesSurveyAction && !element.dataset.movcuesChecklistRole && !element.dataset.movcuesChecklistItemRole);
  const actionIds = buttons.map(button => button.dataset.movcuesActionId ?? "");
  if (actionIds.some(value => !actionIdPattern.test(value)) || new Set(actionIds).size !== actionIds.length) errors.push("Every ordinary button needs one unique valid action ID.");
  const bindings = Object.keys(operation.actionBindings);
  if (bindings.length !== actionIds.length || actionIds.some(value => !(value in operation.actionBindings))) errors.push("Button actions and action bindings must match exactly.");
  for (const action of Object.values(operation.actionBindings)) {
    if (!options.guide && (action.type === "next_step" || action.type === "previous_step")) errors.push(`${action.type} is only supported by Guides.`);
    if (action.type === "open_url" && !/^https?:\/\//i.test(action.url)) errors.push("Open URL actions must use HTTP(S).");
    if (action.type === "track_event" && (!action.eventName.trim() || /[\u0000-\u001f\u007f]/.test(action.eventName))) errors.push("Track-event action is invalid.");
  }
  if (options.survey) {
    for (const question of options.survey.questions) { const matches = elements.filter(element => element.dataset.movcuesQuestionId === question.id); if (matches.length !== 1 || matches[0].dataset.movcuesQuestionType !== question.type) errors.push(`Survey question ${question.id} was changed or removed.`); }
    if (elements.filter(element => element.hasAttribute("data-movcues-survey-controls")).length !== 1 || elements.filter(element => element.dataset.movcuesSurveyAction === "submit").length !== 1) errors.push("Survey controls and submission must be preserved.");
  }
  if (options.checklist) {
    for (const role of ["root", "title", "items", "progress", "launcher-label", "remaining-count", "completion-title", "completion-description", "completion-acknowledge"]) if (elements.filter(element => element.dataset.movcuesChecklistRole === role).length !== 1) errors.push(`Checklist role ${role} must be preserved.`);
    for (const item of options.checklist.items) if (elements.filter(element => element.dataset.movcuesChecklistItemId === item.id).length !== 1) errors.push(`Checklist item ${item.id} must be preserved.`);
  }
  return [...new Set(errors)];
}

export function applySourceMarkup(builder: WidgetBuilderState, content: ExperienceContent, operation: ReplaceMarkupOperation, options: Parameters<typeof validateSourceMarkup>[1]): void {
  const errors = validateSourceMarkup(operation, options); if (errors.length) throw new Error(errors.join(" "));
  const previous = builder.projectData.movcues && typeof builder.projectData.movcues === "object" ? builder.projectData.movcues as Record<string, unknown> : {};
  builder.html = operation.html; builder.css = operation.css;
  builder.projectData = { ...builder.projectData, movcues: { ...previous, authoringSurface: "source", sourceVersion: 1, actionBindings: structuredClone(operation.actionBindings) } };
  const template = parse(operation.html), heading = template.content.querySelector<HTMLElement>('[data-movcues-content="heading"]'), body = template.content.querySelector<HTMLElement>('[data-movcues-content="body"]');
  if (heading) content.heading = (heading.textContent ?? "").trim().slice(0, 500); if (body) content.body = (body.textContent ?? "").trim().slice(0, 10_000);
}

export function sourceContext(builder: WidgetBuilderState, guide: boolean) {
  const movcues = builder.projectData.movcues && typeof builder.projectData.movcues === "object" ? builder.projectData.movcues as Record<string, unknown> : {};
  return { html: builder.html, css: builder.css, authoringSurface: movcues.authoringSurface === "source" ? "source" as const : "onsite" as const, actionBindings: structuredClone(movcues.actionBindings ?? {}), supportedActions: guide ? ["dismiss", "next_step", "previous_step", "open_url", "track_event"] as const : ["dismiss", "open_url", "track_event"] as const };
}

export function isSourceAuthored(builder?: WidgetBuilderState): boolean { const movcues = builder?.projectData.movcues; return Boolean(movcues && typeof movcues === "object" && (movcues as Record<string, unknown>).authoringSurface === "source"); }
