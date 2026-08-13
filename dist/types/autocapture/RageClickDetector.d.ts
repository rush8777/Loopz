import { EventBus } from "../core/EventBus";
import type { RageClickConfig } from "../types/config";
/**
 * Consumes raw click events (already privacy-filtered upstream) and
 * detects tight spatial+temporal clusters indicative of user frustration,
 * as opposed to normal repeated clicking or an intentional double-click.
 *
 * Emits exactly ONE aggregated rage_click event per cluster - never the
 * individual underlying clicks - and will not re-fire for clicks that were
 * already attributed to a cluster.
 */
export declare class RageClickDetector {
    private bus;
    private config;
    private cluster;
    private selectorGenerator;
    private lastEmittedClusterEnd;
    private unsubscribe;
    constructor(bus: EventBus, config: RageClickConfig);
    start(): void;
    stop(): void;
    private onClick;
    private emitRageCluster;
    private evaluateAndReset;
}
