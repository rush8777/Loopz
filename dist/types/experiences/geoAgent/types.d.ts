export interface DeliveredGeoAgent {
    id: string;
    versionId: string;
    configuration: {
        schemaVersion: 1;
        appearance: {
            name: string;
            avatarUrl?: string;
            brandColor: string;
            theme: "light" | "dark" | "system";
            launcher: "icon" | "label";
            launcherLabel: string;
            position: "bottom-left" | "bottom-right";
            welcome: string;
            placeholder: string;
            suggestions: string[];
        };
        persistence: "page" | "tab";
    };
}
export interface GeoAgentOptions {
    bundleUrl?: string;
    identityToken?: () => string | null | Promise<string | null>;
}
export interface GeoAgentMountOptions extends GeoAgentOptions {
    siteId: string;
    apiBase: string;
    ownerKey: string;
    onUnavailable: () => void;
}
export interface GeoAgentRuntime {
    destroy(clearPersistence?: boolean): void;
}
export interface GeoAgentBundle {
    mount(delivery: DeliveredGeoAgent, options: GeoAgentMountOptions): GeoAgentRuntime;
}
export type LoadGeoAgent = (bundleUrl?: string) => Promise<GeoAgentBundle | null>;
