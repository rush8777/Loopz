import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:4310";
const host = "http://127.0.0.1:4179";

test("real services create, persist and publish Widget, Guide, Survey and Checklist templates", async ({ request }) => {
  const email = `templates-${Date.now()}-${Math.random()}@example.test`;
  const account = await (await request.post(`${api}/auth/signup`, { data: { email, password: "correct-horse-battery-staple" } })).json();
  const headers = { authorization: `Bearer ${account.accessToken}` };
  const setup = await (await request.post(`${api}/auth/onboarding`, { headers, data: { workspaceName: "Template QA", siteName: "Template host", domain: host } })).json();
  await request.post(`${api}/auth/onboarding/skip`, { headers });
  const base = `${api}/orgs/${setup.organization.id}/sites/${setup.site.id}`;
  const buildUrl = `${host}/tests/integration/host.html?site=${setup.site.siteId}`;

  const catalog = await request.get(`${base}/experience-templates?kind=widget&widgetType=modal`, { headers });
  expect(catalog.status(), await catalog.text()).toBe(200);
  expect((await catalog.json()).templates.map((item: { id: string }) => item.id)).toContain("widget-welcome-modal");

  const cases = [
    { template: "widget-welcome-modal", kind: "widget", widgetType: "modal", schemaVersion: 2 },
    { template: "guide-new-user-onboarding", kind: "guide", widgetType: null, schemaVersion: 2 },
    { template: "survey-csat", kind: "widget", widgetType: "survey", schemaVersion: 3 },
    { template: "checklist-getting-started", kind: "checklist", widgetType: null, schemaVersion: 4 },
  ] as const;

  for (const item of cases) {
    const response = await request.post(`${base}/experiences`, { headers, data: { kind: item.kind, widgetType: item.widgetType, builderMode: "onsite", name: `Published ${item.template}`, buildUrl, template: item.template, theme: { source: "preset", preset: "dark" }, useBuildPageAsTarget: false } });
    expect(response.status(), await response.text()).toBe(201);
    const created = await response.json();
    const definition = created.draftVersion.definition;
    const documents = item.kind === "guide" ? definition.steps.map((step: any) => step.builder.projectData.movcues.onsiteDocument) : item.widgetType === "survey" ? definition.survey.steps.map((step: any) => step.builder.projectData.movcues.onsiteDocument) : [definition.builder.projectData.movcues.onsiteDocument];
    expect(documents.every((document: any) => document.schemaVersion === item.schemaVersion)).toBe(true);
    expect(definition.design.theme.background).toBe("#0f172a");
    const publish = await request.post(`${base}/experiences/${created.id}/publish`, { headers, data: { draftVersionId: created.draftVersion.id, revision: created.draftVersion.revision } });
    expect(publish.status(), await publish.text()).toBe(200);
    const stored = await (await request.get(`${base}/experiences/${created.id}`, { headers })).json();
    expect(stored.publishedVersion.definition.template).toEqual({ id: item.template, version: 1 });
  }
});
