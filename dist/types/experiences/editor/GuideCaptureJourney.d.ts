import type { CaptureObservation, CapturedGuideTarget } from "./GuideCaptureTypes";
type WithoutSequence<T> = T extends {
    sequence: number;
} ? Omit<T, "sequence"> : never;
export type NewCaptureObservation = WithoutSequence<CaptureObservation>;
/** Observe only discrete author interactions. A nearby click is temporal evidence. */
export declare class GuideCaptureJourney {
    private readonly targets;
    private readonly record;
    private active;
    private path;
    private recentClick;
    private frame;
    constructor(targets: () => CapturedGuideTarget[], record: (observation: NewCaptureObservation) => number);
    activate(previousPath?: string | null): void;
    stop(): void;
    routeChanged(): void;
    private observeClick;
}
export {};
