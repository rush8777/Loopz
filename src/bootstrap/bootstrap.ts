/**
 * Legacy programmatic bootstrap helper. The recommended installation is now
 * the single data-site-id script tag in bootstrap/install-snippet.html; the
 * SDK itself owns auto-initialization. This helper remains for compatibility
 * with integrations that create the script element programmatically.
 *
 * The snippet's only job is to:
 *   1. Create a global queue stub synchronously (so analytics.event(...)
 *      never throws even before the real SDK has loaded).
 *   2. Asynchronously load the real SDK from the CDN.
 *
 * It must stay dependency-free and tiny - this is the ONLY code that
 * blocks (synchronously executes) on the customer's page.
 */
export function bootstrap(
  w: Window & Record<string, any>,
  d: Document,
  scriptTag: "script",
  sdkUrl: string,
  globalName: string,
  siteId: string
): void {
  const existing = w[globalName];
  const stub =
    existing && typeof existing === "object"
      ? existing
      : {
          q: [] as unknown[][],
          init(this: { q: unknown[][] }, ...args: unknown[]) {
            this.q.push(args);
          },
        };

  // Queue every public method call made before the real SDK loads.
  for (const method of [
    "init",
    "start",
    "stop",
    "destroy",
    "event",
    "identify",
    "page",
    "defineFunnel",
    "enableDebug",
    "disableDebug",
  ]) {
    if (!(method in stub)) {
      (stub as any)[method] = function (this: { q: unknown[][] }, ...args: unknown[]) {
        this.q.push([method, ...args]);
      };
    }
  }

  w[globalName] = stub;

  const script = d.createElement(scriptTag);
  script.async = true;
  script.src = sdkUrl;
  script.dataset.siteId = siteId;

  const first = d.getElementsByTagName(scriptTag)[0];
  if (first && first.parentNode) {
    first.parentNode.insertBefore(script, first);
  } else {
    d.head.appendChild(script);
  }
}
