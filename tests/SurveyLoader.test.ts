import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceLoader } from "../src/experiences/runtime/ExperienceLoader";
import type { DeliveredExperience, WidgetBuilderState } from "../src/experiences/types";

function builder(question: string, action: "next" | "submit"): WidgetBuilderState { return { version: 1, projectData: {}, html: `<section class="movecues-widget">${question}<div class="movecues-survey-validation"></div><button data-movecues-survey-action="back">Back</button><button data-movecues-survey-action="${action}">${action}</button></section>`, css: ".movecues-widget{padding:12px}.movecues-widget .is-selected{color:blue}" }; }

describe("survey response lifecycle", () => {
  beforeEach(() => { document.documentElement.innerHTML = "<head></head><body></body>"; history.replaceState({}, "", "/task"); });
  it("creates a response after shown, saves progress, submits, and completes the normal impression", async () => {
    const experience: DeliveredExperience = { id: "survey_1", versionId: "version_1", kind: "widget", widgetType: "survey", priority: 5, definition: { content: { heading: "Survey", body: "Feedback" }, design: { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, behavior: { dismissible: true, backdrop: true }, survey: { showProgress: true, allowBack: true, submitLabel: "Send", steps: [
      { id: "one", content: { heading: "Rate", body: "" }, questions: [{ id: "rating", type: "rating", label: "Rate", required: true, min: 1, max: 5 }], builder: builder('<div data-movecues-question-id="rating" data-movecues-question-type="rating"><button data-movecues-option-id="1">1</button><button data-movecues-option-id="5">5</button></div>', "next") },
      { id: "two", content: { heading: "Details", body: "" }, questions: [], builder: builder("", "submit") },
    ] } } };
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined; calls.push({ url, body }); if (url.includes("/experiences?")) return { ok: true, status: 200, json: async () => ({ experiences: [experience] }) }; if (url.includes("/experience-events") && body?.event === "shown") return { ok: true, status: 201, json: async () => ({ impressionId: "impression_1" }) }; if (url.endsWith("/survey-responses")) return { ok: true, status: 201, json: async () => ({ responseId: "response_1" }) }; return { ok: true, status: 204, json: async () => ({}) }; }));
    const loader = new ExperienceLoader("https://api.example.com", "site_1", { getAnonymousId: () => "anon_1", getSessionId: () => "session_1", getPageViewId: () => "page_1", getIdentifiedUserId: () => null }); await loader.evaluate();
    const root = document.querySelector("[data-movecues-experience]")!.shadowRoot!; root.querySelector<HTMLButtonElement>('[data-movecues-option-id="5"]')!.click(); root.querySelector<HTMLButtonElement>('[data-movecues-survey-action="next"]')!.click(); await vi.waitFor(() => expect(document.querySelector("[data-movecues-experience]")!.shadowRoot!.querySelector('[data-movecues-survey-action="submit"]')).not.toBeNull());
    document.querySelector("[data-movecues-experience]")!.shadowRoot!.querySelector<HTMLButtonElement>('[data-movecues-survey-action="submit"]')!.click(); await vi.waitFor(() => expect(calls.some(call => call.body?.event === "completed")).toBe(true));
    expect(calls.find(call => call.url.endsWith("/survey-responses"))?.body).toMatchObject({ impressionId: "impression_1", anonymousId: "anon_1", sessionId: "session_1" });
    const patches = calls.filter(call => call.url.includes("/survey-responses/")); expect(patches[0].body).toMatchObject({ currentStepId: "one", answers: { rating: 5 } }); expect(patches.at(-1)?.body).toMatchObject({ currentStepId: "two", answers: { rating: 5 }, submitted: true });
    expect(calls.findIndex(call => call.body?.event === "shown")).toBeLessThan(calls.findIndex(call => call.url.endsWith("/survey-responses"))); expect(calls.findLastIndex(call => call.url.includes("/survey-responses/"))).toBeLessThan(calls.findIndex(call => call.body?.event === "completed")); loader.destroy();
  });
});
