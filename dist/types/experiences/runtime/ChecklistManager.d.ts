import type { DeliveredChecklist } from "../types";
import type { ExperienceSession } from "../runtimeInterfaces";
export declare class ChecklistManager {
    private apiBase;
    private siteId;
    private session;
    private launchGuide;
    private renderer;
    private current;
    private impressionId;
    private shown;
    private forceLauncher;
    private destroyed;
    private refreshPromise;
    private trailingRefresh;
    constructor(apiBase: string, siteId: string, session: ExperienceSession, launchGuide: (id: string, context: {
        source: "checklist";
        checklistExperienceId: string;
        itemId: string;
    }) => Promise<void>);
    setChecklist(checklist: DeliveredChecklist | null): void;
    setTransientActive(active: boolean): void;
    hasChecklist(): boolean;
    refresh(): Promise<void>;
    destroy(): void;
    private render;
    private transition;
    private clickItem;
    private action;
    private path;
    private request;
}
