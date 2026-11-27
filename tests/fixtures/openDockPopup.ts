import { expect, type Page } from "@playwright/test";

export async function openDockPopup(page: Page, name: string): Promise<void> {
  const popup = page.locator(`[data-dock-popup="${name}"]`);
  if (await popup.getAttribute("aria-hidden") === "false") return;
  await page.locator(`[data-open-popup="${name}"]:visible`).first().click();
  await expect(popup).toHaveAttribute("aria-hidden", "false");
}

export async function closeDockPopup(page: Page): Promise<void> {
  const popup = page.locator("[data-dock-popup][data-open]");
  if (await popup.count()) await popup.locator("[data-dismiss-popup]").click();
}
