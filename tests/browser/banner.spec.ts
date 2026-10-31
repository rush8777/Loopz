import { expect, test } from "@playwright/test";

type BannerOptions = { mode?: "inline" | "overlay"; position?: "top" | "bottom"; builder?: boolean };

async function renderBanner(page: import("@playwright/test").Page, options: BannerOptions = {}) {
  return page.evaluate(({ mode, position, builder }) => {
    const Renderer = (window as unknown as { fixture: { ExperienceRenderer: new () => { render(experience: unknown, callbacks: unknown): boolean; destroy(): void } } }).fixture.ExperienceRenderer;
    const nav = document.querySelector("nav")!; const beforeTop = nav.getBoundingClientRect().top;
    const experience = {
      id: "browser_banner", versionId: "v1", kind: "widget", widgetType: "banner", priority: 1,
      definition: {
        content: { heading: "LaunchPad", body: "A faster way to work.", primaryAction: { label: "Got it", type: "dismiss" } },
        design: { width: "md", theme: { background: "#fff", foreground: "#111", primary: "#2563eb", borderRadius: "md" } },
        behavior: { dismissible: true, bannerPosition: position ?? "top", ...(mode ? { bannerDisplayMode: mode } : {}) },
        ...(builder === false ? {} : { builder: { version: 1, projectData: {}, html: '<section class="movcues-widget movcues-widget--banner"><div>LaunchPad</div><button data-movcues-action-id="primary">Got it</button></section>', css: '.movcues-widget{box-sizing:border-box;display:flex;align-items:center;width:100%;padding:14px 22px;background:#dbeafe;border:1px solid #93c5fd}' } }),
      },
    };
    const renderer = new Renderer(); renderer.render(experience, { onVisible() {}, onDismiss() {}, onAction() {}, onComplete() {} });
    (window as unknown as { bannerRenderer?: { destroy(): void } }).bannerRenderer = renderer;
    const host = document.querySelector<HTMLElement>('[data-movcues-experience="browser_banner"]')!; const root = host.shadowRoot!; const card = root.querySelector<HTMLElement>(".banner")!; const content = root.querySelector<HTMLElement>(".builder-content"); const widget = root.querySelector<HTMLElement>(".movcues-widget");
    const rect = (element: Element | null) => element ? element.getBoundingClientRect().toJSON() : null;
    return { beforeTop, afterTop: nav.getBoundingClientRect().top, innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, parent: host.parentElement?.tagName, mount: host.dataset.movcuesBannerMount, host: rect(host), card: rect(card), content: rect(content), widget: rect(widget), cardPosition: getComputedStyle(card).position, displayMode: card.dataset.displayMode };
  }, options);
}

test.beforeEach(async ({ page }) => { await page.goto("/tests/browser/fixture.html"); });

test("inline top banner displaces content, fills the layout viewport, and restores layout on dismissal", async ({ page }) => {
  const result = await renderBanner(page, { mode: "inline" });
  expect(result.parent).toBe("BODY"); expect(result.mount).toBe("body"); expect(result.cardPosition).toBe("relative"); expect(result.displayMode).toBe("inline");
  expect(result.afterTop - result.beforeTop).toBeCloseTo(result.card!.height, 1);
  for (const box of [result.host, result.card, result.content, result.widget]) { expect(box!.x).toBeCloseTo(0, 1); expect(box!.right).toBeCloseTo(result.clientWidth, 1); }
  expect(result.scrollWidth).toBe(result.clientWidth);
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-movcues-experience="browser_banner"]')!.shadowRoot!.querySelector<HTMLElement>(".movcues-runtime-chrome")!.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click());
  await expect(page.locator('[data-movcues-experience="browser_banner"]')).toHaveCount(0); expect(await page.locator("nav").evaluate(element => element.getBoundingClientRect().top)).toBeCloseTo(result.beforeTop, 1);
});

test("banner width stays gap-free across desktop, tablet, and mobile viewports", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); const result = await renderBanner(page, { mode: "inline" });
    expect(result.card!.right).toBeCloseTo(result.clientWidth, 1); expect(result.widget!.right).toBeCloseTo(result.clientWidth, 1); expect(result.scrollWidth).toBe(result.clientWidth);
    await page.evaluate(() => (window as unknown as { bannerRenderer: { destroy(): void } }).bannerRenderer.destroy());
  }
});

test("row-flex and grid bodies use the document flow lane", async ({ page }) => {
  for (const display of ["flex", "grid"] as const) {
    await page.evaluate(value => { document.body.style.display = value; if (value === "flex") document.body.style.flexDirection = "row"; }, display);
    const result = await renderBanner(page, { mode: "inline" });
    expect(result.parent).toBe("HTML"); expect(result.mount).toBe("document"); expect(result.afterTop - result.beforeTop).toBeCloseTo(result.card!.height, 1); expect(result.scrollWidth).toBe(result.clientWidth);
    await page.evaluate(() => { (window as unknown as { bannerRenderer: { destroy(): void } }).bannerRenderer.destroy(); document.body.removeAttribute("style"); });
  }
});

test("mode-less and explicit overlay banners retain viewport positioning", async ({ page }) => {
  for (const mode of [undefined, "overlay"] as const) {
    const result = await renderBanner(page, { mode, position: "bottom" });
    expect(result.parent).toBe("HTML"); expect(result.mount).toBeUndefined(); expect(result.cardPosition).toBe("fixed"); expect(result.displayMode).toBe("overlay"); expect(result.afterTop).toBeCloseTo(result.beforeTop, 1); expect(result.widget!.right).toBeCloseTo(result.clientWidth, 1);
    await page.evaluate(() => (window as unknown as { bannerRenderer: { destroy(): void } }).bannerRenderer.destroy());
  }
});
