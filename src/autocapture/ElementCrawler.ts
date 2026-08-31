import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
import { SelectorGenerator } from "../dom/SelectorGenerator";
import type { CrawledElement } from "../types/events";

const INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick], [tabindex]:not([tabindex="-1"])';

/** Hard cap per crawl - a runaway page with thousands of matching nodes should degrade gracefully (partial catalog) rather than block the main thread or send an enormous payload. */
const MAX_ELEMENTS_PER_CRAWL = 500;

/**
 * Scans the current page for interactive elements and reports them as
 * a batch, independent of whether anyone has actually clicked or
 * hovered any of them. This is what lets the dashboard answer "what
 * elements exist on this page" rather than only "what elements did
 * someone happen to interact with" - the source for Observe > Elements.
 *
 * Reuses `SelectorGenerator`/`ElementLabeler` (via `.describe()`) for
 * identity and display naming - no separate naming logic here, so a
 * crawled element and a clicked element for the same physical thing
 * always produce the same selector/label.
 *
 * Triggered externally (on SDK initialization + route change, see
 * `AutoCaptureEngine.ts`) rather than on a timer - the DOM only
 * meaningfully changes shape on navigation for most apps, and a
 * polling interval would be pure overhead for the common case.
 */
export class ElementCrawler {
  private readonly selectorGenerator = new SelectorGenerator();

  constructor(
    private readonly bus: EventBus,
    private readonly privacy: PrivacyFilter
  ) {}

  crawl(): void {
    if (typeof document === "undefined") return;

    const candidates = document.querySelectorAll(INTERACTIVE_SELECTOR);
    const seenSelectors = new Set<string>();
    const elements: CrawledElement[] = [];

    for (const el of Array.from(candidates)) {
      if (elements.length >= MAX_ELEMENTS_PER_CRAWL) break;
      if (!this.privacy.shouldCapture(el)) continue;

      const descriptor = this.selectorGenerator.describe(el);
      if (seenSelectors.has(descriptor.selector)) continue; // one entry per distinct selector per crawl, even if many DOM nodes share it (e.g. a repeated list item)
      seenSelectors.add(descriptor.selector);

      elements.push({
        selector: descriptor.selector,
        tagName: descriptor.tagName,
        ...(descriptor.label && { label: descriptor.label }),
        ...(descriptor.role && { role: descriptor.role }),
      });
    }

    if (elements.length === 0) return;

    this.bus.emit("elements_seen", { pagePath: location.pathname, elements });
  }
}
