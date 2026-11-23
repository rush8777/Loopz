import type { CapturedGuideTarget } from "./GuideCaptureTypes";
export declare function captureTargetFor(node: EventTarget | null): Element | null;
export declare function guideCapturePath(url?: Pick<Location, "pathname" | "hash">): string | null;
export declare function describeCaptureTarget(element: Element, id: string, pagePath: string): CapturedGuideTarget;
