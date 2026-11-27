import { expect, test, type Page } from "@playwright/test";

const dock = (page: Page) => page.locator("[data-editor-dock]");
const popup = (page: Page, name: string) => dock(page).locator(`[data-dock-popup="${name}"]`);

async function evidence(page: Page, name: string): Promise<void> {
  if (process.env.MOVCUES_DOCK_EVIDENCE) {
    await page.screenshot({ path: `${process.env.MOVCUES_DOCK_EVIDENCE}/after-${name}.png`, animations: "disabled" });
  }
}

test("capture uses one dock and recovers manual selections after reload", async ({ page }) => {
  await page.goto("/tests/browser/capture-surfaces.html");
  await expect(dock(page)).toHaveCount(1);
  await expect(dock(page).locator("[data-mode=navigate]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-movcues-editor] aside,[data-editor-toolbar]")).toHaveCount(0);
  await evidence(page, "capture-ready");
  await page.locator("#custom-trigger").click();
  await dock(page).locator("[data-mode=select]").click();
  await expect(page.locator("#custom-trigger")).toBeFocused();
  await page.locator("#custom-one").click();
  await page.locator("#custom-two").click();
  await expect(dock(page).locator("[data-capture-count]")).toHaveText("2 elements");
  await expect(page.locator("#actions")).toHaveText("0");
  await page.reload();
  await expect(dock(page).locator("[data-capture-count]")).toHaveText("2 elements");
  await dock(page).getByRole("button", { name: "Captured elements", exact: true }).click();
  await expect(popup(page, "targets").getByRole("listitem")).toHaveCount(2);
  await evidence(page, "captured-elements");
  await popup(page, "targets").getByRole("button", { name: "Remove element 1" }).click();
  await expect(dock(page).locator("[data-capture-count]")).toHaveText("1 element");
  await dock(page).getByRole("button", { name: "Generate guide", exact: true }).click();
  await expect(popup(page, "targets")).toHaveAttribute("inert", "");
  await expect(dock(page).locator("[data-dock-popup][data-open]")).toHaveCount(1);
  await popup(page, "generate").getByRole("textbox").fill("Help customers find the workspace menu.");
  await evidence(page, "capture-prompt");
  await page.keyboard.press("Escape");
  await expect(dock(page).getByRole("button", { name: "Generate guide", exact: true })).toBeFocused();
  await dock(page).getByRole("button", { name: "Undo last selection" }).click();
  await expect(dock(page).locator("[data-capture-count]")).toHaveText("0 elements");
  await dock(page).locator("[data-mode=navigate]").click();
  await page.locator("#custom-trigger").click();
  await dock(page).locator("[data-mode=select]").click();
  await page.locator("#custom-one").click();
  await dock(page).getByRole("button", { name: "Captured elements", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await popup(page, "targets").getByRole("button", { name: "Restart capture" }).click();
  await expect(dock(page).locator("[data-capture-count]")).toHaveText("0 elements");
  await expect(dock(page).locator("[data-mode=navigate]")).toHaveAttribute("aria-pressed", "true");
  page.once("dialog", dialog => dialog.accept());
  await popup(page, "targets").getByRole("button", { name: "Discard and close" }).click();
  await expect(dock(page)).toHaveCount(0);
  await expect(page.locator("[data-movcues-picker-overlay],[data-movcues-capture-marker]")).toHaveCount(0);
});

test("editor morphs between states and Geo retains its conversation and prompt", async ({ page }) => {
  await page.goto("/tests/browser/ai-progress.html");
  await expect(dock(page)).toBeVisible();
  await expect(dock(page).locator("[data-dock-popup][data-open]")).toHaveCount(0);
  const identity = await dock(page).elementHandle();
  await evidence(page, "editor");
  await dock(page).getByRole("button", { name: "AI assistant" }).click();
  const geo = popup(page, "geo");
  await expect(geo).toBeVisible();
  await evidence(page, "geo");
  const prompt = geo.getByRole("textbox");
  await prompt.fill("Make the welcome heading clearer");
  await geo.getByRole("button", { name: "Send message" }).click();
  await expect(geo.locator("[data-ai-progress-current]")).toHaveText("Creating your change.");
  await evidence(page, "geo-streaming");
  await geo.getByRole("button", { name: "Close Geo" }).click();
  await page.getByRole("button", { name: "Finish response" }).click();
  await dock(page).getByRole("button", { name: "AI assistant" }).click();
  await expect(geo.getByText("Make the welcome heading clearer")).toBeVisible();
  await expect(geo.getByRole("button", { name: "Apply", exact: true })).toBeEnabled();
  await evidence(page, "geo-proposal");
  await prompt.fill("Keep this draft prompt");
  await dock(page).getByRole("button", { name: "Properties", exact: true }).click();
  await expect(geo).toHaveAttribute("inert", "");
  await expect(popup(page, "settings").getByLabel("Theme", { exact: true })).toBeVisible();
  await evidence(page, "settings");
  await dock(page).getByRole("button", { name: "AI assistant" }).click();
  await expect(prompt).toHaveValue("Keep this draft prompt");
  await geo.getByRole("button", { name: "Discard", exact: true }).click();
  await dock(page).getByRole("button", { name: "Preview", exact: true }).click();
  await expect(dock(page).getByRole("button", { name: "Edit", exact: true })).toBeHidden();
  await expect(dock(page).getByRole("button", { name: "Exit preview" })).toBeVisible();
  await expect(dock(page).getByRole("button", { name: "Save draft" })).toBeVisible();
  await evidence(page, "preview");
  await dock(page).getByRole("button", { name: "Exit preview" }).click();
  expect(await dock(page).evaluate((node, original) => node === original, identity)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 400 });
  await dock(page).getByRole("button", { name: "AI assistant" }).click();
  await expect(geo).toBeInViewport({ ratio: 1 });
  await expect(dock(page)).toBeInViewport({ ratio: 1 });
  expect(await dock(page).evaluate(node => getComputedStyle(node).animationName)).toBe("none");
  await evidence(page, "mobile-geo");
  await dock(page).getByRole("button", { name: "Close editor" }).click();
  await expect(dock(page)).toHaveCount(0);
  await expect(page.locator("[data-movcues-experience],[data-movcues-picker-overlay]")).toHaveCount(0);
});
