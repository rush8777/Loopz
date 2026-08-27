import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
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
 * Triggered externally (on start + route change, see
 * `AutoCaptureEngine.ts`) rather than on a timer - the DOM only
 * meaningfully changes shape on navigation for most apps, and a
 * polling interval would be pure overhead for the common case.
 */
export declare class ElementCrawler {
    private readonly bus;
    private readonly privacy;
    private readonly selectorGenerator;
    constructor(bus: EventBus, privacy: PrivacyFilter);
    crawl(): void;
}
