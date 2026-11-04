import { expect, test } from "@playwright/test";

test("live editor streams preparation, repair, disclosure, and final proposal controls", async ({ page }, testInfo) => {
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
  await expect(disclosure).toContainText("Checking layout and button actions.");
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
