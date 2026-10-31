import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceRenderer } from "../src/experiences/runtime/ExperienceRenderer";
import type { DeliveredExperience, ExperienceBehavior } from "../src/experiences/types";

const callbacks = () => ({ onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() });

function banner(behavior: ExperienceBehavior, builder = true): DeliveredExperience {
  return {
    id: "banner_1", versionId: "version_1", kind: "widget", widgetType: "banner", priority: 1,
    definition: {
      content: { heading: "LaunchPad", body: "A faster way to work." },
      design: { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } },
      behavior,
      ...(builder ? { builder: { version: 1, projectData: {}, html: '<section class="movcues-widget"><p>Banner</p></section>', css: ".movcues-widget{width:640px;padding:12px}" } } : {}),
    },
  };
}

describe("banner mounting", () => {
  beforeEach(() => { document.body.removeAttribute("style"); document.body.innerHTML = '<main id="page">Page</main>'; });
  afterEach(() => { document.body.removeAttribute("style"); document.querySelectorAll("[data-movcues-experience]").forEach(node => node.remove()); vi.restoreAllMocks(); });

  it("mounts inline top banners at the start of normal body flow and removes them on dismiss", () => {
    const renderer = new ExperienceRenderer(); const events = callbacks();
    expect(renderer.render(banner({ dismissible: true, bannerPosition: "top", bannerDisplayMode: "inline" }), events)).toBe(true);
    const host = document.querySelector<HTMLElement>("[data-movcues-experience]")!; const card = host.shadowRoot!.querySelector<HTMLElement>(".banner")!; const widget = host.shadowRoot!.querySelector<HTMLElement>(".movcues-widget")!;
    expect(host.parentElement).toBe(document.body); expect(document.body.firstElementChild).toBe(host); expect(host.dataset.movcuesBannerMount).toBe("body");
    expect(host.style.position).toBe("relative"); expect(card.dataset.displayMode).toBe("inline"); expect(widget.style.getPropertyValue("width")).toBe("100%"); expect(widget.style.getPropertyPriority("width")).toBe("important");
    host.shadowRoot!.querySelector<HTMLElement>(".movcues-runtime-chrome")!.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click();
    expect(events.onDismiss).toHaveBeenCalledOnce(); expect(document.querySelector("[data-movcues-experience]")).toBeNull(); expect(document.body.firstElementChild?.id).toBe("page");
  });

  it("keeps mode-less banners on the legacy overlay path", () => {
    const renderer = new ExperienceRenderer(); renderer.render(banner({ dismissible: false, bannerPosition: "bottom" }, false), callbacks());
    const host = document.querySelector<HTMLElement>("[data-movcues-experience]")!; const card = host.shadowRoot!.querySelector<HTMLElement>(".banner")!;
    expect(host.parentElement).toBe(document.documentElement); expect(host.style.position).toBe("fixed"); expect(card.dataset.displayMode).toBe("overlay"); expect(card.dataset.position).toBe("bottom");
    renderer.destroy(); expect(document.querySelector("[data-movcues-experience]")).toBeNull();
  });

  it.each(["flex", "grid"])("uses the document flow lane for %s body layouts", display => {
    document.body.style.display = display; if (display === "flex") document.body.style.flexDirection = "row";
    const renderer = new ExperienceRenderer(); renderer.render(banner({ dismissible: false, bannerPosition: "top", bannerDisplayMode: "inline" }), callbacks());
    const host = document.querySelector<HTMLElement>("[data-movcues-experience]")!;
    expect(host.parentElement).toBe(document.documentElement); expect(host.nextElementSibling).toBe(document.body); expect(host.dataset.movcuesBannerMount).toBe("document");
    renderer.destroy();
  });

  it("appends inline bottom banners after ordinary body content", () => {
    const renderer = new ExperienceRenderer(); renderer.render(banner({ dismissible: false, bannerPosition: "bottom", bannerDisplayMode: "inline" }), callbacks());
    const host = document.querySelector<HTMLElement>("[data-movcues-experience]")!;
    expect(host.parentElement).toBe(document.body); expect(document.body.lastElementChild).toBe(host);
    renderer.destroy();
  });
});
