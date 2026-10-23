import { test, expect, type Page } from '@playwright/test';
function guide() {
  const step = (id: string, pattern: 'modal' | 'anchored_card') => ({ id, label: id, pattern, content: { heading: id, body: 'Guide body', primaryAction: { label: id === 'Welcome' ? 'Get Started' : 'Next', type: 'next_step' } }, builder: { version: 1, projectData: {}, html: `<section class="movcues-widget"><h2 data-movcues-content="heading">${id}</h2><p data-movcues-content="body">Guide body</p><button data-movcues-action-id="primary">${id === 'Welcome' ? 'Get Started' : 'Next'}</button></section>`, css: '.movcues-widget{padding:16px;max-width:100%}' }, behavior: { dismissible: true, placement: 'bottom', alignment: 'center', offset: 8 }, advance: { type: 'button' } as any, presentation: { delayMs: 0 } as any, target: undefined as any });
  const feature = step('Feature', 'anchored_card'); feature.target = { primarySelector: '#feature-card', fallbackSelectors: [], reliability: 'reliable' }; feature.advance = { type: 'element_click', target: { primarySelector: '#use-feature', fallbackSelectors: [], reliability: 'reliable' } }; feature.presentation = { delayMs: 20, missingTarget: { action: 'wait', timeoutMs: 3000 } };
  const end = step('Completion', 'modal'); end.advance = { type: 'custom_event', eventName: 'project_created' };
  return { steps: [step('Welcome', 'modal'), feature, end], design: { width: 'md', theme: { background: '#fff', foreground: '#111', primary: '#2563eb', borderRadius: 'md' } }, targeting: { pageRules: [], audience: { type: 'all' }, trigger: { type: 'page_load' }, frequency: { mode: 'once' }, priority: 0 } };
}
async function production(page: Page, definition = guide()) {
  const events: any[] = [];
  await page.route('**/public/sites/site/**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { experiences: [{ id: 'published-guide', versionId: 'v1', kind: 'guide', widgetType: null, priority: 1, definition }] } });
    const event = route.request().postDataJSON(); events.push(event); return route.fulfill({ json: { impressionId: 'imp-1' } });
  });
  await page.addInitScript(seed => {
    addEventListener('DOMContentLoaded', () => {
      const j = (window as any).journey; if (!j) return;
      j.loader = new j.ExperienceLoader(location.origin, 'site', { getAnonymousId: () => 'anon', getSessionId: () => 'session', getPageViewId: () => location.pathname, getIdentifiedUserId: () => null });
      j.routes = new j.RouteObserver(); j.routes.onChange(() => j.loader.onRouteChange()); j.routes.start();
      addEventListener('guide-test-event', event => j.loader.onCustomEvent((event as CustomEvent).detail));
      void j.loader.evaluate(); (window as any).guideSeed = seed;
    });
  }, definition);
  await page.goto('/journey/start'); await expect(page.locator('[data-movcues-experience] h2')).toHaveText('Welcome'); return events;
}
async function editor(page: Page, definition = guide()) {
  let saved = definition; let revision = 1; let writes = 0;
  await page.route('**/public/experience-editor/**', route => {
    if (route.request().url().endsWith('/exchange')) return route.fulfill({ json: { sessionId: 'editor-session', accessToken: 'preview-token', expiresAt: new Date(Date.now()+180000).toISOString() } });
    if (route.request().method() === 'PATCH') { writes++; const body=route.request().postDataJSON(); saved=body.definition; revision++; return route.fulfill({ json: { version: { id: 'draft', revision, definition: saved } } }); }
    return route.fulfill({ json: { experience: { id: 'editing-guide', name: 'Journey', builderMode: 'onsite', kind: 'guide', widgetType: null }, version: { id: 'draft', versionNumber: 1, revision, definition: saved } } });
  });
  await page.goto('/journey/start'); await page.waitForFunction(() => !!(window as any).journey);
  await page.evaluate(async () => { const j=(window as any).journey; j.editor=new j.Controller(location.origin); if (!await j.editor.start('launch')) throw new Error('Editor failed'); });
  return { getSaved: () => saved, getWrites: () => writes };
}
const widgetHeading = (page: Page) => page.locator('[data-movcues-experience] h2');

