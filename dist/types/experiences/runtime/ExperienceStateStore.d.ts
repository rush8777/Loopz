export interface GuideProgress {
    experienceId: string;
    versionId: string;
    currentStepId: string;
    status: "active" | "paused";
    impressionId?: string;
    launchContext?: {
        source: "api";
    } | {
        source: "checklist";
        sourceExperienceId: string;
        sourceItemId: string;
    };
    navigationAttempted?: boolean;
    shownRequested?: boolean;
    seenStepIds?: string[];
    completedStepIds?: string[];
    routePath?: string;
}
export declare class ExperienceStateStore {
    hasEver(id: string): boolean;
    hasInSession(id: string): boolean;
    markSeen(id: string): void;
    getGuideProgress(): GuideProgress | null;
    setGuideProgress(progress: GuideProgress): void;
    clearGuideProgress(experienceId?: string): void;
}
