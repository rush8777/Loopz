import type { DeliveredChecklist } from "../types";
import { sanitizeBuilderHtml, safeBuilderCss } from "./BuilderContent";
import { ALWAYS_ON_TOP_Z_INDEX } from "./layering/LayerManager";

export interface ChecklistRendererCallbacks {
  onOpen(): void;
  onCollapse(): void;
  onDismiss(): void;
  onAcknowledge(): void;
  onItemClick(itemId: string): void;
}

export class ChecklistRenderer {
  private host: HTMLElement | null = null;

  render(checklist: DeliveredChecklist, callbacks: ChecklistRendererCallbacks, forceLauncher = false): boolean {
    this.destroy();
    const nodes = sanitizeBuilderHtml(checklist.definition.builder.html); const css = safeBuilderCss(checklist.definition.builder.css);
    if (!nodes || css === null) return false;
    this.host = document.createElement("div"); this.host.dataset.movecuesChecklist = checklist.id;
    const side = checklist.definition.behavior.position === "bottom-left" ? "left:16px" : "right:16px";
    this.host.style.cssText = `position:fixed;bottom:16px;${side};z-index:${ALWAYS_ON_TOP_Z_INDEX};pointer-events:auto`;
    const root = this.host.attachShadow({ mode: "open" }); const style = document.createElement("style");
    style.textContent = `:host{all:initial}.surface{position:relative;pointer-events:auto}.surface>.movecues-widget{position:relative!important;inset:auto!important}${css}`; root.appendChild(style);
    const surface = document.createElement("div"); surface.className = "surface"; surface.append(...nodes); root.appendChild(surface);
    const authoredRoot = surface.querySelector<HTMLElement>('[data-movecues-checklist-role="root"]');
    if (!authoredRoot || surface.querySelectorAll('[data-movecues-checklist-role="root"]').length !== 1) { this.destroy(); return false; }
    const requiredRoles = ["title", "description", "progress", "items", "launcher-label", "remaining-count", "completion-title", "completion-description", "completion-acknowledge"];
    const requiredViews = ["expanded", "launcher", "completion"];
    if (requiredRoles.some(role => authoredRoot.querySelectorAll(`[data-movecues-checklist-role="${role}"]`).length !== 1) || requiredViews.some(view => authoredRoot.querySelectorAll(`[data-movecues-checklist-view="${view}"]`).length !== 1)) { this.destroy(); return false; }
    const itemElements = new Map<string, HTMLElement>();
    for (const element of Array.from(authoredRoot.querySelectorAll<HTMLElement>("[data-movecues-checklist-item-id]"))) { const id = element.dataset.movecuesChecklistItemId; if (!id || itemElements.has(id) || element.querySelectorAll('[data-movecues-checklist-item-role="state"]').length !== 1 || element.querySelectorAll('[data-movecues-checklist-item-role="title"]').length !== 1 || element.querySelectorAll('[data-movecues-checklist-item-role="description"]').length !== 1) { this.destroy(); return false; } itemElements.set(id, element); }
    if (checklist.definition.items.some(item => !itemElements.has(item.id)) || itemElements.size !== checklist.definition.items.length) { this.destroy(); return false; }
    setText(authoredRoot, "title", checklist.definition.title); setText(authoredRoot, "description", checklist.definition.description ?? "");
    setText(authoredRoot, "launcher-label", checklist.definition.title); setText(authoredRoot, "completion-title", checklist.definition.completionMessage.title); setText(authoredRoot, "completion-description", checklist.definition.completionMessage.description ?? ""); setText(authoredRoot, "completion-acknowledge", checklist.definition.completionMessage.acknowledgeLabel);
    authoredRoot.querySelectorAll<HTMLElement>('[data-movecues-checklist-role="dismiss"]').forEach(element => { element.hidden = !checklist.definition.behavior.dismissible; });
    const completed = new Set(checklist.progress.completedItemIds); const remaining = checklist.definition.items.length - completed.size;
    setText(authoredRoot, "progress", `${completed.size} of ${checklist.definition.items.length} complete`); setText(authoredRoot, "remaining-count", checklist.definition.behavior.showRemainingCount ? String(remaining) : "");
    const container = authoredRoot.querySelector<HTMLElement>('[data-movecues-checklist-role="items"]'); if (!container) { this.destroy(); return false; }
    checklist.definition.items.forEach((item, index) => { const element = itemElements.get(item.id)!; container.appendChild(element); const state = checklist.progress.items[index]?.state ?? "locked"; element.dataset.state = state; element.setAttribute("aria-disabled", state === "locked" ? "true" : "false"); setText(element, "title", item.title, true); setText(element, "description", item.description ?? "", true); });
    const view = checklist.progress.complete ? "completion" : forceLauncher || checklist.progress.collapsed ? "launcher" : "expanded";
    authoredRoot.querySelectorAll<HTMLElement>("[data-movecues-checklist-view]").forEach(element => element.classList.toggle("is-active", element.dataset.movecuesChecklistView === view));
    authoredRoot.addEventListener("click", event => { const target = event.target instanceof Element ? event.target : null; if (!target) return; const item = target.closest<HTMLElement>("[data-movecues-checklist-item-id]"); if (item && item.dataset.state !== "locked") { callbacks.onItemClick(item.dataset.movecuesChecklistItemId!); return; } const role = target.closest<HTMLElement>("[data-movecues-checklist-role]")?.dataset.movecuesChecklistRole; if (role === "launcher-label" || target.closest('[data-movecues-checklist-view="launcher"]')) callbacks.onOpen(); else if (role === "collapse") callbacks.onCollapse(); else if (role === "completion-acknowledge") callbacks.onAcknowledge(); else if (role === "dismiss") callbacks.onDismiss(); });
    document.documentElement.appendChild(this.host); return true;
  }

  destroy(): void { this.host?.remove(); this.host = null; }
}

function setText(root: ParentNode, role: string, value: string, itemRole = false) { const attribute = itemRole ? "data-movecues-checklist-item-role" : "data-movecues-checklist-role"; const element = root.querySelector<HTMLElement>(`[${attribute}="${role}"]`); if (element) element.textContent = value; }
