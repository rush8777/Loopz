/**
 * Captures the URL of the currently executing <script> tag at module
 * evaluation time. `document.currentScript` is only reliable during a
 * script's initial synchronous execution (works for both normal and
 * async/defer script tags, but not from inside a later callback) - since
 * this SDK ships as a single IIFE, reading it here at the top level
 * captures it at exactly the right time, regardless of how the bootstrap
 * snippet loaded the script.
 */
export declare const currentScriptUrl: string | null;
