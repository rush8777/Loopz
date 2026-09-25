import type { DeliveredChecklist } from "../types";
export interface ChecklistRendererCallbacks {
    onOpen(): void;
    onCollapse(): void;
    onDismiss(): void;
    onAcknowledge(): void;
    onItemClick(itemId: string): void;
}
export declare class ChecklistRenderer {
    private host;
    render(checklist: DeliveredChecklist, callbacks: ChecklistRendererCallbacks, forceLauncher?: boolean): boolean;
    destroy(): void;
}
