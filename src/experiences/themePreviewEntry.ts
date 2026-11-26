import { ChecklistRenderer } from "./runtime/ChecklistRenderer";
import { ExperienceRenderer } from "./runtime/ExperienceRenderer";
import type { DeliveredChecklist, DeliveredExperience } from "./types";

type Preview = ((DeliveredExperience & { kind: "widget" | "guide" }) | Omit<DeliveredChecklist, "progress">) & { stepId?: string };

const experience = new ExperienceRenderer();
const checklist = new ChecklistRenderer();
const ignore = () => {};

// Loaded only in the dashboard preview iframe. No SDK initialization,
// analytics, storage, navigation, or visitor requests are needed.
if (window.parent !== window) window.addEventListener("message", event => {
  if (event.source !== window.parent || event.data?.type !== "movcues:theme-preview") return;
  const sample = event.data.sample as Preview;
  if (!sample?.definition) return;
  experience.destroy();
  checklist.destroy();
  const needsTarget = sample.kind === "guide" || (sample.kind === "widget" && (sample.widgetType === "anchored_card" || sample.widgetType === "hotspot"));
  if (needsTarget && !document.getElementById("theme-preview-target")) {
    const target = document.createElement("button");
    target.id = "theme-preview-target";
    target.type = "button";
    target.textContent = "Example page element";
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
    render();
  } else {
    experience.render(sample, { onVisible: ignore, onDismiss: ignore, onAction: ignore, onComplete: ignore, onSurveySubmit: ignore }, sample.stepId);
    if (sample.widgetType === "hotspot") document.querySelector("[data-movcues-experience-root]")?.shadowRoot
      ?.querySelector<HTMLButtonElement>(".hotspot")?.click();
  }
  window.parent.postMessage({ type: "movcues:theme-preview-rendered" }, "*");
});
