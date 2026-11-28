import { ChecklistRenderer } from "./runtime/ChecklistRenderer";
import { ExperienceRenderer } from "./runtime/ExperienceRenderer";
import { getGuideStepPattern, isGuideDefinition, type DeliveredChecklist, type DeliveredExperience } from "./types";

type Preview = ((DeliveredExperience & { kind: "widget" | "guide" }) | Omit<DeliveredChecklist, "progress">) & { stepId?: string };

const experience = new ExperienceRenderer();
const checklist = new ChecklistRenderer();
const ignore = () => {};
const previewTarget = { primarySelector: "#theme-preview-target", fallbackSelectors: [], reliability: "reliable" as const };
let observer: ResizeObserver | undefined;
let measurement = 0;

function prepareCanvasSample(sample: Preview): Preview {
  if (sample.kind === "checklist") return sample;
  const definition = sample.definition;
  if (isGuideDefinition(definition)) {
    return { ...sample, definition: { ...definition, steps: definition.steps.map(step => {
      if (step.id !== sample.stepId) return step;
      // Use a representative element in this document and show the step immediately.
      const anchored = getGuideStepPattern(step) === "anchored_card";
      const advance = step.advance;
      return {
        ...step, presentation: undefined, target: anchored ? previewTarget : undefined,
        advance: advance?.type === "element_click" || advance?.type === "element_hover"
          ? { ...advance, target: previewTarget }
          : advance,
      };
    }) } };
  }
  if (sample.widgetType === "anchored_card" || sample.widgetType === "hotspot")
    return { ...sample, definition: { ...definition, target: previewTarget } };
  return sample;
}

function reportCanvasBounds(renderId: number, anchored: boolean) {
  cancelAnimationFrame(measurement);
  measurement = requestAnimationFrame(() => {
    const experienceRoot = document.querySelector("[data-movcues-experience-root]")?.shadowRoot;
    const checklistRoot = document.querySelector("[data-movcues-checklist]")?.shadowRoot;
    const component = experienceRoot?.querySelector(".card") ?? checklistRoot?.querySelector(".surface");
    const target = anchored ? document.getElementById("theme-preview-target") : null;
    const bounds = [component, target].flatMap(element => element ? [element.getBoundingClientRect()] : []);
    if (!bounds.length) return;
    const x = Math.max(0, Math.floor(Math.min(...bounds.map(item => item.left)) - 12));
    const y = Math.max(0, Math.floor(Math.min(...bounds.map(item => item.top)) - 12));
    const right = Math.min(innerWidth, Math.ceil(Math.max(...bounds.map(item => item.right)) + 12));
    const bottom = Math.min(innerHeight, Math.ceil(Math.max(...bounds.map(item => item.bottom)) + 12));
    window.parent.postMessage({ type: "movcues:theme-preview-rendered", renderId, bounds: { x, y, width: right - x, height: bottom - y } }, "*");
    observer?.disconnect();
    observer = new ResizeObserver(() => {
      const current = component?.getBoundingClientRect();
      const previous = bounds[0];
      if (current && (Math.abs(current.width - previous.width) > 1 || Math.abs(current.height - previous.height) > 1))
        reportCanvasBounds(renderId, anchored);
    });
    if (component) observer.observe(component);
  });
}

// Loaded only in the dashboard preview iframe. No SDK initialization,
// analytics, storage, navigation, or visitor requests are needed.
if (window.parent !== window) window.addEventListener("message", event => {
  if (event.source !== window.parent || event.data?.type !== "movcues:theme-preview") return;
  const requested = event.data.sample as Preview;
  if (!requested?.definition) return;
  const canvas = event.data.canvas === true && Number.isSafeInteger(event.data.renderId);
  const sample = canvas ? prepareCanvasSample(requested) : requested;
  observer?.disconnect();
  cancelAnimationFrame(measurement);
  experience.destroy();
  checklist.destroy();
  const anchoredGuide = sample.kind === "guide" && isGuideDefinition(sample.definition) &&
    sample.definition.steps.some(step => step.id === sample.stepId && getGuideStepPattern(step) === "anchored_card");
  const needsTarget = (canvas ? anchoredGuide : sample.kind === "guide") || (sample.kind === "widget" && (sample.widgetType === "anchored_card" || sample.widgetType === "hotspot"));
  if (canvas) document.getElementById("theme-preview-target")?.remove();
  if (needsTarget && !document.getElementById("theme-preview-target")) {
    const target = document.createElement("button");
    target.id = "theme-preview-target";
    target.type = "button";
    target.textContent = canvas ? event.data.targetLabel ?? "Target element" : "Example page element";
    document.body.append(target);
  }
  if (sample.kind === "checklist") {
    const render = (collapsed = false, completed: string[] = []): void => { checklist.render({
      ...sample,
      kind: "checklist",
      definition: sample.definition,
      progress: {
        stateId: "preview",
        collapsed,
        dismissed: false,
        complete: false,
        completionAcknowledged: false,
        completedItemIds: completed,
        items: sample.definition.items.map(item => ({ id: item.id, state: completed.includes(item.id) ? "completed" : "available" })),
      },
    }, {
      onOpen: () => render(false, completed),
      onCollapse: () => render(true, completed),
      onDismiss: () => render(true, completed),
      onAcknowledge: ignore,
      onItemClick: id => render(false, [...new Set([...completed, id])]),
    }); };
    render(canvas && sample.definition.behavior.initialState === "collapsed");
  } else {
    experience.render(sample, { onVisible: ignore, onDismiss: ignore, onAction: ignore, onComplete: ignore, onSurveySubmit: ignore }, sample.stepId);
    if (sample.widgetType === "hotspot") document.querySelector("[data-movcues-experience-root]")?.shadowRoot
      ?.querySelector<HTMLButtonElement>(".hotspot")?.click();
  }
  if (canvas) reportCanvasBounds(event.data.renderId, needsTarget);
  else window.parent.postMessage({ type: "movcues:theme-preview-rendered" }, "*");
});
