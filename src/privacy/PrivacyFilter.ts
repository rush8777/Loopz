import { SensitiveElementDetector } from "./SensitiveElementDetector";

/**
 * Single source of truth for privacy decisions. Collectors ask
 * `shouldCapture(element)` before emitting anything derived from that
 * element, so privacy logic never has to be re-implemented per collector.
 */
export class PrivacyFilter {
  private detector = new SensitiveElementDetector();

  shouldCapture(el: Element | null): boolean {
    if (!el) return true;
    if (this.detector.isWithinPrivateSubtree(el)) return false;
    if (this.detector.isSensitiveFormElement(el)) return false;
    return true;
  }

  /** Convenience for coordinate-only events (move/scroll) that touch an element under the pointer. */
  shouldCaptureAtPoint(x: number, y: number): boolean {
    const el = document.elementFromPoint(x, y);
    return this.shouldCapture(el);
  }
}
