import { beforeEach, describe, expect, it } from "vitest";
import { StackingContextResolver } from "../src/experiences/runtime/layering/StackingContextResolver";

describe("StackingContextResolver", () => {
  const resolver = new StackingContextResolver();
  beforeEach(() => { document.body.innerHTML = ""; });

  it("uses the outer document-facing context instead of a nested large z-index", () => {
    const outer = element("position:relative;z-index:10");
    const inner = element("position:relative;z-index:999999");
    const target = element("");
    inner.appendChild(target); outer.appendChild(inner); document.body.appendChild(outer);
    const result = resolver.resolve(target);
    expect(result.element).toBe(outer); expect(result.zIndex).toBe(10);
  });

  it("recognizes transform-created stacking contexts", () => {
    const parent = element("transform:translateZ(0)"); const target = element(""); parent.appendChild(target); document.body.appendChild(parent);
    expect(resolver.resolve(target)).toMatchObject({ element: parent, zIndex: 0 });
  });

  it.each(["position:sticky", "position:fixed"])("recognizes %s elements", style => {
    const navbar = element(style); const target = element(""); navbar.appendChild(target); document.body.appendChild(navbar);
    expect(resolver.resolve(target).element).toBe(navbar);
  });

  it.each([
    "opacity:.9", "filter:blur(1px)", "perspective:1000px", "isolation:isolate",
    "mix-blend-mode:multiply", "contain:paint", "will-change:transform",
  ])("recognizes a context created by %s", style => {
    const parent = element(style); const target = element(""); parent.appendChild(target); document.body.appendChild(parent);
    expect(resolver.resolve(target).element).toBe(parent);
  });
});

function element(style: string): HTMLDivElement { const value = document.createElement("div"); value.style.cssText = style; return value; }
