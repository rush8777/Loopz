/**
 * Checks once during SDK initialization for a dashboard-triggered live
 * verification. With no active challenge this is only the existing public
 * config bootstrap request; it never creates heartbeat traffic.
 */
export declare function processPendingSdkTasks(apiBase: string, siteId: string): Promise<void>;
export declare const acknowledgePendingSdkVerification: typeof processPendingSdkTasks;
