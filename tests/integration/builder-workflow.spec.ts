import { test, expect, type Page } from "@playwright/test";
const api = "http://127.0.0.1:4310";
const host = "http://127.0.0.1:4179";
const widget = (page: Page) => page.locator("[data-movcues-experience]");
async function rename(page: Page, text: string) {
  await expect(page.locator("[data-movcues-composition-toolbar]")).toHaveCount(
    1,
  );
  const heading = widget(page).locator("h2");
  await heading.dblclick();
  await expect(heading).toHaveAttribute("contenteditable", "true");
  await heading.press("ControlOrMeta+a");
  await heading.pressSequentially(text);
  await expect(heading).toHaveText(text);
  await page.locator("[data-select-step]").click();
}
async function saved(page: Page) {
  await expect(page.locator("[data-save-state]")).toHaveText("Draft saved");
}

test("real dashboard → SDK editor → database → reviewed publish → visitor Guide", async ({
  page,
  context,
  request,
  browser,
}) => {
  test.setTimeout(120_000);
  const email = `builder-${Date.now()}@example.test`,
    password = "correct-horse-battery-staple";
  const account = await (
    await request.post(`${api}/auth/signup`, { data: { email, password } })
  ).json();
  const headers = { authorization: `Bearer ${account.accessToken}` };
  const setupResponse = await request.post(`${api}/auth/onboarding`, {
    headers,
    data: {
      workspaceName: "Isolated builder QA",
      siteName: "React test host",
      domain: host,
    },
  });
  expect(setupResponse.status()).toBe(201);
  const setup = await setupResponse.json();
  await request.post(`${api}/auth/onboarding/skip`, { headers });
  const endpoint = `${api}/orgs/${setup.organization.id}/sites/${setup.site.id}/experiences`;
  const hostUrl = `${host}/tests/integration/host.html?site=${setup.site.siteId}`;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await page.goto("/experiences/guides");
  await page
    .getByRole("button", { name: "Create guide", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Name", { exact: true })
    .fill("Pre-survey verified Guide");
  await dialog.getByRole("button", { name: /On-site Visual Builder/ }).click();
  await dialog.getByLabel("First step").selectOption("modal");
  await dialog.getByLabel("Page URL").fill(hostUrl);
  const popupPromise = context.waitForEvent("page");
  await dialog
    .getByRole("button", { name: "Create & open on site", exact: true })
    .click();
  const editor = await popupPromise;
  await editor.waitForLoadState("domcontentloaded");
  await expect(editor.locator("[data-editor-toolbar]")).toBeVisible();
  await expect(editor).not.toHaveURL(/movcues_editor_token/);
  const id = page.url().match(/experiences\/([^/]+)\/edit/)![1];
  await rename(editor, "Welcome to projects");
  // Real nested authoring and independent action configuration, through the existing controls.
  await widget(editor).locator("h2").click();
  await editor.locator("[data-command=columns]").click();
  await editor.locator("[data-movcues-empty-cell]").click();
  await editor.locator("[data-insert-block=icon]").click();
  await widget(editor).locator(".movcues-button").click();
  await editor.locator("[data-button-label]").fill("Get Started");
  await editor.locator("[data-button-label]").press("Tab");
  await editor.locator("[data-button-action]").selectOption("next_step");
  await editor.locator("[data-select-step]").click();
  await editor.locator("[data-add-step=anchored_card]").click();
  // New anchored steps use the existing website picker.
  await editor.locator("[data-mode=target]").click();
  await expect(editor.locator("#feature-card")).toBeVisible();
  await editor.locator("#feature-card").click();
  await editor.locator("[data-mode=design]").click();
  await expect(widget(editor)).toBeVisible();
  await rename(editor, "Create a project");
  await editor.locator("[data-guide-trigger]").selectOption("element_click");
  await editor.locator("[data-guide-pick-interaction]").click();
  await editor.locator("#use-feature").click();
  await editor.locator("[data-guide-delay]").fill("50");
  await editor.locator("[data-guide-delay]").press("Tab");
  await editor.locator("[data-add-step=modal]").click();
  await rename(editor, "Project created");
  await editor.locator("[data-guide-trigger]").selectOption("custom_event");
  await editor.locator("[data-guide-event]").fill("project_created");
  await editor.locator("[data-guide-event]").press("Tab");
  await saved(editor);
  const persisted = await (
    await request.get(`${endpoint}/${id}`, { headers })
  ).json();
  const definition = persisted.draftVersion.definition;
  expect(definition.steps).toHaveLength(3);
  expect(definition.steps.map((step: any) => step.content.heading)).toEqual([
    "Welcome to projects",
    "Create a project",
    "Project created",
  ]);
  expect(definition.steps[1].advance.target.primarySelector).not.toBe(
    definition.steps[1].target.primarySelector,
  );
  expect(definition.steps[1].presentation.delayMs).toBe(50);
  expect(definition.steps[2].advance).toEqual({
    type: "custom_event",
    eventName: "project_created",
  });
  const before = await (
    await request.get(`${api}/__test__/analytics/${id}`)
  ).json();
  expect(before.impressions).toHaveLength(0);
  await editor.reload();
  await expect(editor.locator("[data-step]")).toHaveCount(3);
  await editor.locator("[data-mode=preview]").click();
  await editor.locator("[data-preview-start]").click();
  await expect(widget(editor).locator("h2")).toHaveText("Welcome to projects");
  await widget(editor)
    .getByRole("button", { name: "Get Started", exact: true })
    .click();
  await expect(widget(editor).locator("h2")).toHaveText("Create a project");
  await editor.locator("#use-feature").click();
  await expect(widget(editor).locator("h2")).toHaveText("Project created");
  await editor.locator("[data-preview-test]").click();
  await expect(editor.locator("[data-preview-step]")).toContainText("Complete");
  const after = await (
    await request.get(`${api}/__test__/analytics/${id}`)
  ).json();
  expect(after).toEqual(before);
  await expect(editor.locator("[data-preview-limit]")).toContainText(
    "site's JavaScript",
  );
  await editor.locator("[data-mode=design]").click();
  await editor.locator("[data-close]").click();
  // Reload the actual dashboard so review uses the backend's saved revision.
  await page.reload();
  await page
    .getByRole("button", { name: "Review & publish", exact: true })
    .click();
  for (let index = 0; index < 5; index++)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review and publish" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /I intend to show/ }).check();
  await page.getByRole("button", { name: "Publish now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Published", exact: true }),
  ).toBeVisible();
  const published = await (
    await request.get(`${endpoint}/${id}`, { headers })
  ).json();
  expect(published.publishedVersion.definition.steps).toEqual(definition.steps);
  // A separate visitor context runs the built SDK; no delivery/editor routes are mocked.
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(hostUrl);
  await expect(widget(visitor).locator("h2")).toHaveText("Welcome to projects");
  await widget(visitor)
    .getByRole("button", { name: "Get Started", exact: true })
    .click();
  await expect(widget(visitor).locator("h2")).toHaveText("Create a project");
  await visitor.locator("#use-feature").click();
  await expect(visitor).toHaveURL(/\/integration\/done$/);
  await expect(widget(visitor).locator("h2")).toHaveText("Project created");
  await visitor.goBack();
  await expect(widget(visitor).locator("h2")).toHaveText("Project created");
  await visitor.goForward();
  await visitor.reload();
  await expect(widget(visitor).locator("h2")).toHaveText("Project created");
  // The runtime accepts events after its visibility callback on the first painted frame.
  await visitor.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await visitor.evaluate(() => {
    (window as any).analytics.event("project_created");
    (window as any).analytics.event("project_created");
  });
  await expect(widget(visitor)).toHaveCount(0);
  await expect
    .poll(async () => {
      const state = await (
        await request.get(`${api}/__test__/analytics/${id}`)
      ).json();
      return state.events.filter(
        (event: any) => event.eventType === "guide_completed",
      ).length;
    })
    .toBe(1);
  const analytics = await (
    await request.get(`${api}/__test__/analytics/${id}`)
  ).json();
  expect(analytics.impressions).toHaveLength(1);
  expect(
    analytics.events.filter(
      (event: any) => event.eventType === "guide_step_shown",
    ),
  ).toHaveLength(3);
  expect(
    analytics.events.filter(
      (event: any) => event.eventType === "guide_step_completed",
    ),
  ).toHaveLength(3);
  await visitorContext.close();
  // Real stale-revision rejection and editor-session expiration, without replacing production HTTP.
  const session = await (
    await request.post(`${endpoint}/${id}/editor-sessions`, { headers })
  ).json();
  const editUrl = new URL(session.launchUrl);
  const token = editUrl.searchParams.get("movcues_editor_token");
  const accessResponse = await request.post(
    `${api}/public/experience-editor/exchange`,
    { headers: { origin: host }, data: { token } },
  );
  expect(accessResponse.status()).toBe(200);
  const access = await accessResponse.json();
  const editorHeaders = {
    origin: host,
    authorization: `Bearer ${access.accessToken}`,
  };
  const draftUrl = `${api}/public/experience-editor/${session.sessionId}/draft`;
  const draft = (
    await (await request.get(draftUrl, { headers: editorHeaders })).json()
  ).version;
  const changed = structuredClone(draft.definition);
  changed.steps[0].label = "New draft only";
  expect(
    (
      await request.patch(draftUrl, {
        headers: editorHeaders,
        data: { definition: changed, revision: draft.revision },
      })
    ).status(),
  ).toBe(200);
  const stale = await request.patch(draftUrl, {
    headers: editorHeaders,
    data: { definition: draft.definition, revision: draft.revision },
  });
  expect(stale.status()).toBe(409);
  const bad = structuredClone(draft.definition);
  bad.steps[0].presentation = { delayMs: 30001 };
  expect(
    (
      await request.patch(draftUrl, {
        headers: editorHeaders,
        data: { definition: bad, revision: draft.revision },
      })
    ).status(),
  ).toBe(400);
  await request.post(`${api}/__test__/expire/${id}`);
  expect(
    (await request.get(draftUrl, { headers: editorHeaders })).status(),
  ).toBe(401);
});
