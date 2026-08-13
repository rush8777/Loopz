type RouteChangeListener = (url: string) => void;

/**
 * Detects client-side route changes across all common SPA routing
 * strategies (pushState/replaceState, popstate, hashchange) without any
 * framework-specific adapter. History patching is done carefully: we wrap
 * the existing methods and always call through to the original
 * implementation so the host app's routing is never broken.
 */
export class RouteObserver {
  private listeners = new Set<RouteChangeListener>();
  private lastUrl = location.href;
  private installed = false;
  private originalPushState = history.pushState;
  private originalReplaceState = history.replaceState;
  private onPopState = () => this.checkForChange();
  private onHashChange = () => this.checkForChange();

  start(): void {
    if (this.installed) return;
    this.installed = true;

    const self = this;

    history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = self.originalPushState.apply(this, args);
      self.checkForChange();
      return result;
    };

    history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
      const result = self.originalReplaceState.apply(this, args);
      self.checkForChange();
      return result;
    };

    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("hashchange", this.onHashChange);
  }

  stop(): void {
    if (!this.installed) return;
    this.installed = false;
    history.pushState = this.originalPushState;
    history.replaceState = this.originalReplaceState;
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("hashchange", this.onHashChange);
  }

  onChange(fn: RouteChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private checkForChange(): void {
    // Defer a tick so frameworks that update the DOM asynchronously after a
    // route change (React Router, Next.js, Vue Router, etc.) have a chance
    // to settle before we snapshot page context.
    setTimeout(() => {
      const url = location.href;
      if (url !== this.lastUrl) {
        this.lastUrl = url;
        for (const fn of this.listeners) {
          try {
            fn(url);
          } catch {
            /* isolate listener failures */
          }
        }
      }
    }, 0);
  }
}
