import { openDockPopup } from "./openDockPopup";
import { expect, type Page } from "@playwright/test";

export async function selectStepProperties(page: Page): Promise<void> {
  await openDockPopup(page, "settings");
  const properties = page.locator('[data-inspector="step"]');
  const parent = page.getByRole("button", { name: "Select parent", exact: true });
  for (let remaining = 8; remaining > 0 && !(await properties.isVisible()); remaining--) {
    await parent.click();
  }
  await expect(properties).toBeVisible();
}
