import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChecklistRenderer } from "../src/experiences/runtime/ChecklistRenderer";
import type { DeliveredChecklist } from "../src/experiences/types";

const checklist = (): DeliveredChecklist => ({
  id: "checklist_1", versionId: "version_1", kind: "checklist", priority: 10,
  definition: {
    title: "Getting started", description: "Finish these tasks", items: [
      { id: "first", title: "First task", description: "Do the thing", action: { type: "none" }, completion: { type: "item_clicked" } },
      { id: "second", title: "Second task", action: { type: "none" }, completion: { type: "item_clicked" } },
    ],
    behavior: { position: "bottom-right", order: "sequential", dismissible: true, initialState: "expanded", showRemainingCount: true }, completionMessage: { title: "Done", description: "All complete", acknowledgeLabel: "Close" },
    builder: { version: 1, projectData: {}, html: '<section class="movecues-widget" data-movecues-checklist-role="root"><div data-movecues-checklist-view="expanded"><h2 data-movecues-checklist-role="title"></h2><p data-movecues-checklist-role="description"></p><button data-movecues-checklist-role="collapse">-</button><div data-movecues-checklist-role="progress"></div><div data-movecues-checklist-role="items"><button data-movecues-checklist-item-id="first"><span data-movecues-checklist-item-role="state"></span><span data-movecues-checklist-item-role="title"></span><span data-movecues-checklist-item-role="description"></span></button><button data-movecues-checklist-item-id="second"><span data-movecues-checklist-item-role="state"></span><span data-movecues-checklist-item-role="title"></span><span data-movecues-checklist-item-role="description"></span></button></div></div><button data-movecues-checklist-view="launcher"><span data-movecues-checklist-role="launcher-label"></span><span data-movecues-checklist-role="remaining-count"></span></button><div data-movecues-checklist-view="completion"><h2 data-movecues-checklist-role="completion-title"></h2><p data-movecues-checklist-role="completion-description"></p><button data-movecues-checklist-role="completion-acknowledge"></button></div></section>', css: ".movecues-widget{background:#fff}" },
  },
  progress: { stateId: "state_1", collapsed: false, dismissed: false, complete: false, completionAcknowledged: false, completedItemIds: [], items: [{ id: "first", state: "available" }, { id: "second", state: "locked" }] },
});

describe("ChecklistRenderer", () => {
  beforeEach(() => { document.body.innerHTML = ""; }); afterEach(() => vi.restoreAllMocks());
  it("binds structured copy and state, rejects locked clicks, and preserves authored CSS", () => {
    const callbacks = { onOpen: vi.fn(), onCollapse: vi.fn(), onDismiss: vi.fn(), onAcknowledge: vi.fn(), onItemClick: vi.fn() }; const renderer = new ChecklistRenderer(); expect(renderer.render(checklist(), callbacks)).toBe(true);
    const root = document.querySelector<HTMLElement>("[data-movecues-checklist]")!.shadowRoot!; expect(root.textContent).toContain("Getting started"); expect(root.querySelector('style')?.textContent).toContain("background:#fff"); expect(root.querySelector<HTMLElement>('[data-movecues-checklist-item-id="second"]')?.dataset.state).toBe("locked");
    root.querySelector<HTMLButtonElement>('[data-movecues-checklist-item-id="second"]')!.click(); expect(callbacks.onItemClick).not.toHaveBeenCalled(); root.querySelector<HTMLButtonElement>('[data-movecues-checklist-item-id="first"]')!.click(); expect(callbacks.onItemClick).toHaveBeenCalledWith("first"); renderer.destroy(); expect(document.querySelector("[data-movecues-checklist]")).toBeNull();
  });

  it("shows authored completion copy only in the completion state", () => { const value = checklist(); value.progress.complete = true; value.progress.completedItemIds = ["first", "second"]; value.progress.items = value.progress.items.map(item => ({ ...item, state: "completed" })); const renderer = new ChecklistRenderer(); renderer.render(value, { onOpen: vi.fn(), onCollapse: vi.fn(), onDismiss: vi.fn(), onAcknowledge: vi.fn(), onItemClick: vi.fn() }); const root = document.querySelector<HTMLElement>("[data-movecues-checklist]")!.shadowRoot!; expect(root.querySelector('[data-movecues-checklist-view="completion"]')?.classList.contains("is-active")).toBe(true); expect(root.textContent).toContain("All complete"); renderer.destroy(); });
});
