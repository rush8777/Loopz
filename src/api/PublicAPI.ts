import { Analytics } from "../core/Analytics";
import { installUnloadHandlers } from "../core/unloadHandlers";

type QueuedCommand = [method: string, ...args: unknown[]];

interface QueueStub {
  q: QueuedCommand[];
  init: (...args: unknown[]) => void;
  [key: string]: unknown;
}

/** The real API object installed on window[name] once the SDK has loaded - distinguished from QueueStub by carrying a back-reference to the Analytics instance it wraps, which is how installPublicAPI() detects "already installed" on a repeat call. */
interface InstalledApi {
  __analyticsInstance: Analytics;
  [key: string]: unknown;
}

const PUBLIC_METHODS = [
  "init",
  "start",
  "stop",
  "destroy",
  "event",
  "identify",
  "page",
  "defineFunnel",
  "enableDebug",
  "disableDebug",
] as const;

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
export function installPublicAPI(globalNames: string[]): Analytics {
  const w = window as unknown as Record<string, InstalledApi | QueueStub | undefined>;

  for (const name of globalNames) {
    const existing = w[name];
    if (existing && "__analyticsInstance" in existing) return (existing as InstalledApi).__analyticsInstance;
  }

  const analytics = new Analytics();

  const realApi: Record<string, (...args: unknown[]) => void> = {
    init: (...args) => analytics.init(args[0] as any),
    start: () => analytics.start(),
    stop: () => analytics.stop(),
    destroy: () => analytics.destroy(),
    event: (...args) => analytics.event(args[0] as string, args[1] as Record<string, unknown>),
    identify: (...args) => analytics.identify(args[0] as string, args[1] as Record<string, unknown>),
    page: () => analytics.page(),
    defineFunnel: (...args) => analytics.defineFunnel(args[0] as string, args[1] as any),
    enableDebug: () => analytics.enableDebug(),
    disableDebug: () => analytics.disableDebug(),
  };

  for (const name of globalNames) {
    const existingStub = w[name] as QueueStub | undefined;

    // Replace the bootstrap stub with the real API, preserving any queued commands.
    const queuedCommands: QueuedCommand[] = existingStub?.q ?? [];

    const finalApi = realApi as unknown as InstalledApi;
    finalApi.__analyticsInstance = analytics;
    w[name] = finalApi;

    for (const method of PUBLIC_METHODS) {
      if (!(method in finalApi)) {
        finalApi[method] = () => void 0;
      }
    }

    for (const command of queuedCommands) {
      const [method, ...args] = command;
      if (typeof realApi[method] === "function") {
        realApi[method](...args);
      }
    }
  }

  installUnloadHandlers(analytics);

  return analytics;
}
