import { describe, it, expect, afterEach } from "vitest";
import { SelectorGenerator } from "../src/dom/SelectorGenerator";

const gen = new SelectorGenerator();

function el(html: string): Element {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const element = wrapper.firstElementChild!;
  document.body.appendChild(element);
  return element;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("href canonicalization (dynamic-id fragmentation fix)", () => {
  it("collapses two different incident links to the same selector", () => {
    const a = el(`<a href="/dashboard/incidents/trc_96fa356cd0b5439e">View</a>`);
    const b = el(`<a href="/dashboard/incidents/trc_981efdf889a74992">View</a>`);

    expect(gen.generate(a)).toBe(gen.generate(b));
    expect(gen.generate(a)).toContain(":id");
    expect(gen.generate(a)).not.toContain("trc_96fa356cd0b5439e");
  });

  it("canonicalizes a purely numeric id segment", () => {
    const a = el(`<a href="/orders/48213">Order</a>`);
    expect(gen.generate(a)).toContain(":id");
    expect(gen.generate(a)).not.toContain("48213");
  });

  it("canonicalizes a UUID segment", () => {
    const a = el(`<a href="/users/550e8400-e29b-41d4-a716-446655440000">Profile</a>`);
    expect(gen.generate(a)).toContain(":id");
    expect(gen.generate(a)).not.toContain("550e8400");
  });

  it("leaves ordinary static route segments untouched", () => {
    const a = el(`<a href="/dashboard/settings">Settings</a>`);
    expect(gen.generate(a)).toContain("dashboard");
    expect(gen.generate(a)).toContain("settings");
    expect(gen.generate(a)).not.toContain(":id");
  });

  it("drops query string and hash entirely rather than canonicalizing them", () => {
    const a = el(`<a href="/search?query=jane%20doe&sort=recent#results">Search</a>`);
    const selector = gen.generate(a);
    expect(selector).not.toContain("query");
    expect(selector).not.toContain("results");
  });

  it("keeps safe fragment-only anchors distinct instead of collapsing them to an empty href", () => {
    const home = el(`<a href="#home">Home</a>`);
    const pricing = el(`<a href="#pricing">Pricing</a>`);

    expect(gen.generate(home)).not.toBe(gen.generate(pricing));
    expect(gen.generate(home)).toContain("home");
    expect(gen.generate(pricing)).toContain("pricing");
    expect(gen.generate(home)).not.toBe('a[href=""]');
  });

  it("normalizes dynamic ids and drops query data in hash-router links", () => {
    const first = el(`<a href="#/products/123?token=secret">First product</a>`);
    const second = el(`<a href="#/products/456?token=other-secret">Second product</a>`);

    expect(gen.generate(first)).toBe(gen.generate(second));
    expect(gen.generate(first)).toContain(":id");
    expect(gen.generate(first)).not.toContain("token");
    expect(gen.generate(first)).not.toContain("secret");
  });

  it("falls through for unsafe or empty fragments rather than exposing them or creating an empty href selector", () => {
    const unsafe = el(`<a href="#jane@example.com" class="account-link">Account</a>`);
    const empty = el(`<a href="#" class="placeholder-link">Placeholder</a>`);

    expect(gen.generate(unsafe)).toBe("a.account-link");
    expect(gen.generate(unsafe)).not.toContain("jane");
    expect(gen.generate(empty)).toBe("a.placeholder-link");
  });

  it("still prefers a stable id or data-testid over href when present", () => {
    const a = el(`<a id="primary-nav-incidents" href="/dashboard/incidents/trc_96fa356cd0b5439e">View</a>`);
    expect(gen.generate(a)).toBe("a#primary-nav-incidents");
  });
});

describe("Tailwind/utility class filtering (badge-selector-soup fix)", () => {
  it("does not build a selector from pure utility classes", () => {
    const span = el(`<span class="inline-flex items-center rounded-full px-2.5">Open</span>`);
    const selector = gen.generate(span);
    expect(selector).not.toContain("inline-flex");
    expect(selector).not.toContain("rounded-full");
  });

  it("still uses a genuinely custom, non-utility class name", () => {
    const span = el(`<span class="status-badge">Open</span>`);
    expect(gen.generate(span)).toBe("span.status-badge");
  });

  it("filters utility classes but keeps a real one from a mixed list", () => {
    const span = el(`<span class="inline-flex items-center badge-priority-high">High</span>`);
    const selector = gen.generate(span);
    expect(selector).toContain("badge-priority-high");
    expect(selector).not.toContain("inline-flex");
  });

  it("recognizes responsive/state variant-prefixed utility classes", () => {
    const div = el(`<div class="hover:bg-blue-500 md:flex">content</div>`);
    const selector = gen.generate(div);
    expect(selector).not.toContain("hover");
    expect(selector).not.toContain("md:flex");
  });

  it("still filters classes matching the pre-existing CSS-modules/hash pattern", () => {
    const div = el(`<div class="css-1a2b3c4d">content</div>`);
    expect(gen.generate(div)).not.toContain("css-1a2b3c4d");
  });
});

describe("describe() attaches label and role alongside the selector", () => {
  it("includes a computed label and role on every descriptor", () => {
    const button = el(`<button type="submit">Save changes</button>`);
    const descriptor = gen.describe(button);
    expect(descriptor.label).toBe("Save changes");
    expect(descriptor.role).toBe("button");
    expect(descriptor.selector).toBeTruthy();
  });
});
