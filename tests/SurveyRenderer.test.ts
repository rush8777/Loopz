import { beforeEach, describe, expect, it, vi } from "vitest";
import { SurveyRenderer } from "../src/experiences/runtime/SurveyRenderer";
import { ExperienceRenderer } from "../src/experiences/runtime/ExperienceRenderer";
import type { DeliveredExperience, SurveyConfig, WidgetBuilderState } from "../src/experiences/types";

function builder(html: string): WidgetBuilderState { return { version: 1, projectData: {}, html: `<section class="movcues-widget">${html}<div class="movcues-survey-validation"></div><footer><button data-movcues-survey-action="back">Back</button><button data-movcues-survey-action="next">Next</button><button data-movcues-survey-action="submit">Submit</button></footer></section>`, css: ".movcues-widget{padding:20px}.movcues-widget .is-selected{color:blue}" }; }

describe("SurveyRenderer", () => {
  beforeEach(() => { document.documentElement.innerHTML = "<head></head><body></body>"; });
  it("validates required answers and preserves them across Next and Back before submit", async () => {
    const survey: SurveyConfig = { showProgress: true, allowBack: true, submitLabel: "Send feedback", steps: [
      { id: "intro", content: { heading: "Choose", body: "" }, questions: [{ id: "choice", type: "single_choice", label: "Pick one", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }], builder: builder('<div data-movcues-question-id="choice" data-movcues-question-type="single_choice"><button data-movcues-option-id="a">A</button><button data-movcues-option-id="b">B</button></div>') },
      { id: "followup", content: { heading: "Why?", body: "" }, questions: [{ id: "detail", type: "short_text", label: "Details" }], builder: builder('<div data-movcues-question-id="detail" data-movcues-question-type="short_text"><input type="text" data-movcues-question-input></div>') },
    ] };
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); root.appendChild(document.createElement("style")); document.body.appendChild(host);
    const progress = vi.fn(); const submit = vi.fn(); const renderer = new SurveyRenderer(); renderer.render(root, { heading: "Survey", body: "Feedback" }, { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, { dismissible: true, backdrop: true }, survey, { onDismiss: vi.fn(), onProgress: progress, onSubmit: submit });
    root.querySelector<HTMLButtonElement>('[data-movcues-survey-action="next"]')!.click(); expect(root.textContent).toContain("required questions"); expect(progress).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('[data-movcues-option-id="b"]')!.click(); root.querySelector<HTMLButtonElement>('[data-movcues-survey-action="next"]')!.click(); await vi.waitFor(() => expect(root.querySelector("[data-movcues-question-input]")).not.toBeNull());
    const input = root.querySelector<HTMLInputElement>("[data-movcues-question-input]")!; const progressCallsBeforeTyping = progress.mock.calls.length; input.value = "Because"; input.dispatchEvent(new Event("input", { bubbles: true })); expect(progress).toHaveBeenCalledTimes(progressCallsBeforeTyping); root.querySelector<HTMLButtonElement>('[data-movcues-survey-action="back"]')!.click();
    expect(root.querySelector('[data-movcues-option-id="b"]')?.classList.contains("is-selected")).toBe(true); root.querySelector<HTMLButtonElement>('[data-movcues-survey-action="next"]')!.click(); await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>("[data-movcues-question-input]")?.value).toBe("Because"));
    root.querySelector<HTMLButtonElement>('[data-movcues-survey-action="submit"]')!.click(); await vi.waitFor(() => expect(submit).toHaveBeenCalledWith({ choice: "b", detail: "Because" }, "followup")); renderer.destroy();
  });

  it("does not recreate builder-owned controls that the designer removed", () => {
    const builderWithoutBackOrSubmit = { version: 1 as const, projectData: {}, html: '<section class="movcues-widget"><div data-movcues-survey-controls="builder"><button data-movcues-survey-action="next">Next</button></div></section>', css: ".movcues-widget{padding:20px}" };
    const survey: SurveyConfig = { showProgress: false, allowBack: true, submitLabel: "Send", steps: [
      { id: "first", content: { heading: "First", body: "" }, questions: [], builder: builderWithoutBackOrSubmit },
      { id: "final", content: { heading: "Final", body: "" }, questions: [], builder: builderWithoutBackOrSubmit },
    ] };
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); root.appendChild(document.createElement("style")); document.body.appendChild(host);
    new SurveyRenderer().render(root, { heading: "Survey", body: "" }, { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, { dismissible: true, backdrop: true }, survey, { onDismiss: vi.fn(), onProgress: vi.fn(), onSubmit: vi.fn() }, "final");
    expect(root.querySelector('[data-movcues-survey-action="back"]')).toBeNull(); expect(root.querySelector('[data-movcues-survey-action="submit"]')).toBeNull(); expect(root.querySelector<HTMLButtonElement>('[data-movcues-survey-action="next"]')?.hidden).toBe(true);
  });

  it("updates the host layer when the active Survey step changes", async () => {
    const survey: SurveyConfig = { showProgress: false, allowBack: true, submitLabel: "Send", steps: [
      { id: "first", content: { heading: "First", body: "" }, questions: [], behavior: { layer: { mode: "custom", zIndex: 110 } }, builder: builder("") },
      { id: "second", content: { heading: "Second", body: "" }, questions: [], behavior: { layer: { mode: "custom", zIndex: 220 } }, builder: builder("") },
    ] };
    const experience: DeliveredExperience = { id: "survey_layers", versionId: "v1", kind: "widget", widgetType: "survey", priority: 1, definition: { content: { heading: "Survey", body: "" }, design: { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, behavior: { dismissible: true, layer: { mode: "custom", zIndex: 50 } }, survey } };
    const renderer = new ExperienceRenderer(); renderer.render(experience, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn(), onSurveyProgress: vi.fn() });
    const host = document.querySelector<HTMLElement>('[data-movcues-experience="survey_layers"]')!; expect(host.style.zIndex).toBe("110");
    host.shadowRoot!.querySelector<HTMLButtonElement>('[data-movcues-survey-action="next"]')!.click();
    await vi.waitFor(() => expect(host.style.zIndex).toBe("220")); renderer.destroy();
  });

  it("uses every authored survey action, without inferring it from labels, classes, or order", () => {
    const authored = (actions: string) => ({ version: 1 as const, projectData: {}, html: `<section class="movcues-widget"><div class="movcues-survey-validation"></div>${actions}</section>`, css: ".movcues-widget{padding:20px}" });
    const buttons = '<button class="movcues-widget__button" data-movcues-survey-action="submit">Continue</button><button class="movcues-widget__button movcues-widget__button--secondary" data-movcues-survey-action="back">Anything</button><button data-movcues-survey-action="next">Forward A</button><button class="movcues-widget__button--secondary" data-movcues-survey-action="next">Forward B</button>';
    const survey: SurveyConfig = { showProgress: false, allowBack: true, submitLabel: "Ignored for authored labels", steps: [
      { id: "first", content: { heading: "First", body: "" }, questions: [], builder: authored(buttons) },
      { id: "middle", content: { heading: "Middle", body: "" }, questions: [], builder: authored(buttons) },
      { id: "final", content: { heading: "Final", body: "" }, questions: [], builder: authored(buttons) },
    ] };
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); root.appendChild(document.createElement("style")); document.body.appendChild(host);
    const render = (step: string) => new SurveyRenderer().render(root, { heading: "Survey", body: "" }, { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, { dismissible: true, backdrop: true }, survey, { onDismiss: vi.fn(), onProgress: vi.fn(), onSubmit: vi.fn() }, step);
    const hidden = (action: string) => Array.from(root.querySelectorAll<HTMLButtonElement>(`[data-movcues-survey-action="${action}"]`)).map(button => button.hidden);
    render("first"); expect(hidden("back")).toEqual([true]); expect(hidden("next")).toEqual([false, false]); expect(hidden("submit")).toEqual([true]);
    render("middle"); expect(hidden("back")).toEqual([false]); expect(hidden("next")).toEqual([false, false]); expect(hidden("submit")).toEqual([true]);
    render("final"); expect(hidden("back")).toEqual([false]); expect(hidden("next")).toEqual([true, true]); const finalSubmit = root.querySelector<HTMLButtonElement>('[data-movcues-survey-action="submit"]')!; expect(finalSubmit.hidden).toBe(false); expect(finalSubmit.textContent).toBe("Continue");
  });

  it("does not add controls when a new survey author omitted them", () => {
    const survey: SurveyConfig = { showProgress: false, allowBack: true, submitLabel: "Send", steps: [{ id: "only", content: { heading: "Only", body: "" }, questions: [], builder: { version: 1, projectData: {}, html: '<section class="movcues-widget"><div class="movcues-survey-validation"></div></section>', css: ".movcues-widget{padding:20px}" } }] };
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); root.appendChild(document.createElement("style")); document.body.appendChild(host);
    new SurveyRenderer().render(root, { heading: "Survey", body: "" }, { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, { dismissible: true, backdrop: true }, survey, { onDismiss: vi.fn(), onProgress: vi.fn(), onSubmit: vi.fn() });
    expect(root.querySelectorAll("[data-movcues-survey-action]")).toHaveLength(0);
  });

  it("shows only authored Submit controls for a single step", () => {
    const survey: SurveyConfig = { showProgress: false, allowBack: true, submitLabel: "Send", steps: [{ id: "only", content: { heading: "Only", body: "" }, questions: [], builder: { version: 1, projectData: {}, html: '<section class="movcues-widget"><button data-movcues-survey-action="back">Back label</button><button data-movcues-survey-action="next">Next label</button><button data-movcues-survey-action="submit">Finish label</button></section>', css: ".movcues-widget{padding:20px}" } }] };
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); root.appendChild(document.createElement("style")); document.body.appendChild(host);
    new SurveyRenderer().render(root, { heading: "Survey", body: "" }, { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, { dismissible: true, backdrop: true }, survey, { onDismiss: vi.fn(), onProgress: vi.fn(), onSubmit: vi.fn() });
    expect(root.querySelector<HTMLButtonElement>('[data-movcues-survey-action="back"]')?.hidden).toBe(true); expect(root.querySelector<HTMLButtonElement>('[data-movcues-survey-action="next"]')?.hidden).toBe(true); expect(root.querySelector<HTMLButtonElement>('[data-movcues-survey-action="submit"]')?.hidden).toBe(false);
  });

  it("lets authored selected-state CSS override the SDK functional default", () => {
    const authored = builder('<div data-movcues-question-id="choice" data-movcues-question-type="single_choice"><button class="movcues-survey-option" data-movcues-option-id="a">A</button></div>');
    authored.css += ".movcues-widget .movcues-survey-option.is-selected{background:rgb(1,2,3);border-color:rgb(4,5,6)}";
    const experience: DeliveredExperience = { id: "survey_style", versionId: "version_1", kind: "widget", widgetType: "survey", priority: 1, definition: { content: { heading: "Survey", body: "" }, design: { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, behavior: { dismissible: true, backdrop: true }, survey: { showProgress: false, allowBack: false, submitLabel: "Send", steps: [{ id: "only", content: { heading: "Choose", body: "" }, questions: [{ id: "choice", type: "single_choice", label: "Choice", options: [{ id: "a", label: "A" }] }], builder: authored }] } } };
    const renderer = new ExperienceRenderer(); renderer.render(experience, { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() });
    const root = document.querySelector('[data-movcues-experience="survey_style"]')!.shadowRoot!; const option = root.querySelector<HTMLButtonElement>('[data-movcues-option-id="a"]')!; option.click();
    expect(option.getAttribute("aria-pressed")).toBe("true"); expect(getComputedStyle(option).backgroundColor).toBe("rgb(1, 2, 3)"); expect(getComputedStyle(option).borderColor).toBe("rgb(4, 5, 6)");
    const baseCss = root.firstElementChild?.textContent ?? ""; expect(baseCss).toContain(":where(.movcues-survey-option.is-selected)"); expect(baseCss).not.toMatch(/movcues-survey-option\.is-selected[^}]*!important/); renderer.destroy();
  });
});
