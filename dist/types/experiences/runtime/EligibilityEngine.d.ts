import type { DeliveredExperience } from "../types";
/** Server-side targeting is authoritative; this only provides deterministic
 * priority ordering and the one-interruptive-experience invariant. */
export declare class EligibilityEngine {
    choose(experiences: DeliveredExperience[]): DeliveredExperience | null;
}
