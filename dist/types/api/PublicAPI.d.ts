import { Analytics } from "../core/Analytics";
/**
 * Builds the real, fully-loaded public API and drains any commands that
 * were queued by the bootstrap snippet before this script finished
 * downloading. This is what makes `analytics.event("x")` "just work"
 * regardless of whether it was called before or after the SDK loaded.
 */
export declare function installPublicAPI(globalNames: string[]): Analytics;
