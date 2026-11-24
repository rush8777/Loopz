import type { CapturedGuideTarget } from "./GuideCaptureTypes";
export declare class GuideCaptureSelection {
    private readonly onSelect;
    private readonly surface;
    private readonly observer;
    private mutationTimer;
    private hover;
    private frame;
    private enabled;
    private targets;
    private markers;
    constructor(onSelect: (element: Element) => void);
    setEnabled(enabled: boolean): void;
    setTargets(targets: CapturedGuideTarget[]): void;
    refresh(): void;
    destroy(): void;
    private invalidate;
    private move;
    private intercept;
    private placeMarkers;
}
