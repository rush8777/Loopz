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
    const input = root.querySelector<HTMLInputElement>("[data-movecues-question-input]")!; input.value = "Because"; input.dispatchEvent(new Event("input", { bubbles: true })); root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="back"]')!.click();
    expect(root.querySelector('[data-movecues-option-id="b"]')?.classList.contains("is-selected")).toBe(true); root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="next"]')!.click(); await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>("[data-movecues-question-input]")?.value).toBe("Because"));
    root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="submit"]')!.click(); await vi.waitFor(() => expect(submit).toHaveBeenCalledWith({ choice: "b", detail: "Because" }, "followup")); renderer.destroy();
  });
});
