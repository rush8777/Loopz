import { currentScriptUrl } from "./scriptOrigin";

export type SdkBundle = "experiences" | "editor" | "replay" | "heatmap";

const pendingLoads = new Map<string, Promise<unknown | null>>();

/**
 * Derives a stable sibling artifact from the core script URL. Readable
 * sdk.js loads readable siblings; sdk.min.js and the public v1.js alias
 * load minified siblings.
 */
export function deriveSiblingBundleUrl(scriptUrl: string | null, bundle: SdkBundle): string | null {
  if (!scriptUrl) return null;

  try {
    const url = new URL(scriptUrl, typeof location === "undefined" ? undefined : location.href);
    const parts = url.pathname.split("/");
    const file = parts[parts.length - 1] ?? "";
    const readable = file === "sdk.js";

    if (file !== "sdk.js" && file !== "sdk.min.js" && file !== "v1.js" && file !== "v1.min.js") {
      return null;
    }

    parts[parts.length - 1] = `sdk-${bundle}${readable ? "" : ".min"}.js`;
    url.pathname = parts.join("/");
    return url.href;
  } catch {
    return null;
  }
}

export function sdkBundleUrl(bundle: SdkBundle, overrideUrl?: string): string | null {
  return overrideUrl || deriveSiblingBundleUrl(currentScriptUrl, bundle);
}

/**
 * Loads an SDK-owned script without allowing network or initialization
 * failures to escape into the host application. Concurrent callers and
 * duplicate SDK instances share an existing matching script element.
 */
export function loadSdkBundle<T>(
  url: string | null,
  globalCheck: () => T | undefined,
  label: string
): Promise<T | null> {
  const available = globalCheck();
  if (available) return Promise.resolve(available);
  if (!url || typeof document === "undefined") return Promise.resolve(null);

  const existingPromise = pendingLoads.get(url) as Promise<T | null> | undefined;
  if (existingPromise) return existingPromise;

  const promise = new Promise<T | null>((resolve) => {
    const selector = `script[data-movcues-bundle-url="${escapeAttribute(url)}"]`;
    const existing = document.querySelector<HTMLScriptElement>(selector);
    const script = existing ?? document.createElement("script");
    let settled = false;

    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    script.addEventListener("load", () => finish(globalCheck() ?? null), { once: true });
    script.addEventListener("error", () => {
      // eslint-disable-next-line no-console
      console.warn(`[Analytics] failed to load ${label} bundle from ${url}`);
      finish(null);
    }, { once: true });

    if (!existing) {
      script.src = url;
      script.async = true;
      script.dataset.movcuesBundleUrl = url;
      (document.head ?? document.documentElement).appendChild(script);
    }
  });

  pendingLoads.set(url, promise);
  return promise;
}

function escapeAttribute(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
