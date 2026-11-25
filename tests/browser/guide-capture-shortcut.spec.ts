import { expect, test, type Page } from "@playwright/test";

const host = "/tests/browser/capture-surfaces.html";
const mode = (page: Page, name: "select" | "navigate") => page.locator(`[data-mode="${name}"]`);
const selections = (page: Page) => page.locator("[data-targets] [data-remove]");
const checkpoint = (page: Page) => page.evaluate(() => (window as any).fixture.loadCapture());

test.beforeEach(async ({ page }) => {
  await page.goto(host);
  await expect(mode(page, "navigate")).toHaveAttribute("aria-pressed", "true");
});

for (const { trigger, surface, options, shortcut, topLayer } of [
  { trigger: "#custom-trigger", surface: "#custom-menu", options: ["#custom-one", "#custom-two"], shortcut: "Shift+F8" },
  { trigger: "#menu-trigger", surface: "#radix-menu", options: ["#menu-one", "#menu-two"] },
  { trigger: "#menu-trigger", surface: "#submenu", options: ["#sub-one", "#sub-two"] },
  { trigger: "#select-trigger", surface: "#radix-select", options: ["#select-one", "#select-two"] },
  { trigger: "#popover-trigger", surface: "#web-popover", options: ["#pop-one", "#pop-two"], shortcut: "Shift+F8", topLayer: true },
  { trigger: "#dialog-trigger", surface: "#dialog", options: ["#dialog-one", "#dialog-two"], shortcut: "Shift+F8" },
]) {
  test(`captures two elements in ${surface} without a focus or website action`, async ({ page }) => {
    await page.locator(trigger).click();
    if (surface === "#submenu") {
      await page.locator("#submenu-trigger").press("ArrowRight");
    }
    const popup = page.locator(surface);
    await expect(popup).toBeVisible();
    const clicksBeforeSelection = await page.evaluate(() =>
      (window as any).fixture.localCapture().observations?.filter((item: { type: string }) => item.type === "click") ?? []);
    const focused = await page.evaluateHandle(() => document.activeElement);
    const sameFocus = () => page.evaluate(element => element === document.activeElement, focused);
    const key = shortcut ?? "Shift+Tab";
    await page.keyboard.press(key);
    await expect(mode(page, "select")).toHaveAttribute("aria-pressed", "true");
    expect(await sameFocus()).toBe(true);

    for (const option of options) {
      const target = page.locator(option);
      await target.hover();
      if (!topLayer) await expect(page.locator("[data-movcues-picker-overlay][style*='display: block']")).toBeVisible();
      await target.click();
      await expect(popup).toBeVisible();
      expect(await sameFocus()).toBe(true);
      await expect(page.locator("#actions")).toHaveText("0");
    }
    await expect(selections(page)).toHaveCount(2);
    await expect(page.locator("[data-movcues-capture-marker]")).toHaveText(["1", "2"]);
    await expect.poll(async () =>
      (await checkpoint(page)).observations?.filter((item: { type: string }) => item.type === "target").length).toBe(2);
    const saved = await checkpoint(page);
    expect(saved.observations.filter((item: { type: string }) => item.type === "click")).toEqual(clicksBeforeSelection);
    await page.keyboard.press(key);
    await expect(mode(page, "navigate")).toHaveAttribute("aria-pressed", "true");
    expect(await sameFocus()).toBe(true);
    await page.locator(options[0]).click();
    await expect(page.locator("#actions")).toHaveText("1");
    await expect(selections(page)).toHaveCount(2);
    await focused.dispose();
  });
}

test("switches capture mode with the panel while a host dropdown keeps focus", async ({ page }) => {
  const trigger = page.locator("#custom-trigger");
  const popup = page.locator("#custom-menu");
  await trigger.click();
  await mode(page, "select").click();
  await expect(mode(page, "select")).toHaveAttribute("aria-pressed", "true");
  await expect(trigger).toBeFocused();
  await expect(popup).toBeVisible();
  await page.locator("#custom-one").click();
  await expect(selections(page)).toHaveCount(1);
  await mode(page, "navigate").click();
  await expect(mode(page, "navigate")).toHaveAttribute("aria-pressed", "true");
  await expect(trigger).toBeFocused();
  await expect(popup).toBeVisible();
  await page.locator("#custom-one").click();
  await expect(page.locator("#actions")).toHaveText("1");
});

test("keeps focus navigation, typing and modifier chords available in selection", async ({ page }) => {
  await mode(page, "select").click();
  const field = page.locator("#host-input");
  await field.focus();
  await page.keyboard.type("input text");
  await page.keyboard.press("Space");
  await expect(field).toHaveValue("input text ");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#before-input")).toBeFocused();
  const editable = page.locator("#editable");
  await editable.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("New text");
  await expect(editable).toContainText("New text");
  await page.keyboard.press("Shift+Tab");
  await expect(field).toBeFocused();
  await page.keyboard.press("Shift+F8");
  await expect(mode(page, "navigate")).toHaveAttribute("aria-pressed", "true");
  await expect(field).toBeFocused();
  await page.keyboard.press("Shift+F8");
  await page.locator("[data-prompt]").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(mode(page, "navigate")).toBeFocused();
  await expect(mode(page, "select")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#native-select").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(editable).toBeFocused();
  await page.locator("#before-input").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#dialog-trigger")).toBeFocused();
  await expect(mode(page, "select")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Alt+Shift+Tab");
  await expect(mode(page, "select")).toHaveAttribute("aria-pressed", "true");
  await mode(page, "navigate").click();
  await expect(mode(page, "navigate")).toHaveAttribute("aria-pressed", "true");
});

test("retains mode on blur and reload and releases interception on expiry and close", async ({ page, context }) => {
  await page.keyboard.down("Shift");
  await page.keyboard.down("F8");
  await page.keyboard.down("F8");
  await page.keyboard.up("F8");
  await page.keyboard.up("Shift");
  await expect(mode(page, "select")).toHaveAttribute("aria-pressed", "true");
  const otherTab = await context.newPage();
  await otherTab.bringToFront();
  await page.bringToFront();
  await otherTab.close();
  await expect(mode(page, "select")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(mode(page, "select")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+F8");
  await page.locator("#next-page").click();
  await expect(page).toHaveURL(/\?page=next#\/next$/);
  await expect(mode(page, "navigate")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+F8");
  await page.evaluate(() => (window as any).fixture.expire());
  await page.locator("#custom-trigger").click();
  await expect(page.locator("#custom-menu")).toBeVisible();
  await page.locator("#before-input").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#dialog-trigger")).toBeFocused();
  await page.evaluate(() => (window as any).fixture.destroy());
  await expect(page.locator("[data-movcues-guide-capture], [data-movcues-picker-overlay]")).toHaveCount(0);
});
