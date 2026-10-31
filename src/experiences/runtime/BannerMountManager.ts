import type { ExperienceBehavior } from "../types";

export type BannerMountLocation = "body" | "document";

export function mountInlineBannerHost(host: HTMLElement, position: NonNullable<ExperienceBehavior["bannerPosition"]>): BannerMountLocation {
  host.style.cssText = "display:block;position:relative;box-sizing:border-box;width:100%;max-width:100%;min-width:0;pointer-events:none";
  const body = document.body;
  const documentElement = document.documentElement;
  const mountInDocument = !body || bodyLayoutNeedsDocumentLane(body);
  host.dataset.movcuesBannerMount = mountInDocument ? "document" : "body";

  if (!body) {
    documentElement.appendChild(host);
    return "document";
  }
  if (!mountInDocument) {
    if (position === "top") body.prepend(host); else body.append(host);
    return "body";
  }
  if (position === "top") documentElement.insertBefore(host, body);
  else documentElement.insertBefore(host, body.nextSibling);
  return "document";
}

function bodyLayoutNeedsDocumentLane(body: HTMLElement): boolean {
  const style = getComputedStyle(body);
  if (style.display === "grid" || style.display === "inline-grid" || style.display === "contents") return true;
  if (style.display === "inline-flex") return true;
  if (style.display !== "flex") return false;
  return style.flexDirection !== "column";
}
