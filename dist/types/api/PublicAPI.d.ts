import { Analytics } from "../core/Analytics";
/**
 * Builds the real, fully-loaded public API and drains any commands that
 * were queued by the bootstrap snippet before this script finished
 * downloading. This is what makes `analytics.event("x")` "just work"
 * regardless of whether it was called before or after the SDK loaded.
 *
 * Idempotent per global name: if a previous call already installed a
 * real (non-stub) API on `window[name]`, that instance is reused rather
 * than replaced. Without this guard, the SDK script executing more than
 * once on the same page - a duplicated <script> tag, bootstrap() being
 * invoked twice, a dev-mode double-mount re-injecting the script - would
 * silently spin up a second Analytics instance with its own
 * AutoCaptureEngine and DOM listeners, doubling every click, scroll,
 * hover, and page view it captures. See module.ts's createAnalytics()
 * for the equivalent guard on the ESM entry point.
 */
export declare function installPublicAPI(globalNames: string[]): Analytics;
