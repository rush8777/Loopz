import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperienceRenderer } from '../src/experiences/runtime/ExperienceRenderer';
import { ExperienceLoader } from '../src/experiences/runtime/ExperienceLoader';
import { matchesGuideRoute } from '../src/experiences/runtime/GuideStepLogic';
import type { DeliveredExperience, GuideStep, RuntimeGuideDefinition } from '../src/experiences/types';
const design = { width: 'md' as const, theme: { background: '#fff', foreground: '#111', primary: '#2563eb', borderRadius: 'md' as const } };
const session = { getAnonymousId: () => 'anon', getSessionId: () => 'session', getPageViewId: () => 'page', getIdentifiedUserId: () => null };
const modal = (id: string): GuideStep => ({ id, pattern: 'modal', content: { heading: id, body: 'Body', primaryAction: { label: 'Next', type: 'next_step' } }, behavior: { dismissible: true }, advance: { type: 'button' } });
const anchored = (id: string): GuideStep => ({ ...modal(id), pattern: 'anchored_card', target: { primarySelector: '#anchor', fallbackSelectors: [], reliability: 'reliable' } });
const delivered = (steps: GuideStep[]): DeliveredExperience => ({ id: 'guide', versionId: 'v1', kind: 'guide', widgetType: null, priority: 1, definition: { design, steps } });
const text = () => document.querySelector('[data-movcues-experience]')?.shadowRoot?.querySelector('h2')?.textContent;
const next = () => document.querySelector('[data-movcues-experience]')!.shadowRoot!.querySelector<HTMLButtonElement>('.primary')!.click();
let cleanup: (() => void)[]; let events: any[];
function runtime(steps: GuideStep[]) {
  const guide = delivered(steps);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/experiences?')) return { ok: true, json: async () => ({ experiences: [guide] }) };
    const body = JSON.parse(String(init?.body)); events.push(body); return { ok: true, status: body.event === 'shown' ? 201 : 204, json: async () => ({ impressionId: 'impression' }) };
  }));
  const loader = new ExperienceLoader('https://api.test', 'site', session); cleanup.push(() => loader.destroy()); return loader;
}
beforeEach(() => {
  cleanup = []; events = []; document.body.innerHTML = '<button id="anchor">Anchor</button><button id="interaction">Use feature</button>'; sessionStorage.clear(); localStorage.clear(); history.replaceState({}, '', '/start');
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 1; }); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return this.id === 'interaction' ? new DOMRect(500, 200, 80, 30) : new DOMRect(100, 150, 80, 30); });
});
afterEach(() => { cleanup.forEach(fn => fn()); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('linear Guide logic', () => {
  it('runs the welcome, real website click, custom event journey exactly once without blocking the site', async () => {
    const feature = anchored('Feature'); feature.advance = { type: 'element_click', target: { primarySelector: '#interaction', fallbackSelectors: [], reliability: 'reliable' } };
    const end = modal('Completion'); end.advance = { type: 'custom_event', eventName: 'project_created' };
    const loader = runtime([modal('Welcome'), feature, end]); await loader.evaluate(); next(); expect(text()).toBe('Feature');
    expect(document.querySelector('[data-movcues-experience]')!.shadowRoot!.querySelector<HTMLElement>('.card')!.style.top).toBe('188px');
    let siteClicks = 0; document.querySelector('#interaction')!.addEventListener('click', () => siteClicks++);
    (document.querySelector('#interaction') as HTMLElement).click(); (document.querySelector('#interaction') as HTMLElement).click(); await Promise.resolve(); expect(text()).toBe('Completion'); expect(siteClicks).toBe(2);
    loader.onCustomEvent('other'); expect(text()).toBe('Completion'); loader.onCustomEvent('project_created'); loader.onCustomEvent('project_created');
    await vi.waitFor(() => expect(events.filter(event => event.eventType === 'guide_completed')).toHaveLength(1));
    expect(events.filter(event => event.eventType === 'experience_shown')).toHaveLength(1); expect(events.filter(event => event.eventType === 'guide_step_completed').map(event => event.stepId)).toEqual(['Welcome', 'Feature', 'Completion']);
  });
  it('cancels hover on leave and removes old listeners after advancing', async () => {
    vi.useFakeTimers(); const step = anchored('Hover'); step.advance = { type: 'element_hover', durationMs: 200 };
    const loader = runtime([step, modal('After')]); await loader.evaluate(); const target = document.querySelector('#anchor')!;
    target.dispatchEvent(new MouseEvent('mouseenter')); vi.advanceTimersByTime(199); target.dispatchEvent(new MouseEvent('mouseleave')); vi.advanceTimersByTime(500); expect(text()).toBe('Hover');
    target.dispatchEvent(new MouseEvent('mouseenter')); vi.advanceTimersByTime(200); expect(text()).toBe('After'); target.dispatchEvent(new MouseEvent('mouseenter')); vi.advanceTimersByTime(500); expect(text()).toBe('After');
  });
  it('cancels delayed presentation and queued website clicks on destroy', () => {
    vi.useFakeTimers(); const renderer = new ExperienceRenderer(); cleanup.push(() => renderer.destroy()); const visible = vi.fn(), advance = vi.fn();
    const step = modal('Delayed'); step.presentation = { delayMs: 500 }; renderer.render(delivered([step]), { onVisible: visible, onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() });
    vi.advanceTimersByTime(499); expect(text()).toBeUndefined(); renderer.destroy(); vi.advanceTimersByTime(1000); expect(visible).not.toHaveBeenCalled();
    const click = anchored('Click'); click.advance = { type: 'element_click' }; renderer.render(delivered([click]), { onVisible: vi.fn(), onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn(), onGuideAdvance: advance });
    (document.querySelector('#anchor') as HTMLElement).click(); renderer.destroy(); return Promise.resolve().then(() => expect(advance).not.toHaveBeenCalled());
  });
  it.each(['wait', 'skip', 'dismiss'] as const)('uses the bounded missing-target %s policy', async action => {
    vi.useFakeTimers(); const step = anchored('Missing'); step.target!.primarySelector = '#missing'; step.presentation = { missingTarget: { action, timeoutMs: 100 } };
    const advance = vi.fn(), dismiss = vi.fn(), unavailable = vi.fn(); const renderer = new ExperienceRenderer(); cleanup.push(() => renderer.destroy());
    renderer.render(delivered([step, modal('After')]), { onVisible: vi.fn(), onDismiss: dismiss, onAction: vi.fn(), onComplete: vi.fn(), onGuideAdvance: advance, onUnavailable: unavailable });
    vi.advanceTimersByTime(99); expect(advance).not.toHaveBeenCalled(); vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledTimes(action === 'skip' ? 1 : 0); expect(dismiss).toHaveBeenCalledTimes(action === 'dismiss' ? 1 : 0); expect(unavailable).toHaveBeenCalledTimes(action === 'wait' ? 1 : 0);
    renderer.destroy(); vi.advanceTimersByTime(1000); expect(vi.getTimerCount()).toBe(0);
  });
  it('discovers an asynchronously inserted independent interaction target within the shared timeout', async () => {
    const step = anchored('Async'); step.advance = { type: 'element_click', target: { primarySelector: '#late', fallbackSelectors: [], reliability: 'reliable' } }; step.presentation = { missingTarget: { action: 'dismiss', timeoutMs: 1000 } };
    const renderer = new ExperienceRenderer(); cleanup.push(() => renderer.destroy()); const visible = vi.fn(); renderer.render(delivered([step]), { onVisible: visible, onDismiss: vi.fn(), onAction: vi.fn(), onComplete: vi.fn() }); expect(text()).toBeUndefined();
    const target = document.createElement('button'); target.id = 'late'; document.body.append(target); await vi.waitFor(() => expect(text()).toBe('Async')); expect(visible).toHaveBeenCalledTimes(1);
  });
  it('does not let one route notification advance through consecutive matching steps', async () => {
    const route = modal('Route one'); route.advance = { type: 'route', pageRules: [{ id: 'rule', kind: 'include', operator: 'equals', value: '/next' }] };
    const second = { ...modal('Route two'), advance: route.advance }; const loader = runtime([route, second, modal('After')]); await loader.evaluate();
    history.pushState({}, '', '/next'); loader.onRouteChange(); loader.onRouteChange(); await Promise.resolve(); expect(text()).toBe('Route two');
  });
  it('ignores custom events until a delayed step is presented', async () => {
    vi.useFakeTimers(); const delayed = modal('Wait'); delayed.presentation = { delayMs: 200 }; delayed.advance = { type: 'custom_event', eventName: 'ready' };
    const loader = runtime([delayed, modal('After')]); await loader.evaluate(); loader.onCustomEvent('ready'); expect(text()).toBeUndefined(); vi.advanceTimersByTime(200); expect(text()).toBe('Wait'); loader.onCustomEvent('ready'); expect(text()).toBe('After');
  });
  it('resumes a stable step ID across reload without duplicate impression or step-shown events', async () => {
    const loader = runtime([modal('One'), modal('Two')]); await loader.evaluate(); next(); await vi.waitFor(() => expect(events.filter(event => event.eventType === 'guide_step_shown')).toHaveLength(2)); loader.destroy();
    const resumed = new ExperienceLoader('https://api.test', 'site', session); cleanup.push(() => resumed.destroy()); await resumed.evaluate(); expect(text()).toBe('Two'); await Promise.resolve();
    expect(events.filter(event => event.eventType === 'guide_step_shown')).toHaveLength(2); expect(events.filter(event => event.eventType === 'experience_shown')).toHaveLength(1);
  });
  it('does not reuse a pending step-shown payload for the next step', async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); const steps = [modal('One'), modal('Two')];
    const loader = runtime(steps); const mock = vi.mocked(fetch); const base = mock.getMockImplementation()!;
    mock.mockImplementation(async (input, init) => { if (init?.body && JSON.parse(String(init.body)).event === 'shown') { await gate; return base(input, init); } return base(input, init); });
    await loader.evaluate(); next(); release(); await vi.waitFor(() => expect(events.filter(event => event.eventType === 'guide_step_shown')).toHaveLength(2));
    expect(events.filter(event => event.eventType === 'guide_step_shown').map(event => event.stepId)).toEqual(['One', 'Two']);
  });
  it('matches existing wildcard and exclusion page rules literally', () => {
    expect(matchesGuideRoute('/projects/123', [{ id: 'one', kind: 'include', operator: 'matches_pattern', value: '/projects/*' }])).toBe(true);
    expect(matchesGuideRoute('/projects/secret', [{ id: 'one', kind: 'include', operator: 'starts_with', value: '/projects/' }, { id: 'two', kind: 'exclude', operator: 'ends_with', value: 'secret' }])).toBe(false);
  });
});
