import { BUILDER_ALLOWED_ATTRIBUTES, BUILDER_ALLOWED_TAGS, BUILDER_SURVEY_INPUT_TAGS, builderImageUrlIsSafe, builderInputTypeIsSafe, builderLinkUrlIsSafe, safeScopedBuilderCss } from "../runtime/BuilderContentContract";
import { SOURCE_EDITABILITY, sourceEditabilityErrors, type SourceElement } from "./SourceEditability";
import { sourceEditingCssErrors } from "./SourceStyles";
import type { ExperienceContent, WidgetBuilderState } from "../types";

export type SourceAction =
  | { type: "dismiss" | "next_step" | "previous_step" }
  | { type: "open_url"; url: string }
  | { type: "track_event"; eventName: string };
export interface ReplaceMarkupOperation { type: "replace_markup"; stepId?: string; widthPx?: number; html: string; css: string; actionBindings: Record<string, SourceAction> }

const actionIdPattern = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;

function parse(html: string): HTMLTemplateElement { const template = document.createElement("template"); template.innerHTML = html; return template; }

export function validateSourceMarkup(operation: ReplaceMarkupOperation, options: { widgetType: string; guide: boolean; survey?: { questions: Array<{ id: string; type: string; options?: Array<{ id: string }>; min?: number; max?: number; maxLength?: number; required?: boolean }> }; checklist?: { items: Array<{ id: string }> }; editable?: boolean; previousHtml?: string }): string[] {
  const errors: string[] = [];
  if (operation.widthPx !== undefined && (options.widgetType !== "modal" || !Number.isInteger(operation.widthPx) || operation.widthPx < 320 || operation.widthPx > 960)) errors.push("Modal width must be a whole number from 320 to 960px.");
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
  const buttons = elements.filter((element): element is HTMLButtonElement => element instanceof HTMLButtonElement && !element.dataset.movcuesSurveyAction && !element.dataset.movcuesOptionId && !element.dataset.movcuesChecklistRole && !element.dataset.movcuesChecklistItemRole);
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
    const taskElements = elements.filter(element => element.hasAttribute("data-movcues-checklist-item-id") || element.dataset.movcuesChecklistRole === "item");
    const taskIds = taskElements.map(element => element.dataset.movcuesChecklistItemId ?? "");
    if (taskElements.some(element => element.tagName !== "BUTTON" || element.dataset.movcuesChecklistRole !== "item")) errors.push("Checklist task components must use canonical button/item semantics.");
    if (taskIds.length !== options.checklist.items.length || taskIds.some(id => !options.checklist!.items.some(item => item.id === id))) errors.push("Checklist source task identities must match the canonical items exactly.");
    for (const role of ["root", "title", "items", "progress", "launcher-label", "remaining-count", "completion-title", "completion-description", "completion-acknowledge"]) if (elements.filter(element => element.dataset.movcuesChecklistRole === role).length !== 1) errors.push(`Checklist role ${role} must be preserved.`);
    for (const item of options.checklist.items) if (elements.filter(element => element.dataset.movcuesChecklistItemId === item.id).length !== 1) errors.push(`Checklist item ${item.id} must be preserved.`);
  }
  if (options.editable && roots[0]) errors.push(...sourceEditabilityErrors(sourceElement(roots[0]), options.previousHtml && parse(options.previousHtml).content.firstElementChild ? sourceElement(parse(options.previousHtml).content.firstElementChild!) : undefined, options.survey?.questions), ...sourceEditingCssErrors(operation.css));
  return [...new Set(errors)];
}

export function applySourceMarkup(builder: WidgetBuilderState, content: ExperienceContent, operation: ReplaceMarkupOperation, options: Parameters<typeof validateSourceMarkup>[1]): void {
  const errors = validateSourceMarkup(operation, { ...options, editable: true, previousHtml: options.previousHtml ?? builder.html }); if (errors.length) throw new Error(errors.join(" "));
  const previous = builder.projectData.movcues && typeof builder.projectData.movcues === "object" ? builder.projectData.movcues as Record<string, unknown> : {};
  builder.html = operation.html; builder.css = operation.css;
  builder.projectData = { ...builder.projectData, movcues: { ...previous, authoringSurface: "source", sourceVersion: 1, sourceEditabilityVersion: SOURCE_EDITABILITY.version, actionBindings: structuredClone(operation.actionBindings) } };
  const template = parse(operation.html), heading = template.content.querySelector<HTMLElement>('[data-movcues-content="heading"]'), body = template.content.querySelector<HTMLElement>('[data-movcues-content="body"]');
  if (heading) content.heading = (heading.textContent ?? "").trim().slice(0, 500); if (body) content.body = (body.textContent ?? "").trim().slice(0, 10_000);
}

export function sourceContext(builder: WidgetBuilderState, guide: boolean) {
  const movcues = builder.projectData.movcues && typeof builder.projectData.movcues === "object" ? builder.projectData.movcues as Record<string, unknown> : {};
  return { html: builder.html, css: builder.css, authoringSurface: movcues.authoringSurface === "source" ? "source" as const : "onsite" as const, actionBindings: structuredClone(movcues.actionBindings ?? {}), supportedActions: guide ? ["dismiss", "next_step", "previous_step", "open_url", "track_event"] as const : ["dismiss", "open_url", "track_event"] as const };
}

/**
 * Keep the structured document useful to the AI without duplicating large inline
 * images that are already present, byte-for-byte, in sourceContext().html.
 */
export function aiDocumentContext<T>(value: T): T {
  const clone = structuredClone(value);
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object") return;
    for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
      if (key === "src" && typeof item === "string" && /^data:image\//i.test(item)) {
        (node as Record<string, unknown>)[key] = `[inline image data omitted from structured context; ${item.length} characters; preserve the image from source HTML]`;
      } else visit(item);
    }
  };
  visit(clone);
  return clone;
}

export function isSourceAuthored(builder?: WidgetBuilderState): boolean { const movcues = builder?.projectData.movcues; return Boolean(movcues && typeof movcues === "object" && (movcues as Record<string, unknown>).authoringSurface === "source"); }

export function sourceElement(element: Element): SourceElement {
  return { tag: element.tagName.toLowerCase(), attrs: Object.fromEntries(Array.from(element.attributes, attr => [attr.name, attr.value])), text: Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent ?? "").join(""), children: Array.from(element.children, sourceElement) };
}
