import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { installPublicAPI } from "../src/api/PublicAPI";

/**
 * CDN/script-tag counterpart to module.test.ts's coverage: the SDK
 * script executing more than once on a page (duplicated <script> tag,
 * bootstrap() invoked twice, a dev-mode double-mount re-injecting the
 * script) used to install a second Analytics instance - with its own
 * AutoCaptureEngine and DOM listeners - overwriting window.analytics
 * out from under the first one. See PublicAPI.ts's installPublicAPI()
 * doc comment.
 */
describe("installPublicAPI() single-instance guarantee", () => {
  const GLOBAL_NAME = "__testAnalytics__";

  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>)[GLOBAL_NAME];
  });

  afterEach(() => {
    const w = window as unknown as Record<string, unknown>;
    (w[GLOBAL_NAME] as { destroy?: () => void } | undefined)?.destroy?.();
    delete w[GLOBAL_NAME];
  });

  it("returns the same Analytics instance when the script executes twice", () => {
    const first = installPublicAPI([GLOBAL_NAME]);
    const second = installPublicAPI([GLOBAL_NAME]);
    expect(second).toBe(first);
  });

  it("does not overwrite window[name] with a second API object on the repeat call", () => {
    installPublicAPI([GLOBAL_NAME]);
    const apiAfterFirst = (window as unknown as Record<string, unknown>)[GLOBAL_NAME];

    installPublicAPI([GLOBAL_NAME]);
    const apiAfterSecond = (window as unknown as Record<string, unknown>)[GLOBAL_NAME];

    expect(apiAfterSecond).toBe(apiAfterFirst);
  });

  it("only attaches one click listener across two installs, not one per install", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    const w = window as unknown as Record<string, unknown>;
    w[GLOBAL_NAME] = {
      q: [
        [
          "init",
          {
            siteId: "site_1",
            autocapture: { scroll: false, move: false, rageClick: false, hover: false, cursor: false, elementCrawler: false },
          },
        ],
      ],
      init: () => {},
    };

    installPublicAPI([GLOBAL_NAME]);
    installPublicAPI([GLOBAL_NAME]); // simulates the SDK script executing a second time

    const clickListenerCalls = addEventListenerSpy.mock.calls.filter(([type]) => type === "click");
    expect(clickListenerCalls).toHaveLength(1);

    addEventListenerSpy.mockRestore();
  });

  it("still drains bootstrap-queued commands on the first install", () => {
    const w = window as unknown as Record<string, unknown>;

    w[GLOBAL_NAME] = {
      q: [
        ["init", { siteId: "site_1", autocapture: { click: false, scroll: false, move: false, rageClick: false, hover: false, cursor: false, elementCrawler: false } }],
        ["event", "signed_up", { plan: "pro" }],
      ],
      init: () => {},
    };

    installPublicAPI([GLOBAL_NAME]);

    // The real API object replaces the stub entirely - it has no `q`,
    // which is itself evidence the queued command was handed off rather
    // than left stranded on an old stub.
    const installed = w[GLOBAL_NAME] as { q?: unknown[] };
    expect(installed.q).toBeUndefined();
  });
});
