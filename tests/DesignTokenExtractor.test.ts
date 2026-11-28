import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectDesignEvidence } from "../src/themes/DesignTokenExtractor";

describe("website design evidence", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-offscreen") ? new DOMRect(0, 5000, 100, 44) : new DOMRect(15, 20, 120, 44);
    });
    document.body.style.cssText = "background:#fff;color:#111827;font-family:Arial;font-size:16px;line-height:24px";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  it("distinguishes display, product and component typography without uploading customer content", async () => {
    document.body.innerHTML = `<main>
      <h1 style="font-family:Georgia;font-size:72px">Private customer name</h1>
      <article class="card" style="background:#f8fafc;border:1px solid #ddd;border-radius:12px">
        <h2 style="font-family:Arial;font-size:22px;font-weight:700;line-height:27px">Private project</h2>
        <p style="font-size:14px">Account number</p>
        <button class="is-primary" style="background:#7c3aed;color:#fff;border-radius:10px">Secret action</button>
        <input style="font-size:15px" value="private-secret">
      </article>
    </main>`;
    document.documentElement.style.setProperty("--brand-color", "#7c3aed");
    const { evidence } = await collectDesignEvidence();
    expect(evidence.samples).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "display", fontSize: 72 }),
      expect.objectContaining({ role: "heading", fontFamily: "Arial", fontSize: 22, fontWeight: 700 }),
      expect.objectContaining({ role: "primaryButton", background: "rgb(124, 58, 237)", radius: 10 }),
      expect.objectContaining({ role: "input", fontSize: 15 }),
    ]));
    expect(evidence.variables.primary).toBe("#7c3aed");
    expect(JSON.stringify(evidence)).not.toMatch(/Private customer name|Private project|Account number|Secret action|private-secret/);
  });

  it("filters irrelevant, offscreen and duplicate controls and ignores unrelated variables", async () => {
    document.body.innerHTML = `<div hidden><button class="primary" style="background:red">Hidden</button></div>
      <div style="opacity:0"><h2 style="font-size:45px">Invisible</h2></div>
      <div data-movcues-experience><button class="primary" style="background:red">Editor</button></div>
      <div class="intercom-widget"><button style="background:red">Overlay</button></div>
      <button data-offscreen style="background:red">Below the fold</button>
      ${'<button class="secondary" style="background:#f1f5f9;color:#111827">A</button>'.repeat(80)}
      <button style="background:#1d4ed8;color:white">Brand</button>`;
    document.documentElement.style.setProperty("--private-note", "send all customer data");
    const { evidence } = await collectDesignEvidence();
    expect(evidence.samples.filter(sample => sample.role === "primaryButton")).toEqual([expect.objectContaining({ count: 1, background: "rgb(29, 78, 216)" })]);
    expect(evidence.samples.filter(sample => sample.role === "secondaryButton")).toEqual([expect.objectContaining({ count: 80 })]);
    expect(evidence.samples).not.toContainEqual(expect.objectContaining({ role: "display" }));
    expect(evidence.variables).toEqual({});
    expect(JSON.stringify(evidence).length).toBeLessThan(2500);
  });

  it("captures dark surfaces and falls back to page-level evidence on sparse sites", async () => {
    document.body.style.cssText = "background:#101828;color:#f9fafb;font-family:'Custom Sans', sans-serif";
    document.body.innerHTML = '<div role="dialog" style="background:#1e293b"><label>Customer contact</label></div>';
    const dark = await collectDesignEvidence();
    expect(dark.evidence.samples).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "page", background: "rgb(16, 24, 40)", fontFamily: '"Custom Sans", sans-serif' }),
      expect.objectContaining({ role: "dialog", background: "rgb(30, 41, 59)" }),
    ]));
    document.body.innerHTML = "<div></div>";
    const minimal = await collectDesignEvidence();
    expect(minimal.evidence).toMatchObject({ samples: [{ role: "page" }], confidence: { primary: .3 } });
  });
});
