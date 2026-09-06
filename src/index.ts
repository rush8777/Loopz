import { autoInitializeFromScript, installPublicAPI } from "./api/PublicAPI";
import { currentScriptElement } from "./core/scriptOrigin";

/**
 * This is the file that gets built into dist/sdk.js and dist/sdk.min.js -
 * the script asynchronously loaded by the bootstrap snippet. It replaces
 * the tiny queue stub(s) created by the bootstrap with the real API and
 * drains any commands queued in the meantime.
 *
 * Both `window.__myAnalytics__` and the short alias `window.analytics`
 * are supported so a site can use whichever name its bootstrap snippet set up.
 */
const analytics = installPublicAPI(["__myAnalytics__", "analytics"]);
autoInitializeFromScript(analytics, currentScriptElement);
