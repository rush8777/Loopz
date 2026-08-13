type RouteChangeListener = (url: string) => void;
/**
 * Detects client-side route changes across all common SPA routing
 * strategies (pushState/replaceState, popstate, hashchange) without any
 * framework-specific adapter. History patching is done carefully: we wrap
 * the existing methods and always call through to the original
 * implementation so the host app's routing is never broken.
 */
export declare class RouteObserver {
    private listeners;
    private lastUrl;
    private installed;
    private originalPushState;
    private originalReplaceState;
    private onPopState;
    private onHashChange;
    start(): void;
    stop(): void;
    onChange(fn: RouteChangeListener): () => void;
    private checkForChange;
}
export {};
