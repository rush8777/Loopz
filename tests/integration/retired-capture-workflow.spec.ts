import { expect, test } from "@playwright/test";
import type { AnalyticsConfig } from "../../src/types/config";

const api = "http://127.0.0.1:4310";
const host = "http://127.0.0.1:4179";

test("the built CDN SDK records supported analytics when an old install requests retired collectors", async ({ page, request }) => {
  const signup = await request.post(`${api}/auth/signup`, {
    data: { email: `capture-compat-${Date.now()}@example.test`, password: "correct-horse-battery-staple" },
  });
  expect(signup.ok()).toBe(true);
  const { accessToken } = await signup.json();
  const headers = { authorization: `Bearer ${accessToken}` };
  const setup = await request.post(`${api}/auth/onboarding`, {
    headers,
    data: { workspaceName: "Capture compatibility", siteName: "CDN host", domain: host },
  });
  expect(setup.status()).toBe(201);
  const { organization, site } = await setup.json();

  const captureRequests = new Set<string>();
  const retiredBundles = new Set<string>();
  page.on("request", (outgoing) => {
    const url = new URL(outgoing.url());
    if (url.origin === api) captureRequests.add(url.pathname);
    if (/sdk-(?:replay|heatmap)/.test(url.pathname)) retiredBundles.add(url.pathname);
  });
  const landingPath = "/tests/integration/capture-compatibility.html";
  await page.goto(`${host}${landingPath}`);
  await page.addScriptTag({ url: `${host}/dist/v1.js` });

  const config: AnalyticsConfig = {
    siteId: site.siteId,
    endpoint: api,
    debug: false,
    autocapture: { move: true, hover: true, cursor: true, elementCrawler: true },
    sessionReplay: { enabled: true },
    experiences: { enabled: false },
    queue: { maxWaitMs: 50 },
  };
  const eventResponse = page.waitForResponse(response =>
    response.url().endsWith(`/public/sites/${site.siteId}/events`) && response.request().method() === "POST",
  );
  await page.evaluate((options) => {
    const { analytics } = window as unknown as {
      analytics: { init(config: AnalyticsConfig): void; identify(id: string): void; event(name: string): void };
    };
    analytics.init(options);
    analytics.identify("legacy-install-visitor");
    analytics.event("saved");
  }, config);
  const ingestion = await eventResponse;
  expect(ingestion.ok(), await ingestion.text()).toBe(true);
  await page.locator("#save").hover();
  await page.locator("#background").click();
  await page.locator("#save").click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const sitePath = `${api}/orgs/${organization.id}/sites/${site.id}`;

  await expect.poll(async () => {
    const result = await request.get(`${sitePath}/sessions`, { headers });
    return result.ok() ? (await result.json()).sessions.length : 0;
  }).toBe(1);
  const list = await (await request.get(`${sitePath}/sessions`, { headers })).json();
  const session = list.sessions[0];
  expect(session.visitor).toMatchObject({ type: "identified", label: "legacy-install-visitor" });
  const sessionUrl = `${sitePath}/sessions/${session.sessionId}`;
  const loadEvents = async () => (await (await request.get(sessionUrl, { headers })).json()).events as Array<{
    type: string; pagePath: string; selector: string | null; name: string | null;
  }>;

  await expect.poll(async () => (await loadEvents()).some(event => event.type === "scroll")).toBe(true);
  await page.evaluate(() => history.pushState({}, "", "/capture-compatibility/next"));
  await expect.poll(async () => (await loadEvents()).filter(event => event.type === "page_view").map(event => event.pagePath))
    .toEqual([landingPath, "/capture-compatibility/next"]);

  const events = await loadEvents();
  expect(events.filter(event => event.type === "click").map(event => event.selector)).toEqual(["button#save"]);
  expect(events.filter(event => event.type === "custom").map(event => event.name)).toEqual(["saved"]);
  expect(events.every(event => ["page_view", "click", "custom", "scroll"].includes(event.type))).toBe(true);
  expect(captureRequests).toEqual(new Set([`/public/config/${site.siteId}`, `/public/sites/${site.siteId}/events`]));
  expect(retiredBundles.size).toBe(0);
});
