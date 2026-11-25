import type { GeoAgentBundle, GeoAgentOptions } from "./geoAgent/types";
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
    resetContext?(preserveAnonymousProgress?: boolean): void;
    refreshChecklist?(): Promise<void>;
    hasActiveChecklist?(): boolean;
    launchExperience?(experienceId: string): Promise<void>;
    destroy(): void;
}
export interface EditorSession {
    sessionId: string;
    accessToken: string;
    expiresAt: string;
}
export interface EditorAuthoringState {
    experienceId: string;
    selectedStepId?: string;
    guidePreview?: {
        versionId: string;
        entryPath: string;
        completed: boolean;
        clickPending?: boolean;
    };
    mode: "design" | "target" | "navigate" | "preview" | "select";
}
export interface EditorContinuation {
    session: EditorSession;
    editorState?: EditorAuthoringState;
}
export interface EditorControllerRuntime {
    start(rawToken: string): Promise<boolean>;
    /** New bundled editor supports the already-authenticated fast-start path. */
    startAuthenticatedSession?(session: EditorSession, draft?: import("./types").EditorDraft): Promise<boolean>;
    resume(continuation: EditorContinuation): Promise<boolean>;
    resumeWithDraft?(continuation: EditorContinuation, draft: import("./types").EditorDraft): Promise<boolean>;
    destroy(): void;
}
export interface ExperienceRuntime {
    createLoader(apiBase: string, siteId: string, session: ExperienceSession, trackEvent?: (name: string) => void, geoAgent?: GeoAgentOptions): ExperienceLoaderRuntime;
}
export interface EditorRuntime {
    createController(apiBase: string): EditorControllerRuntime;
}
export interface AnalyticsRuntimeProviders {
    experiences?: ExperienceRuntime;
    editor?: EditorRuntime;
    loadEditor?: () => Promise<EditorRuntime>;
}
declare global {
    interface Window {
        __movcuesGeoAgentRuntime__?: GeoAgentBundle;
        __movcuesExperienceRuntime__?: ExperienceRuntime;
        __movcuesEditorRuntime__?: EditorRuntime;
    }
}
