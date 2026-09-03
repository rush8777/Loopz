import type { SessionManager } from "../../core/SessionManager";
export declare class ExperienceLoader {
    private apiBase;
    private siteId;
    private session;
    private trackEvent?;
    private renderer;
    private eligibility;
    private state;
    private activeId;
    private impressionId;
    private destroyed;
    constructor(apiBase: string, siteId: string, session: SessionManager, trackEvent?: ((name: string) => void) | undefined);
    evaluate(trigger?: string): Promise<void>;
    onRouteChange(): void;
    onCustomEvent(name: string): void;
    destroy(): void;
    private shown;
    private handleAction;
    private record;
    private post;
}
