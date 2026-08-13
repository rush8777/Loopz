import { Analytics } from "../core/Analytics";
import { installUnloadHandlers } from "../core/unloadHandlers";

type QueuedCommand = [method: string, ...args: unknown[]];

interface QueueStub {
  q: QueuedCommand[];
  init: (...args: unknown[]) => void;
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
 */
export function installPublicAPI(globalNames: string[]): Analytics {
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
    const w = window as unknown as Record<string, QueueStub | undefined>;
    const existingStub = w[name];

    // Replace the bootstrap stub with the real API, preserving any queued commands.
    const queuedCommands: QueuedCommand[] = existingStub?.q ?? [];

    const finalApi = realApi as unknown as QueueStub;
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
