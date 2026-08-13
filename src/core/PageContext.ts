import type { PageContext } from "../types/events";

export function getPageContext(): PageContext {
  const doc = document.documentElement;
  return {
    url: location.href,
    path: location.pathname,
    hostname: location.hostname,
    referrer: document.referrer || undefined,
    title: document.title || undefined,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentWidth: Math.max(doc.scrollWidth, doc.clientWidth),
    documentHeight: Math.max(doc.scrollHeight, doc.clientHeight),
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}
