import { describe, expect, it } from "vitest";
import { safeScopedBuilderCss } from "../src/experiences/runtime/BuilderContentContract";

describe("responsive builder CSS security", () => {
  it("accepts scoped media rules and rejects unscoped selectors inside them", () => {
    const scoped = "@media(max-width:600px){.movcues-widget .movcues-widget__actions{flex-wrap:wrap}}";
    expect(safeScopedBuilderCss(scoped)).toBe(scoped);
    expect(safeScopedBuilderCss("@media(max-width:600px){button{width:100%}}")).toBeNull();
  });
});
