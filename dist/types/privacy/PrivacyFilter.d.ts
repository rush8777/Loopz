/**
 * Single source of truth for privacy decisions. Collectors ask
 * `shouldCapture(element)` before emitting anything derived from that
 * element, so privacy logic never has to be re-implemented per collector.
 */
export declare class PrivacyFilter {
    private detector;
    shouldCapture(el: Element | null): boolean;
    /** Convenience for coordinate-only events (move/scroll) that touch an element under the pointer. */
    shouldCaptureAtPoint(x: number, y: number): boolean;
}
