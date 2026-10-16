import { afterEach, describe, expect, it } from "vitest";
import { extractDesignTokens } from "../src/themes/DesignTokenExtractor";

describe("DesignTokenExtractor", () => {
  afterEach(() => { document.body.innerHTML = ""; document.head.querySelectorAll("[data-theme-test]").forEach(element => element.remove()); document.documentElement.removeAttribute("style"); });

  it("extracts semantic computed styles without collecting page content", async () => {
    document.body.innerHTML = `<main style="background:#f8fafc;border:1px solid #ddd;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.2)"><h1 style="font-family:Georgia;font-size:32px;font-weight:700;line-height:40px">Private customer name</h1><button style="background:#7c3aed;color:#fff;border-radius:10px">Secret action</button></main>`;
    document.body.style.cssText = "background:#fff;color:#111827;font-family:Arial;font-size:16px;line-height:24px";
    document.documentElement.style.setProperty("--brand-color", "#7c3aed");
    const payload = await extractDesignTokens();
    expect(payload.tokens).toMatchObject({ version: 1, colors: { primary: "rgb(124, 58, 237)" }, typography: { headingFontSize: 32 }, radii: { md: 10 } });
    expect(payload.evidence.cssVariables["--brand-color"]).toBe("#7c3aed");
    expect(JSON.stringify(payload)).not.toContain("Private customer name");
    expect(JSON.stringify(payload)).not.toContain("Secret action");
  });

  it("caps CSS variable evidence at one hundred entries", async () => {
    for (let index = 0; index < 130; index += 1) document.documentElement.style.setProperty(`--color-${index}`, `#${String(index).padStart(6, "0")}`);
    const payload = await extractDesignTokens();
    expect(Object.keys(payload.evidence.cssVariables).length).toBeLessThanOrEqual(100);
  });

  it("prefers recurring filled actions and common semantic shorthand variables over generic links", async () => {
    const style = document.createElement("style");
    style.dataset.themeTest = "true";
    style.textContent = `:root{--brand:#635bff;--ink:#111827;--muted:#667085;--line:#e7eaf0;--soft:#f7f8fc}body{background:#fff;color:#111827;font-family:Inter,sans-serif}.logo,.text-link{background:transparent;color:#667085}.primary{background:#635bff;color:#fff;border-radius:8px;box-shadow:0 6px 16px rgba(99,91,255,.2)}.card{border:1px solid #e7eaf0;border-radius:12px}p{color:#667085}`;
    document.head.append(style);
    document.body.innerHTML = `<a class="logo" href="#">Logo</a><a class="primary" href="#">One</a><a class="primary" href="#">Two</a><a class="text-link" href="#">More</a><article class="card"><h1>Heading</h1><p>Muted</p></article>`;
    const payload = await extractDesignTokens();
    expect(payload.tokens.colors).toMatchObject({ primary: "rgb(99, 91, 255)", primaryForeground: "rgb(255, 255, 255)", mutedText: "rgb(102, 112, 133)", border: "rgb(231, 234, 240)", surface: "#f7f8fc" });
    expect(payload.tokens.radii.md).toBe(8);
    expect(payload.evidence.cssVariables).toMatchObject({ "--brand": "#635bff", "--ink": "#111827", "--muted": "#667085", "--line": "#e7eaf0", "--soft": "#f7f8fc" });
  });
});