test('published three-step journey survives React SPA navigation, back/forward and full-page reload without duplicate events', async ({ page }) => {
  const events = await production(page); await page.locator('[data-movcues-experience]').getByRole('button', { name: 'Get Started', exact: true }).click();
  await expect(widgetHeading(page)).toHaveText('Feature'); await page.locator('#use-feature').click(); await expect(widgetHeading(page)).toHaveText('Completion'); await expect(page.locator('#site-clicks')).toHaveText('1'); await expect(page).toHaveURL(/\/journey\/done$/);
  await expect.poll(() => events.filter(event => event.eventType === 'guide_step_shown').length).toBe(3);
  await page.goBack(); await expect(page.locator('[data-app-path]')).toHaveText('/journey/start'); await expect(widgetHeading(page)).toHaveText('Completion');
  await page.goForward(); await expect(page.locator('[data-app-path]')).toHaveText('/journey/done'); await page.reload(); await expect(widgetHeading(page)).toHaveText('Completion');
  expect(events.filter(event => event.eventType === 'experience_shown')).toHaveLength(1); expect(events.filter(event => event.eventType === 'guide_step_shown')).toHaveLength(3);
  await page.evaluate(() => dispatchEvent(new CustomEvent('guide-test-event', { detail: 'project_created' }))); await expect(page.locator('[data-movcues-experience]')).toHaveCount(0);
  await expect.poll(() => events.filter(event => event.eventType === 'guide_completed').length).toBe(1);
  expect(events.filter(event => event.eventType === 'guide_step_completed').map(event => event.stepId)).toEqual(['Welcome','Feature','Completion']);
});

test('full Guide preview tests website clicks and custom events without production storage or requests', async ({ page }) => {
  const productionRequests: string[] = []; page.on('request', request => { if (/experience-events|survey-responses|\/public\/sites\//.test(request.url())) productionRequests.push(request.url()); });
  await editor(page); const before = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: sessionStorage.getItem('__movcues_active_guide__') }));
  await page.locator('[data-mode=preview]').click(); await page.locator('[data-preview-start]').click();
  await page.locator('[data-movcues-experience]').getByRole('button', { name: 'Get Started', exact: true }).click(); await expect(widgetHeading(page)).toHaveText('Feature');
  await page.locator('#use-feature').click(); await expect(widgetHeading(page)).toHaveText('Completion');
  await expect(page.locator('[data-trigger-status]')).toContainText('project_created'); await page.locator('[data-preview-test]').click(); await expect(page.locator('[data-preview-step]')).toContainText('Complete');
  await expect(page.locator('[data-movcues-experience]')).toHaveCount(0); expect(productionRequests).toEqual([]);
  expect(await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: sessionStorage.getItem('__movcues_active_guide__') }))).toEqual(before);
  await page.locator('[data-preview-reset]').click(); await expect(widgetHeading(page)).toHaveText('Welcome'); await expect(page.locator('[data-preview-step]')).toHaveText('1/3');
});

test('Step Behavior config saves and restores independent trigger settings without replacing the anchor target', async ({ page }) => {
  const network = await editor(page); await page.locator('[data-step="1"]').click(); await page.locator('[data-select-step]').click();
  await expect(page.locator('[data-guide-interaction-label]')).toContainText('#use-feature'); await page.locator('[data-guide-trigger]').selectOption('element_hover');
  await page.locator('[data-guide-hover]').fill('700'); await page.locator('[data-guide-hover]').press('Tab'); await page.locator('[data-guide-delay]').fill('150'); await page.locator('[data-guide-delay]').press('Tab');
  await page.locator('[data-guide-missing-action]').selectOption('skip'); await page.locator('[data-guide-timeout]').fill('900'); await page.locator('[data-guide-timeout]').press('Tab');
  await expect(page.locator('[data-save-state]')).toHaveText('Draft saved'); const feature = network.getSaved().steps[1];
  expect(feature.target.primarySelector).toBe('#feature-card'); expect(feature.advance).toEqual({ type: 'element_hover', durationMs: 700, target: { primarySelector: '#use-feature', fallbackSelectors: [], reliability: 'reliable' } });
  expect(feature.presentation).toEqual({ delayMs: 150, missingTarget: { action: 'skip', timeoutMs: 900 } });
  await page.evaluate(async () => { const j=(window as any).journey; j.editor.destroy(); j.editor=new j.Controller(location.origin); await j.editor.start('reopen'); });
  await page.locator('[data-step="1"]').click(); await page.locator('[data-select-step]').click(); await expect(page.locator('[data-guide-hover]')).toHaveValue('700'); await expect(page.locator('[data-guide-timeout]')).toHaveValue('900');
  await page.locator('[data-step="0"]').click(); await page.locator('[data-select-step]').click(); await expect(page.locator('[data-guide-trigger] option[value=element_click]')).toHaveAttribute('disabled', ''); await expect(page.locator('[data-guide-missing]')).toBeHidden();
});

test('interaction picker changes only the advance target', async ({ page }) => {
  const network = await editor(page); await page.locator('[data-step="1"]').click(); await page.locator('[data-select-step]').click(); await page.locator('[data-guide-pick-interaction]').click();
  await page.locator('#hover-feature').click(); await expect(page.locator('[data-save-state]')).toHaveText('Draft saved');
  expect(network.getSaved().steps[1].target.primarySelector).toBe('#feature-card'); expect(network.getSaved().steps[1].advance.target.primarySelector).toContain('hover-feature');
});

