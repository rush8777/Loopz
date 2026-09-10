export interface GuideProgress {
    experienceId: string;
    versionId: string;
    currentStepId: string;
    status: "active" | "paused";
    impressionId?: string;
}
export declare class ExperienceStateStore {
    hasEver(id: string): boolean;
    hasInSession(id: string): boolean;
    markSeen(id: string): void;
    getGuideProgress(): GuideProgress | null;
    setGuideProgress(progress: GuideProgress): void;
    clearGuideProgress(experienceId?: string): void;
}
