import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceLoader } from "../src/experiences/runtime/ExperienceLoader";
import type { DeliveredExperience } from "../src/experiences/types";

const session = { getAnonymousId: () => "anon_1", getSessionId: () => "session_1", getPageViewId: () => "page_1", getIdentifiedUserId: () => null };
const guide: DeliveredExperience = { id: "guide_analytics", versionId: "version_1", kind: "guide", widgetType: null, priority: 1, definition: { design: { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } }, steps: [
  { id: "one", pattern: "modal", content: { heading: "One", body: "First", primaryAction: { label: "Next", type: "next_step" } }, advance: { type: "button" }, behavior: { dismissible: true } },
  { id: "two", pattern: "modal", content: { heading: "Two", body: "Last", primaryAction: { label: "Finish", type: "next_step" } }, advance: { type: "button" }, behavior: { dismissible: true } },
] } };

describe("experience analytics runtime", () => {
  beforeEach(() => { document.documentElement.innerHTML = "<head></head><body></body>"; history.replaceState({}, "", "/"); });

  it("records visible Guide steps once, calculates duration only on advance, and never blocks progression", async () => {
    let clock = 100; vi.spyOn(performance, "now").mockImplementation(() => clock); const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (url.includes("/experiences?")) return { ok: true, status: 200, json: async () => ({ experiences: [guide] }) }; const body = JSON.parse(String(init?.body)); bodies.push(body); if (body.eventType === "experience_shown") return { ok: true, status: 201, json: async () => ({ impressionId: "imp_1" }) }; if (body.eventType === "guide_step_completed") throw new Error("analytics unavailable"); return { ok: true, status: 204, json: async () => ({}) }; }));
    const loader = new ExperienceLoader("https://api.example.com", "site_1", session); await loader.evaluate(); await vi.waitFor(() => expect(bodies.some(body => body.eventType === "guide_step_shown")).toBe(true));
    clock = 650; document.querySelector("[data-movecues-experience]")!.shadowRoot!.querySelector<HTMLButtonElement>(".primary")!.click(); expect(document.querySelector("[data-movecues-experience]")!.shadowRoot!.textContent).toContain("Two");
    await vi.waitFor(() => expect(bodies.filter(body => body.eventType === "guide_step_shown")).toHaveLength(2)); const completion = bodies.find(body => body.eventType === "guide_step_completed" && body.stepId === "one"); expect(completion).toMatchObject({ stepIndex: 0, durationMs: 550 });
    clock = 900; document.querySelector("[data-movecues-experience]")!.shadowRoot!.querySelector<HTMLButtonElement>(".primary")!.click(); await vi.waitFor(() => expect(bodies.some(body => body.eventType === "guide_completed")).toBe(true)); expect(document.querySelector("[data-movecues-experience]")).toBeNull(); loader.destroy();
  });
});
