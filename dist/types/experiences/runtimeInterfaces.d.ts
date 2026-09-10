export interface ExperienceSession {
    getAnonymousId(): string;
    getSessionId(): string;
    getPageViewId(): string;
    getIdentifiedUserId(): string | null;
}
export interface ExperienceLoaderRuntime {
    evaluate(trigger?: string): Promise<void>;
    onRouteChange(): void;
    onCustomEvent(name: string): void;
    destroy(): void;
}
export interface EditorSession {
    sessionId: string;
    accessToken: string;
    expiresAt: string;
}
export interface EditorControllerRuntime {
    start(rawToken: string): Promise<boolean>;
    resume(session: EditorSession): Promise<boolean>;
    destroy(): void;
}
export interface ExperienceRuntime {
    createLoader(apiBase: string, siteId: string, session: ExperienceSession, trackEvent?: (name: string) => void): ExperienceLoaderRuntime;
}
export interface EditorRuntime {
    createController(apiBase: string): EditorControllerRuntime;
}
export interface AnalyticsRuntimeProviders {
    experiences?: ExperienceRuntime;
    editor?: EditorRuntime;
}
declare global {
    interface Window {
        __movcuesExperienceRuntime__?: ExperienceRuntime;
        __movcuesEditorRuntime__?: EditorRuntime;
    }
}
