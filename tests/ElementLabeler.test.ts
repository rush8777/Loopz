import { describe, it, expect, afterEach } from "vitest";
import { computeElementLabel, computeElementRole } from "../src/dom/ElementLabeler";

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

describe("computeElementLabel priority order", () => {
  it("prefers an explicit data-loopz-name override above everything else", () => {
    const button = el(`<button data-loopz-name="Checkout button" aria-label="ignored">Ignored text</button>`);
    expect(computeElementLabel(button)).toBe("Checkout button");
  });

  it("uses aria-label when no override is present", () => {
    const button = el(`<button aria-label="Close dialog">X</button>`);
    expect(computeElementLabel(button)).toBe("Close dialog");
  });

  it("resolves aria-labelledby to the referenced element's text", () => {
    document.body.innerHTML = `<span id="lbl">Newsletter signup</span><button aria-labelledby="lbl"></button>`;
    const button = document.querySelector("button")!;
    expect(computeElementLabel(button)).toBe("Newsletter signup");
  });

  it("falls back to visible text content", () => {
    const a = el(`<a href="/pricing">View pricing</a>`);
    expect(computeElementLabel(a)).toBe("View pricing");
  });

  it("falls back to alt text for an image with no other metadata", () => {
    const img = el(`<img src="x.png" alt="Company logo" />`);
    expect(computeElementLabel(img)).toBe("Company logo");
  });

  it("falls back to title, then placeholder, in that order", () => {
    const withTitle = el(`<input title="Search field" placeholder="Type to search" />`);
    expect(computeElementLabel(withTitle)).toBe("Search field");

    const withPlaceholderOnly = el(`<input placeholder="Type to search" />`);
    expect(computeElementLabel(withPlaceholderOnly)).toBe("Type to search");
  });

  it("falls back to a semantic tag/role description when nothing else is available", () => {
    const submit = el(`<button type="submit"></button>`);
    expect(computeElementLabel(submit)).toBe("Submit button");

    const plainButton = el(`<button></button>`);
    expect(computeElementLabel(plainButton)).toBe("Button");

    const link = el(`<a></a>`);
    expect(computeElementLabel(link)).toBe("Link");

    const textInput = el(`<input type="email" />`);
    expect(computeElementLabel(textInput)).toBe("Email field");
  });

  it("never reads text content from within a privacy-marked subtree", () => {
    const wrapper = el(`<div data-private><button>Jane Doe's account</button></div>`);
    const button = wrapper.querySelector("button")!;
    expect(computeElementLabel(button)).toBe("Button"); // falls to semantic fallback, not the private text
  });

  it("truncates very long text content", () => {
    const longText = "A".repeat(120);
    const a = el(`<a>${longText}</a>`);
    const label = computeElementLabel(a);
    expect(label.length).toBeLessThanOrEqual(60);
    expect(label.endsWith("\u2026")).toBe(true);
  });

  it("collapses internal whitespace/newlines", () => {
    const button = el(`<button>\n  Save   changes  \n</button>`);
    expect(computeElementLabel(button)).toBe("Save changes");
  });
});

describe("computeElementRole", () => {
  it("prefers an explicit role attribute", () => {
    const div = el(`<div role="tab">Tab 1</div>`);
    expect(computeElementRole(div)).toBe("tab");
  });

  it("falls back to a tag-based role for common interactive elements", () => {
    expect(computeElementRole(el(`<button></button>`))).toBe("button");
    expect(computeElementRole(el(`<a></a>`))).toBe("link");
    expect(computeElementRole(el(`<select></select>`))).toBe("select");
    expect(computeElementRole(el(`<textarea></textarea>`))).toBe("textarea");
  });

  it("includes the input type in the role for form fields", () => {
    expect(computeElementRole(el(`<input type="checkbox" />`))).toBe("input:checkbox");
    expect(computeElementRole(el(`<input />`))).toBe("input:text");
  });

  it("returns undefined for a plain non-interactive element with no role", () => {
    expect(computeElementRole(el(`<div></div>`))).toBeUndefined();
  });
});
