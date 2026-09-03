import type { DeliveredExperience } from "../types";

/** Server-side targeting is authoritative; this only provides deterministic
 * priority ordering and the one-interruptive-experience invariant. */
export class EligibilityEngine {
  choose(experiences: DeliveredExperience[]): DeliveredExperience | null {
    return [...experiences].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
  }
}

