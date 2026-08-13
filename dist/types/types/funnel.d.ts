export interface PageFunnelStep {
    path: string;
}
export interface EventFunnelStep {
    event: string;
}
export type FunnelStep = string | PageFunnelStep | EventFunnelStep;
export interface FunnelDefinition {
    name: string;
    steps: FunnelStep[];
    kind: "page" | "event";
}
export interface FunnelProgress {
    name: string;
    currentStepIndex: number;
    startedAt?: number;
    completedAt?: number;
    abandoned?: boolean;
}
