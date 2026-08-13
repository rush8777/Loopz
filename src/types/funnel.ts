export interface PageFunnelStep {
  path: string; // exact path or simple wildcard, e.g. "/checkout/*"
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
  currentStepIndex: number; // -1 means not started
  startedAt?: number;
  completedAt?: number;
  abandoned?: boolean;
}
