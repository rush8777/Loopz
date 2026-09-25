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
  mode: "select" | "navigate";
}

export interface EditorContinuation {
  session: EditorSession;
  editorState?: EditorAuthoringState;
}

export interface EditorControllerRuntime {
  start(rawToken: string): Promise<boolean>;
  resume(continuation: EditorContinuation): Promise<boolean>;
  destroy(): void;
}

export interface ExperienceRuntime {
  createLoader(
    apiBase: string,
    siteId: string,
    session: ExperienceSession,
    trackEvent?: (name: string) => void
  ): ExperienceLoaderRuntime;
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
