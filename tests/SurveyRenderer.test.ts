import { beforeEach, describe, expect, it, vi } from "vitest";
import { SurveyRenderer } from "../src/experiences/runtime/SurveyRenderer";
import type { SurveyConfig, WidgetBuilderState } from "../src/experiences/types";

function builder(html: string): WidgetBuilderState { return { version: 1, projectData: {}, html: `<section class="movecues-widget">${html}<div class="movecues-survey-validation"></div><footer><button data-movecues-survey-action="back">Back</button><button data-movecues-survey-action="next">Next</button><button data-movecues-survey-action="submit">Submit</button></footer></section>`, css: ".movecues-widget{padding:20px}.movecues-widget .is-selected{color:blue}" }; }

describe("SurveyRenderer", () => {
  beforeEach(() => { document.documentElement.innerHTML = "<head></head><body></body>"; });
  it("validates required answers and preserves them across Next and Back before submit", async () => {
    const survey: SurveyConfig = { showProgress: true, allowBack: true, submitLabel: "Send feedback", steps: [
      { id: "intro", content: { heading: "Choose", body: "" }, questions: [{ id: "choice", type: "single_choice", label: "Pick one", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }], builder: builder('<div data-movecues-question-id="choice" data-movecues-question-type="single_choice"><button data-movecues-option-id="a">A</button><button data-movecues-option-id="b">B</button></div>') },
      { id: "followup", content: { heading: "Why?", body: "" }, questions: [{ id: "detail", type: "short_text", label: "Details" }], builder: builder('<div data-movecues-question-id="detail" data-movecues-question-type="short_text"><input type="text" data-movecues-question-input></div>') },
    ] };
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); root.appendChild(document.createElement("style")); document.body.appendChild(host);
    const progress = vi.fn(); const submit = vi.fn(); const renderer = new SurveyRenderer(); renderer.render(root, { heading: "Survey", body: "Feedback" }, { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, { dismissible: true, backdrop: true }, survey, { onDismiss: vi.fn(), onProgress: progress, onSubmit: submit });
    root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="next"]')!.click(); expect(root.textContent).toContain("required questions"); expect(progress).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('[data-movecues-option-id="b"]')!.click(); root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="next"]')!.click(); await vi.waitFor(() => expect(root.querySelector("[data-movecues-question-input]")).not.toBeNull());
    const input = root.querySelector<HTMLInputElement>("[data-movecues-question-input]")!; const progressCallsBeforeTyping = progress.mock.calls.length; input.value = "Because"; input.dispatchEvent(new Event("input", { bubbles: true })); expect(progress).toHaveBeenCalledTimes(progressCallsBeforeTyping); root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="back"]')!.click();
    expect(root.querySelector('[data-movecues-option-id="b"]')?.classList.contains("is-selected")).toBe(true); root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="next"]')!.click(); await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>("[data-movecues-question-input]")?.value).toBe("Because"));
    root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="submit"]')!.click(); await vi.waitFor(() => expect(submit).toHaveBeenCalledWith({ choice: "b", detail: "Because" }, "followup")); renderer.destroy();
  });

  it("does not recreate builder-owned controls that the designer removed", () => {
    const builderWithoutBackOrSubmit = { version: 1 as const, projectData: {}, html: '<section class="movecues-widget"><div data-movecues-survey-controls="builder"><button data-movecues-survey-action="next">Next</button></div></section>', css: ".movecues-widget{padding:20px}" };
    const survey: SurveyConfig = { showProgress: false, allowBack: true, submitLabel: "Send", steps: [
      { id: "first", content: { heading: "First", body: "" }, questions: [], builder: builderWithoutBackOrSubmit },
      { id: "final", content: { heading: "Final", body: "" }, questions: [], builder: builderWithoutBackOrSubmit },
    ] };
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); root.appendChild(document.createElement("style")); document.body.appendChild(host);
    new SurveyRenderer().render(root, { heading: "Survey", body: "" }, { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, { dismissible: true, backdrop: true }, survey, { onDismiss: vi.fn(), onProgress: vi.fn(), onSubmit: vi.fn() }, "final");
    expect(root.querySelector('[data-movecues-survey-action="back"]')).toBeNull(); expect(root.querySelector('[data-movecues-survey-action="submit"]')).toBeNull(); expect(root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="next"]')?.hidden).toBe(true);
  });

  it("uses every authored survey action, without inferring it from labels, classes, or order", () => {
    const authored = (actions: string) => ({ version: 1 as const, projectData: {}, html: `<section class="movecues-widget"><div class="movecues-survey-validation"></div>${actions}</section>`, css: ".movecues-widget{padding:20px}" });
    const buttons = '<button class="movecues-widget__button" data-movecues-survey-action="submit">Continue</button><button class="movecues-widget__button movecues-widget__button--secondary" data-movecues-survey-action="back">Anything</button><button data-movecues-survey-action="next">Forward A</button><button class="movecues-widget__button--secondary" data-movecues-survey-action="next">Forward B</button>';
    const survey: SurveyConfig = { showProgress: false, allowBack: true, submitLabel: "Ignored for authored labels", steps: [
      { id: "first", content: { heading: "First", body: "" }, questions: [], builder: authored(buttons) },
      { id: "middle", content: { heading: "Middle", body: "" }, questions: [], builder: authored(buttons) },
      { id: "final", content: { heading: "Final", body: "" }, questions: [], builder: authored(buttons) },
    ] };
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); root.appendChild(document.createElement("style")); document.body.appendChild(host);
    const render = (step: string) => new SurveyRenderer().render(root, { heading: "Survey", body: "" }, { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, { dismissible: true, backdrop: true }, survey, { onDismiss: vi.fn(), onProgress: vi.fn(), onSubmit: vi.fn() }, step);
    const hidden = (action: string) => Array.from(root.querySelectorAll<HTMLButtonElement>(`[data-movecues-survey-action="${action}"]`)).map(button => button.hidden);
    render("first"); expect(hidden("back")).toEqual([true]); expect(hidden("next")).toEqual([false, false]); expect(hidden("submit")).toEqual([true]);
    render("middle"); expect(hidden("back")).toEqual([false]); expect(hidden("next")).toEqual([false, false]); expect(hidden("submit")).toEqual([true]);
    render("final"); expect(hidden("back")).toEqual([false]); expect(hidden("next")).toEqual([true, true]); const finalSubmit = root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="submit"]')!; expect(finalSubmit.hidden).toBe(false); expect(finalSubmit.textContent).toBe("Continue");
  });

  it("does not add controls when a new survey author omitted them", () => {
    const survey: SurveyConfig = { showProgress: false, allowBack: true, submitLabel: "Send", steps: [{ id: "only", content: { heading: "Only", body: "" }, questions: [], builder: { version: 1, projectData: {}, html: '<section class="movecues-widget"><div class="movecues-survey-validation"></div></section>', css: ".movecues-widget{padding:20px}" } }] };
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); root.appendChild(document.createElement("style")); document.body.appendChild(host);
    new SurveyRenderer().render(root, { heading: "Survey", body: "" }, { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, { dismissible: true, backdrop: true }, survey, { onDismiss: vi.fn(), onProgress: vi.fn(), onSubmit: vi.fn() });
    expect(root.querySelectorAll("[data-movecues-survey-action]")).toHaveLength(0);
  });

  it("shows only authored Submit controls for a single step", () => {
    const survey: SurveyConfig = { showProgress: false, allowBack: true, submitLabel: "Send", steps: [{ id: "only", content: { heading: "Only", body: "" }, questions: [], builder: { version: 1, projectData: {}, html: '<section class="movecues-widget"><button data-movecues-survey-action="back">Back label</button><button data-movecues-survey-action="next">Next label</button><button data-movecues-survey-action="submit">Finish label</button></section>', css: ".movecues-widget{padding:20px}" } }] };
    const host = document.createElement("div"); const root = host.attachShadow({ mode: "open" }); root.appendChild(document.createElement("style")); document.body.appendChild(host);
    new SurveyRenderer().render(root, { heading: "Survey", body: "" }, { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, { dismissible: true, backdrop: true }, survey, { onDismiss: vi.fn(), onProgress: vi.fn(), onSubmit: vi.fn() });
    expect(root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="back"]')?.hidden).toBe(true); expect(root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="next"]')?.hidden).toBe(true); expect(root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="submit"]')?.hidden).toBe(false);
  });
});
