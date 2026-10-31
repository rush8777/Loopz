import fixture from './fixtures/checklist-v4.json';
import {applyOnsiteDocument,listBlocks,type OnsiteDocument} from '../src/experiences/onsite/OnsiteDocument';
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChecklistRenderer } from "../src/experiences/runtime/ChecklistRenderer";
import { ALWAYS_ON_TOP_Z_INDEX } from "../src/experiences/runtime/layering/LayerManager";
import type { DeliveredChecklist } from "../src/experiences/types";

const checklist = (): DeliveredChecklist => ({
  id: "checklist_1", versionId: "version_1", kind: "checklist", priority: 10,
  definition: {
    title: "Getting started", description: "Finish these tasks", items: [
      { id: "first", title: "First task", description: "Do the thing", action: { type: "none" }, completion: { type: "item_clicked" } },
      { id: "second", title: "Second task", action: { type: "none" }, completion: { type: "item_clicked" } },
    ],
    behavior: { position: "bottom-right", order: "sequential", dismissible: true, initialState: "expanded", showRemainingCount: true }, completionMessage: { title: "Done", description: "All complete", acknowledgeLabel: "Close" },
    builder: { version: 1, projectData: {}, html: '<section class="movcues-widget" data-movcues-checklist-role="root"><div data-movcues-checklist-view="expanded"><h2 data-movcues-checklist-role="title"></h2><p data-movcues-checklist-role="description"></p><button data-movcues-checklist-role="collapse">-</button><div data-movcues-checklist-role="progress"></div><div data-movcues-checklist-role="items"><button data-movcues-checklist-item-id="first"><span data-movcues-checklist-item-role="state"></span><span data-movcues-checklist-item-role="title"></span><span data-movcues-checklist-item-role="description"></span></button><button data-movcues-checklist-item-id="second"><span data-movcues-checklist-item-role="state"></span><span data-movcues-checklist-item-role="title"></span><span data-movcues-checklist-item-role="description"></span></button></div></div><button data-movcues-checklist-view="launcher"><span data-movcues-checklist-role="launcher-label"></span><span data-movcues-checklist-role="remaining-count"></span></button><div data-movcues-checklist-view="completion"><h2 data-movcues-checklist-role="completion-title"></h2><p data-movcues-checklist-role="completion-description"></p><button data-movcues-checklist-role="completion-acknowledge"></button></div></section>', css: ".movcues-widget{background:#fff}" },
  },
  progress: { stateId: "state_1", collapsed: false, dismissed: false, complete: false, completionAcknowledged: false, completedItemIds: [], items: [{ id: "first", state: "available" }, { id: "second", state: "locked" }] },
});

describe("ChecklistRenderer", () => {
  beforeEach(() => { document.body.innerHTML = ""; }); afterEach(() => vi.restoreAllMocks());
  it("binds structured copy and state, rejects locked clicks, and preserves authored CSS", () => {
    const callbacks = { onOpen: vi.fn(), onCollapse: vi.fn(), onDismiss: vi.fn(), onAcknowledge: vi.fn(), onItemClick: vi.fn() }; const renderer = new ChecklistRenderer(); expect(renderer.render(checklist(), callbacks)).toBe(true);
    const root = document.querySelector<HTMLElement>("[data-movcues-checklist]")!.shadowRoot!; expect(root.textContent).toContain("Getting started"); expect(root.querySelector('style')?.textContent).toContain("background:#fff"); expect(root.querySelector<HTMLElement>('[data-movcues-checklist-item-id="second"]')?.dataset.state).toBe("locked");
    root.querySelector<HTMLButtonElement>('[data-movcues-checklist-item-id="second"]')!.click(); expect(callbacks.onItemClick).not.toHaveBeenCalled(); root.querySelector<HTMLButtonElement>('[data-movcues-checklist-item-id="first"]')!.click(); expect(callbacks.onItemClick).toHaveBeenCalledWith("first"); renderer.destroy(); expect(document.querySelector("[data-movcues-checklist]")).toBeNull();
  });

  it("stays exactly one layer below always-on-top experiences", () => {
    const renderer = new ChecklistRenderer();
    expect(renderer.render(checklist(), { onOpen: vi.fn(), onCollapse: vi.fn(), onDismiss: vi.fn(), onAcknowledge: vi.fn(), onItemClick: vi.fn() })).toBe(true);
    expect(document.querySelector<HTMLElement>("[data-movcues-checklist]")!.style.zIndex).toBe(String(ALWAYS_ON_TOP_Z_INDEX - 1));
    renderer.destroy();
  });

  it("shows authored completion copy only in the completion state", () => { const value = checklist(); value.progress.complete = true; value.progress.completedItemIds = ["first", "second"]; value.progress.items = value.progress.items.map(item => ({ ...item, state: "completed" })); const renderer = new ChecklistRenderer(); renderer.render(value, { onOpen: vi.fn(), onCollapse: vi.fn(), onDismiss: vi.fn(), onAcknowledge: vi.fn(), onItemClick: vi.fn() }); const root = document.querySelector<HTMLElement>("[data-movcues-checklist]")!.shadowRoot!; expect(root.querySelector('[data-movcues-checklist-view="completion"]')?.classList.contains("is-active")).toBe(true); expect(root.textContent).toContain("All complete"); renderer.destroy(); });
  it('preserves nested version 4 task cells, authored launcher copy and runtime progress',()=>{
    const f=structuredClone(fixture),value=checklist();value.definition={...f.definition,builder:{version:1,projectData:{},html:'',css:''}} as DeliveredChecklist['definition'];const doc=f.document as OnsiteDocument;const label=listBlocks(doc.root).find(block=>block.type==='checklist_text'&&block.role==='launcher-label')!;if(label.type==='checklist_text')label.text='Continue setup';applyOnsiteDocument(value.definition.builder,doc,'checklist',undefined,value.definition);value.progress.completedItemIds=['item_one'];value.progress.items=value.definition.items.map((item,index)=>({id:item.id,state:index===0?'completed':index===1?'available':'locked'}));
    const renderer=new ChecklistRenderer();expect(renderer.render(value,{onOpen:vi.fn(),onCollapse:vi.fn(),onDismiss:vi.fn(),onAcknowledge:vi.fn(),onItemClick:vi.fn()},true)).toBe(true);const root=document.querySelector<HTMLElement>('[data-movcues-checklist]')!.shadowRoot!;expect(root.querySelector('[data-movcues-checklist-item-id="item_one"]')!.parentElement!.classList.contains('movcues-cell')).toBe(true);expect(root.querySelector('[data-movcues-checklist-role="launcher-label"]')!.textContent).toBe('Continue setup');expect(root.querySelector('[data-movcues-checklist-role="progress"]')!.textContent).toBe('1 of 3 complete');expect(root.querySelector('[data-movcues-checklist-view="launcher"]')!.classList.contains('is-active')).toBe(true);renderer.destroy();
  });

});
