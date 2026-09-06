export type SdkBundle = "experiences" | "editor" | "replay" | "heatmap";
/**
 * Derives a stable sibling artifact from the core script URL. Readable
 * sdk.js loads readable siblings; sdk.min.js and the public v1.js alias
 * load minified siblings.
 */
export declare function deriveSiblingBundleUrl(scriptUrl: string | null, bundle: SdkBundle): string | null;
export declare function sdkBundleUrl(bundle: SdkBundle, overrideUrl?: string): string | null;
/**
 * Loads an SDK-owned script without allowing network or initialization
 * failures to escape into the host application. Concurrent callers and
 * duplicate SDK instances share an existing matching script element.
 */
export declare function loadSdkBundle<T>(url: string | null, globalCheck: () => T | undefined, label: string): Promise<T | null>;
