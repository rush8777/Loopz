/**
 * Checks once during SDK initialization for a dashboard-triggered live
 * verification. With no active challenge this is only the existing public
 * config bootstrap request; it never creates heartbeat traffic.
 */
export declare function acknowledgePendingSdkVerification(apiBase: string, siteId: string): Promise<void>;
