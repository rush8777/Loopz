import type { ExperienceBehavior, ExperienceDesign } from "../types";
/**
 * Dims the viewport around an anchored target without changing the target or
 * the page DOM. Geometry is supplied by AnchoredCardRenderer so the backdrop
 * shares its coalesced positioning lifecycle.
 */
export declare class AnchoredTargetBackdrop {
    private panels;
    private highlight;
    private releaseScrollLock;
    constructor(root: ShadowRoot, card: HTMLElement, behavior: ExperienceBehavior, design: ExperienceDesign, onDismiss: () => void);
    update(rect: DOMRect): void;
    setHidden(hidden: boolean): void;
    destroy(): void;
}
