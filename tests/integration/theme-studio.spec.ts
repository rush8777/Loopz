import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:4310";
const host = "http://127.0.0.1:4179";

test("renders real SDK previews, edits a saved theme and preserves a published snapshot", async ({ context, page, request }) => {
  const email = `theme-studio-${Date.now()}@example.test`;
  const password = "correct-horse-battery-staple";
  const account = await (await request.post(`${api}/auth/signup`, { data: { email, password } })).json();
  const headers = { authorization: `Bearer ${account.accessToken}` };
  const setup = await (await request.post(`${api}/auth/onboarding`, { headers, data: { workspaceName: "Theme studio QA", siteName: "Theme site", domain: host } })).json();
  const base = `${api}/orgs/${setup.organization.id}/sites/${setup.site.id}`;
  await request.post(`${api}/auth/onboarding/skip`, { headers });

  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await page.goto("/settings/themes");
  await expect(page).toHaveURL(/\/experiences\/themes$/);
  await expect(page.getByRole("heading", { name: "Themes", exact: true })).toBeVisible();
  const modal = page.frameLocator('iframe[title="Modal runtime preview"]');
  const modalButton = modal.getByRole("button", { name: "Show me around" });
  const otherFormats = ["Anchored card", "Guide tooltip", "Survey", "Checklist", "Banner", "Slideout", "Toast", "Hotspot", "Cursor follower"];
  await expect(modalButton).toBeVisible();
  for (const format of otherFormats) {
    await expect(page.frameLocator(`iframe[title="${format} runtime preview"]`).locator(".movcues-widget").first()).toBeVisible();
  }
  await page.getByRole("button", { name: "New theme", exact: true }).click();
  await page.getByLabel("Theme name").fill("Ocean");
  await page.getByLabel("primary color value", { exact: true }).fill("#007788");
  await expect(modalButton).toHaveCSS("background-color", "rgb(0, 119, 136)");
  await page.getByRole("button", { name: "Save theme", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Theme saved" })).toBeVisible();
  await page.getByRole("button", { name: "Activate as default" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Site default activated" })).toBeVisible();

  const created = await request.post(`${base}/experiences`, { headers, data: { kind: "widget", widgetType: "modal", builderMode: "onsite", name: "Published snapshot", buildUrl: `${host}/tests/integration/host.html?site=${setup.site.siteId}` } });
  expect(created.status(), await created.text()).toBe(201);
  const draft = await created.json();
  expect(draft.draftVersion.definition.design.theme.primary).toBe("#007788");
  const published = await request.post(`${base}/experiences/${draft.id}/publish`, { headers, data: { draftVersionId: draft.draftVersion.id, revision: draft.draftVersion.revision } });
  expect(published.status(), await published.text()).toBe(200);
  await page.goto(`/experiences/${draft.id}/edit`);
  await page.getByRole("button", { name: "Editor options" }).click();
  await page.getByRole("menuitem", { name: "Save as template" }).click();
  await page.getByLabel("Template name").fill("Ocean layout");
  await page.getByRole("button", { name: "Save template", exact: true }).click();
  await expect(page.getByText("Template saved to this site's library.")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const session = await request.post(`${base}/experiences/${draft.id}/editor-sessions`, { headers });
  expect(session.status(), await session.text()).toBe(201);
  const editor = await context.newPage();
  await editor.goto((await session.json()).launchUrl);
  const appearance = editor.getByRole("region", { name: "Appearance" });
  await expect(appearance.getByLabel("Theme", { exact: true })).toHaveValue("site");
  await expect(appearance.getByRole("link", { name: "Manage themes" })).toHaveAttribute("href", /\/experiences\/themes$/);
  await appearance.getByLabel("Template").selectOption({ label: "Ocean layout" });
  await appearance.getByRole("button", { name: "Apply layout" }).click();
  await expect(appearance.getByRole("status").filter({ hasText: "Layout applied" })).toBeVisible();
  await expect(editor.locator("[data-movcues-experience]").getByRole("heading", { name: "A helpful message" })).toBeVisible();
  await appearance.getByLabel("Theme", { exact: true }).selectOption({ label: "Dark" });
  await expect(editor.locator("[data-movcues-experience]").getByRole("button", { name: "Got it" })).toHaveCSS("background-color", "rgb(129, 140, 248)");
  await editor.getByRole("button", { name: "Undo", exact: true }).first().click();
  await expect(appearance.getByLabel("Theme", { exact: true })).toHaveValue("site");
  await editor.close();
  await page.goto("/experiences/themes");
  await page.getByLabel("Preview theme").selectOption({ label: "Ocean" });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete saved theme" }).click();
  await page.getByRole("button", { name: "Clear default" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Site default cleared" })).toBeVisible();
  const persisted = await (await request.get(`${base}/experiences/${draft.id}`, { headers })).json();
  expect(persisted.publishedVersion.definition.design.theme.primary).toBe("#007788");
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(modalButton).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
