import { describe, expect, it } from "vitest";
import { EXPERIENCE_PRESETS, resolvedTheme } from "../src/themes/ExperienceTheme";
import type { VisualThemeState } from "../src/themes/types";

describe("experience visual themes", () => {
  it("resolves experience overrides without mutating the selected base", () => {
    const base = structuredClone(EXPERIENCE_PRESETS.modern);
    const state: VisualThemeState = {
      source: "preset",
      preset: "modern",
      templateTokens: structuredClone(EXPERIENCE_PRESETS.minimal),
      baseTokens: base,
      overrides: { primary: "#dc2626", secondary: "#fef2f2", headingFontSize: 32, radius: 10 },
    };

    const result = resolvedTheme(state);

    expect(result.colors.primary).toBe("#dc2626");
    expect(result.colors.surface).toBe("#fef2f2");
    expect(result.typography.headingFontSize).toBe(32);
    expect(result.radii).toEqual({ sm: 5, md: 10, lg: 15 });
    expect(base).toEqual(EXPERIENCE_PRESETS.modern);
  });

  it("restores template defaults by clearing only experience overrides", () => {
    const templateTokens = structuredClone(EXPERIENCE_PRESETS.soft);
    const state: VisualThemeState = {
      source: "template",
      templateId: "widget-welcome-modal",
      templateTokens,
      baseTokens: structuredClone(templateTokens),
      overrides: { background: "#111111", spacing: 24 },
    };

    state.overrides = {};

    expect(resolvedTheme(state)).toEqual(templateTokens);
    expect(state.templateId).toBe("widget-welcome-modal");
  });
});
