import { EventBus } from "../core/EventBus";
import { PrivacyFilter } from "../privacy/PrivacyFilter";
/**
 * Captures every click on the page via a single delegated listener on
 * `document` (capture phase), rather than attaching a listener per
 * element. This scales to pages with thousands of nodes.
 */
export declare class ClickCollector {
    private bus;
    private privacy;
    private selectorGenerator;
    private handler;
    private running;
    constructor(bus: EventBus, privacy: PrivacyFilter);
    start(): void;
    stop(): void;
    private onClick;
}