test('route trigger advances once after real React navigation, while simulation never redirects', async ({ page }) => {
  const definition = guide(); definition.steps[0].advance = { type: 'route', pageRules: [{ id: 'route', kind: 'include', operator: 'equals', value: '/journey/feature' }] };
  await editor(page, definition); await page.locator('[data-mode=preview]').click(); await page.evaluate(() => (window as any).guideReactApp.go('/journey/feature')); await expect(widgetHeading(page)).toHaveText('Feature'); await expect(page.locator('[data-preview-step]')).toHaveText('2/3');
  await page.locator('[data-preview-reset]').click(); await expect(widgetHeading(page)).toHaveText('Welcome'); const url = page.url(); await page.locator('[data-preview-test]').click(); await expect(widgetHeading(page)).toHaveText('Feature'); expect(page.url()).toBe(url);
});

for (const width of [320, 360, 390]) test(`Guide behavior and preview controls fit a ${width}px React viewport`, async ({ page }) => {
  await page.setViewportSize({ width, height: 700 }); await editor(page); await page.locator('[data-select-step]').click(); await page.locator('[data-guide-trigger]').selectOption('custom_event');
  await page.locator('[data-guide-event]').fill('ready'); await page.locator('[data-guide-event]').press('Tab'); await page.locator('[data-mode=preview]').click();
  const toolbar = (await page.locator('[data-editor-toolbar]').boundingBox())!; expect(toolbar.x).toBeGreaterThanOrEqual(0); expect(toolbar.x+toolbar.width).toBeLessThanOrEqual(width);
  await expect(page.locator('[data-preview-test]')).toBeInViewport(); await expect(page.locator('[data-close]')).toBeInViewport(); await page.locator('[data-preview-test]').click(); await expect(page.locator('[data-preview-step]')).toHaveText('2/3');
});

 test('preview blocks external anchor navigation without consuming the website click trigger', async ({ page }) => {
  const definition = guide(); definition.steps = [definition.steps[1], definition.steps[2]];
  definition.steps[0].advance.target.primarySelector = '#outside-link';
  await editor(page, definition);
  await page.evaluate(() => { const a=document.createElement('a'); a.id='outside-link'; a.href='https://example.com/outside'; a.textContent='External task'; a.style.cssText='position:fixed;bottom:100px;left:10px;z-index:5'; document.body.append(a); });
  await page.locator('[data-mode=preview]').click(); await expect(widgetHeading(page)).toHaveText('Feature'); const url=page.url();
  await page.locator('#outside-link').click(); await expect(widgetHeading(page)).toHaveText('Completion'); expect(page.url()).toBe(url);
  await page.locator('[data-preview-test]').click(); await page.locator('[data-reset-preview]').click(); await expect(widgetHeading(page)).toHaveText('Feature'); await expect(page.locator('[data-preview-step]')).toHaveText('1/2');
  const submission = await page.evaluate(() => { const form=document.createElement('form'); form.action='https://example.com/submit'; document.body.append(form); const event=new Event('submit', { bubbles: true, cancelable: true }); form.dispatchEvent(event); form.remove(); return event.defaultPrevented; }); expect(submission).toBe(true);

 });

 test('hover preview cancels on leave, advances once and removes old listeners', async ({ page }) => {
  const definition = guide(); definition.steps = [definition.steps[1], definition.steps[2]]; definition.steps[0].advance = { type: 'element_hover', durationMs: 200, target: { primarySelector: '#hover-feature', fallbackSelectors: [], reliability: 'reliable' } };
  await editor(page, definition); await page.locator('[data-mode=preview]').click(); await expect(widgetHeading(page)).toHaveText('Feature');
  await page.locator('#hover-feature').hover(); await page.mouse.move(5, 400); await page.waitForTimeout(250); await expect(widgetHeading(page)).toHaveText('Feature');
  await page.locator('#hover-feature').hover(); await expect(widgetHeading(page)).toHaveText('Completion'); await page.locator('#hover-feature').dispatchEvent('mouseenter'); await page.waitForTimeout(250); await expect(page.locator('[data-preview-step]')).toHaveText('2/2');
 });
 test('preview reports missing target and applies the bounded skip fallback', async ({ page }) => {
  const definition = guide(); definition.steps = [definition.steps[1], definition.steps[2]]; definition.steps[0].advance.target.primarySelector = '#not-rendered'; definition.steps[0].presentation = { delayMs: 0, missingTarget: { action: 'skip', timeoutMs: 500 } };
  await editor(page, definition); await page.locator('[data-mode=preview]').click(); await expect(page.locator('[data-trigger-status]')).toContainText('Waiting for a website element'); await expect(widgetHeading(page)).toHaveText('Completion'); await expect(page.locator('[data-preview-step]')).toHaveText('2/2');
 });
