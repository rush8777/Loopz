import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ElementCrawler } from "../src/autocapture/ElementCrawler";
import { EventBus } from "../src/core/EventBus";
import { PrivacyFilter } from "../src/privacy/PrivacyFilter";
import type { CrawledElement } from "../src/types/events";

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe("ElementCrawler", () => {
  let bus: EventBus;
  let crawler: ElementCrawler;
  let received: { elements: CrawledElement[] }[];

  beforeEach(() => {
    bus = new EventBus();
    crawler = new ElementCrawler(bus, new PrivacyFilter());
    received = [];
    bus.on<{ elements: CrawledElement[] }>("elements_seen", (p) => received.push(p));
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("discovers buttons and links on the page", () => {
    setBody(`
      <button type="submit">Save</button>
      <a href="/pricing">Pricing</a>
    `);

    crawler.crawl();

    expect(received).toHaveLength(1);
    const tags = received[0].elements.map((e) => e.tagName);
    expect(tags).toEqual(expect.arrayContaining(["button", "a"]));
  });

  it("includes computed label and role for each discovered element", () => {
    setBody(`<button type="submit">Save changes</button>`);
    crawler.crawl();

    const [el] = received[0].elements;
    expect(el.label).toBe("Save changes");
    expect(el.role).toBe("button");
    expect(el.selector).toBeTruthy();
  });

  it("discovers elements with an explicit interactive role, not just native interactive tags", () => {
    setBody(`<div role="button" tabindex="0">Custom button</div>`);
    crawler.crawl();

    expect(received[0].elements).toHaveLength(1);
    expect(received[0].elements[0].role).toBe("button");
  });

  it("does not emit for a page with no interactive elements", () => {
    setBody(`<div>Just some text</div><p>More text</p>`);
    crawler.crawl();
    expect(received).toHaveLength(0);
  });

  it("does not emit for an empty page", () => {
    setBody(``);
    crawler.crawl();
    expect(received).toHaveLength(0);
  });

  it("deduplicates elements that share the same computed selector within one crawl", () => {
    setBody(`<div><button class="row-action">x</button><button class="row-action">x</button><button class="row-action">x</button></div>`);
    crawler.crawl();

    const selectors = received[0].elements.map((e) => e.selector);
    expect(new Set(selectors).size).toBe(selectors.length);
  });

  it("respects the privacy filter - skips elements within a private subtree", () => {
    setBody(`<div data-private><button>Secret action</button></div><button>Public action</button>`);
    crawler.crawl();

    const labels = received[0].elements.map((e) => e.label);
    expect(labels).toContain("Public action");
    expect(labels).not.toContain("Secret action");
  });

  it("respects the privacy filter - skips all input elements (matches ClickCollector/HoverCollector policy)", () => {
    setBody(`<input type="text" /><button>Real button</button>`);
    crawler.crawl();

    const tags = received[0].elements.map((e) => e.tagName);
    expect(tags).not.toContain("input");
    expect(tags).toContain("button");
  });

  it("excludes elements with tabindex=-1 (programmatically focusable, not user-interactive)", () => {
    setBody(`<div tabindex="-1">Not really interactive</div><button>Real button</button>`);
    crawler.crawl();

    expect(received[0].elements).toHaveLength(1);
    expect(received[0].elements[0].tagName).toBe("button");
  });

  it("caps the number of elements reported per crawl", () => {
    const buttons = Array.from({ length: 600 }, (_, i) => `<button data-loopz-name="btn-${i}">${i}</button>`).join("");
    setBody(buttons);
    crawler.crawl();

    expect(received[0].elements.length).toBeLessThanOrEqual(500);
  });

  it("crawling twice in a row emits two separate batches", () => {
    setBody(`<button>One</button>`);
    crawler.crawl();
    crawler.crawl();
    expect(received).toHaveLength(2);
  });

  it("does not throw when document is unavailable", () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error - simulating a non-browser environment
    delete globalThis.document;
    expect(() => crawler.crawl()).not.toThrow();
    globalThis.document = originalDocument;
  });
});
