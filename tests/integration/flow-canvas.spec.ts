import { expect, test, type Page } from "@playwright/test";
import type { GuideStep } from "../../src/experiences/types";

const api = "http://127.0.0.1:4310";
const host = "http://127.0.0.1:4179";
const canvas = (page: Page) => page.getByRole("region", { name: "Experience flow canvas" });
const cards = (page: Page) => canvas(page).locator(".flow-card");
const settingsForStep = ({ id, label, advance, presentation, behavior }: GuideStep) => ({ id, label, advance, presentation, behavior });

async function screenshot(page: Page, name: string) {
  if (process.env.MOVCUES_FLOW_EVIDENCE)
    await page.screenshot({ path: `${process.env.MOVCUES_FLOW_EVIDENCE}/${name}.png`, animations: "disabled" });
}

test("edits guide progression and survey rules and previews standalone experiences", async ({ page, request }) => {
  const email = `flow-${Date.now()}@example.test`;
  const password = "correct-horse-battery-staple";
  const account = await (await request.post(api + "/auth/signup", { data: { email, password } })).json();
  const headers = { authorization: `Bearer ${account.accessToken}` };
  const { organization, site } = await (await request.post(api + "/auth/onboarding", {
    headers, data: { workspaceName: "Movcues Studio", siteName: "Studio", domain: host },
  })).json();
  await request.post(api + "/auth/onboarding/skip", { headers });
  const endpoint = `${api}/orgs/${organization.id}/sites/${site.id}/experiences`;
  const buildUrl = `${host}/tests/integration/host.html?site=${site.siteId}`;
  const create = async (settings: object) => {
    const response = await request.post(endpoint, { headers, data: { builderMode: "onsite", buildUrl, ...settings } });
    expect(response.status(), await response.text()).toBe(201);
    return response.json();
  };
  const draft = async (id: string) => (await (await request.get(`${endpoint}/${id}`, { headers })).json()).draftVersion;
  const open = async (id: string, count: number) => {
    await page.goto(`/experiences/${id}/edit`);
    await expect(canvas(page)).toBeVisible();
    await expect(cards(page)).toHaveCount(count);
    await expect(canvas(page).locator('.flow-preview[data-rendered="true"]')).toHaveCount(count);
  };

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics$/);

  const guide = await create({ kind: "guide", name: "Product onboarding", template: "guide-product-tour" });
  await open(guide.id, 4);
  await expect(page.frameLocator('iframe[title="Your product tour preview"]').getByRole("heading", { name: "Your product tour" })).toBeVisible();
  await screenshot(page, "02-guide");
  await cards(page).nth(1).click();
  await expect(canvas(page).getByRole("complementary", { name: "Step settings" })).toBeVisible();
  await screenshot(page, "03-selected-step");
  await page.getByLabel("Step name").fill("Find active work");
  await page.getByRole("button", { name: "Apply presentation" }).click();
  const original = guide.draftVersion.definition.steps;
  await expect.poll(async () => (await draft(guide.id)).definition.steps[1].label).toBe("Find active work");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Configure Guide button", exact: true }).nth(1).click();
  await page.getByLabel("Advance when").selectOption("custom_event");
  await page.getByLabel("Event name").fill("project_created");
  await page.getByRole("button", { name: "Apply progression" }).click();
  await expect.poll(async () => (await draft(guide.id)).definition.steps[1].advance).toEqual({ type: "custom_event", eventName: "project_created" });
  await screenshot(page, "04-selected-connection");
  expect((await draft(guide.id)).definition.steps[1]).toMatchObject({ id: original[1].id, builder: original[1].builder });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Insert guide step" }).nth(2).click();
  await canvas(page).getByRole("button", { name: "Add modal step" }).click();
  await expect.poll(async () => (await draft(guide.id)).definition.steps.length).toBe(5);
  const inserted = (await draft(guide.id)).definition.steps[2];
  expect(inserted.builder.html).toContain("Next step");
  await page.getByRole("button", { name: "Duplicate step" }).click();
  await expect.poll(async () => (await draft(guide.id)).definition.steps.length).toBe(6);
  const duplicate = (await draft(guide.id)).definition.steps[3];
  expect(duplicate.id).not.toBe(inserted.id);
  expect(duplicate.content).toEqual(inserted.content);
  expect(duplicate.builder.projectData.movcues.onsiteDocument.id).not.toBe(inserted.builder.projectData.movcues.onsiteDocument.id);
  await page.getByRole("button", { name: "Move step earlier" }).click();
  await expect.poll(async () => (await draft(guide.id)).definition.steps[2].id).toBe(duplicate.id);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Remove step" }).click();
  await expect.poll(async () => (await draft(guide.id)).definition.steps.length).toBe(5);
  const stale = await request.patch(`${endpoint}/${guide.id}`, { headers, data: {
    revision: 1, settings: { targeting: guide.draftVersion.definition.targeting, flow: {
      kind: "guide", steps: original.map(settingsForStep),
    } },
  } });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({ error: "draft_conflict" });
  const delivery = await (await request.get(`${api}/__test__/analytics/${guide.id}`)).json();
  expect(delivery.events).toHaveLength(0);
  expect(delivery.impressions).toHaveLength(0);

  const survey = await create({ kind: "widget", widgetType: "survey", name: "Recommendation survey", template: "survey-nps" });
  await open(survey.id, 2);
  await page.getByRole("button", { name: "Configure Default", exact: true }).first().click();
  await page.getByRole("button", { name: "Add answer rule" }).click();
  await page.getByRole("combobox", { name: "Condition", exact: true }).selectOption("gte");
  await page.getByLabel("Answer", { exact: true }).fill("8");
  await page.getByRole("combobox", { name: "Go to", exact: true }).selectOption("submit");
  await page.getByRole("button", { name: "Apply branching" }).click();
  await expect.poll(async () => (await draft(survey.id)).definition.survey.steps[0].branching?.rules[0]).toMatchObject({
    operator: "gte", value: 8, nextStepId: "submit",
  });
  await page.keyboard.press("Escape");
  const rule = page.getByRole("button", { name: /Configure rule 1:/ });
  await expect(canvas(page).getByRole("complementary")).toHaveCount(0);
  await expect(rule).toBeVisible();
  await expect(page.getByRole("button", { name: "Configure Default", exact: true })).toHaveCount(2);
  await screenshot(page, "05-branching-survey");
  await rule.click();
  await expect(page.getByLabel("Answer", { exact: true })).toHaveValue("8");

  for (const [format, name] of [["modal", "Welcome modal"], ["anchored_card", "Toolbar tooltip"], ["banner", "Release banner"], ["slideout", "Feature announcement"]]) {
    const single = await create({ kind: "widget", widgetType: format, name });
    await open(single.id, 1);
    await expect(canvas(page).locator(".react-flow__edge")).toHaveCount(0);
    await expect(canvas(page).getByRole("button", { name: "Add step", exact: true })).toHaveCount(0);
    await screenshot(page, `06-${format}`);
    await canvas(page).locator('.react-flow__node[data-id="widget"]').focus();
    await page.keyboard.press("Enter");
    await expect(canvas(page).getByRole("button", { name: "Edit on site" })).toBeVisible();
  }

  const checklist = await create({ kind: "checklist", name: "Account setup", template: "checklist-account-setup" });
  await open(checklist.id, 1);
  await expect(canvas(page).locator(".react-flow__edge")).toHaveCount(0);
  await screenshot(page, "07-checklist");
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(canvas(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.setViewportSize({ width: 1440, height: 900 });
  const legacy = await create({ kind: "widget", widgetType: "modal", builderMode: "grapesjs", name: "Custom welcome" });
  const custom = await request.patch(`${endpoint}/${legacy.id}`, { headers, data: {
    revision: legacy.draftVersion.revision,
    definition: {
      ...legacy.draftVersion.definition,
      builder: {
        version: 1, projectData: {},
        html: '<section class="movcues-widget"><h2>Custom markup</h2><p>Rendered from the saved layout.</p></section>',
        css: '.movcues-widget h2 { color: #741118; }',
      },
    },
  } });
  expect(custom.status(), await custom.text()).toBe(200);
  await page.goto(`/experiences/${legacy.id}/edit`);
  await page.getByRole("button", { name: "Flow", exact: true }).click();
  const frame = canvas(page).locator("iframe");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(canvas(page).frameLocator("iframe").getByRole("heading", { name: "Custom markup" })).toHaveCSS("color", "rgb(116, 17, 24)");
  await expect(page.getByRole("heading", { name: "Custom welcome" })).not.toHaveCSS("color", "rgb(116, 17, 24)");
  await expect(cards(page).first()).toHaveCSS("animation-name", "none");

  const long = await create({ kind: "guide", name: "Complete workspace setup", guidePattern: "modal" });
  const baseStep = long.draftVersion.definition.steps[0] as GuideStep;
  const seeds = Array.from({ length: 19 }, (_, index) => ({
    ...baseStep, id: `flow-perf-${index}`, label: `Setup step ${index + 2}`,
  }));
  const savedLong = await request.patch(`${endpoint}/${long.id}`, { headers, data: {
    revision: long.draftVersion.revision,
    settings: {
      targeting: long.draftVersion.definition.targeting,
      flow: { kind: "guide", steps: [settingsForStep(baseStep), ...seeds.map(seed => ({ ...settingsForStep(seed), seed }))] },
    },
  } });
  expect(savedLong.status(), await savedLong.text()).toBe(200);
  const started = Date.now();
  await open(long.id, 20);
  console.info(`20-step guide: ${Date.now() - started} ms to render its overview in Chromium`);
  await expect(canvas(page).getByRole("button", { name: "Add step", exact: true })).toBeDisabled();
  const zoomIn = canvas(page).getByRole("button", { name: "Zoom in", exact: true });
  for (let i = 0; i < 3; i++) await zoomIn.click();
  await expect.poll(() => cards(page).count()).toBeLessThan(20);
  await canvas(page).getByRole("button", { name: "Fit flow to view" }).click();
  await expect(cards(page)).toHaveCount(20);
});
