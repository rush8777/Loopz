import { expect, test } from "@playwright/test";

test("live editor streams preparation, repair, current-step details, and final proposal controls", async ({ page }, testInfo) => {
  await page.goto("/tests/browser/ai-progress.html");
  const editor = page.locator("[data-movcues-editor]");
  await editor.locator('[data-inspector-tab="ai"]').click();
  await editor.locator("[data-ai-prompt]").fill("Make the welcome heading clearer");
  await editor.locator("[data-ai-send]").click();
  await expect(editor.locator("[data-ai-progress-current]")).toHaveText("Creating your change.");
  await expect(editor.locator("[data-ai-send]")).toBeDisabled();
  await expect(editor.locator("[data-ai-cancel]")).toBeVisible();
  await testInfo.attach("creating", { body: await page.screenshot(), contentType: "image/png" });

  await page.getByRole("button", { name: "Trigger repair" }).click();
  await expect(editor.locator("[data-ai-progress-current]")).toHaveText("Adjusting the change after checks.");
  const disclosure = editor.locator("[data-ai-progress] details"); await disclosure.locator("summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(editor.locator("[data-ai-progress-current]")).toHaveCount(1);
  await expect(disclosure).not.toContainText("Checking layout and button actions.");
  await expect(disclosure).toContainText("Adjusting the proposal so it passes the editor checks.");
  await testInfo.attach("repair", { body: await page.screenshot(), contentType: "image/png" });

  await page.getByRole("button", { name: "Finish response" }).click();
  await expect(editor.locator("[data-ai-progress-current]")).toHaveText("Proposal ready.");
  await expect(disclosure).not.toHaveAttribute("open", "");
  await expect(editor.locator("[data-ai-apply]")).toBeEnabled();
  await expect(editor.locator("[data-ai-discard]")).toBeEnabled();
  await testInfo.attach("ready", { body: await page.screenshot(), contentType: "image/png" });
});

test("cancel keeps the conversation usable and suppresses a late streamed result", async ({ page }) => {
  await page.goto("/tests/browser/ai-progress.html"); const editor = page.locator("[data-movcues-editor]");
  await editor.locator('[data-inspector-tab="ai"]').click(); await editor.locator("[data-ai-prompt]").fill("Try another change"); await editor.locator("[data-ai-send]").click();
  await expect(editor.locator("[data-ai-progress-current]")).toHaveText("Creating your change."); await editor.locator("[data-ai-cancel]").click();
  await expect(editor.locator("[data-ai-progress-current]")).toHaveText("Request canceled."); await page.getByRole("button", { name: "Finish response" }).click();
  await expect(editor.locator("[data-ai-history]")).not.toContainText("The updated design is ready to review."); await expect(editor.locator("[data-ai-send]")).toBeEnabled(); await expect(editor.locator("[data-ai-proposal]")).toBeHidden();
});

test("a streamed timeout leaves the composer usable", async ({ page }) => {
  await page.goto("/tests/browser/ai-progress.html"); const editor = page.locator("[data-movcues-editor]"); await editor.locator('[data-inspector-tab="ai"]').click();
  await editor.locator("[data-ai-prompt]").fill("A deliberately slow request"); await editor.locator("[data-ai-send]").click(); await page.getByRole("button", { name: "Trigger timeout" }).click();
  await expect(editor.locator("[data-ai-progress-current]")).toHaveText("Request stopped."); await expect(editor.locator("[data-ai-history]")).toContainText("The AI request reached its total deadline."); await expect(editor.locator("[data-ai-send]")).toBeEnabled();
});

test("icon navigation is accessible and the single-step progress card fits a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tests/browser/ai-progress.html");
  const editor = page.locator("[data-movcues-editor]");
  const nav = editor.getByRole("navigation", { name: "Inspector mode" });
  await nav.getByRole("button", { name: "Theme", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Theme", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(editor.locator("[data-theme-primary]")).toBeVisible();
  await nav.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Properties", exact: true })).toHaveAttribute("aria-pressed", "true");
  await nav.getByRole("button", { name: "AI assistant", exact: true }).click();
  await editor.getByRole("textbox", { name: "Describe your design change" }).fill("Refine this welcome");
  await editor.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("button", { name: "Trigger repair" }).dispatchEvent("click");
  await editor.locator("[data-ai-progress] summary").click();
  await expect(editor.locator("[data-ai-progress-current]")).toHaveCount(1);
  await expect(editor.locator("[data-ai-progress-detail]")).toContainText("Adjusting the proposal");
  await expect(editor.locator("[data-ai-progress]")).not.toContainText("Creating your change.");
  const send = await editor.locator("[data-ai-send]").boundingBox();
  expect(send!.y + send!.height).toBeLessThanOrEqual(844);
  const aside = await editor.locator("aside").boundingBox();
  expect(aside!.x).toBeGreaterThanOrEqual(0);
  expect(aside!.x + aside!.width).toBeLessThanOrEqual(390);
});
