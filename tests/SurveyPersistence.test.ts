import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperienceLoader } from '../src/experiences/runtime/ExperienceLoader';
import type { DeliveredExperience, SurveyAnswers } from '../src/experiences/types';

const experience: DeliveredExperience = {
  id: 'survey', versionId: 'version', kind: 'widget', widgetType: 'survey', priority: 1,
  definition: {
    content: { heading: 'Feedback', body: '' },
    design: { width: 'md', theme: { background: '#fff', foreground: '#111', primary: '#2563eb', borderRadius: 'md' } },
    behavior: { dismissible: true, backdrop: false },
    survey: { allowBack: true, showProgress: true, submitLabel: 'Send', steps: ['one', 'two'].map(id => ({
      id, content: { heading: id, body: '' }, questions: [{ id: `${id}_answer`, type: 'short_text' as const, label: id, required: true }],
      builder: { version: 1 as const, projectData: {}, css: '', html: '<section class="movcues-widget"><button data-movcues-survey-action="back">Back</button><button data-movcues-survey-action="next">Next</button><button data-movcues-survey-action="submit">Send</button></section>' },
    })) },
  },
};
const session = { getAnonymousId: () => 'anon', getSessionId: () => 'session', getPageViewId: () => 'page', getIdentifiedUserId: () => null };
const loaders: ExperienceLoader[] = [];
const root = () => document.querySelector('[data-movcues-experience]')!.shadowRoot!;
const action = (name: string) => root().querySelector<HTMLButtonElement>(`[data-movcues-survey-action="${name}"]`)!;
const fill = (value: string) => { const input = root().querySelector<HTMLInputElement>('[data-movcues-question-input]')!; input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };

function fixture() {
  const db = { created: false, answers: {} as SurveyAnswers, currentStepId: 'one', submittedAt: null as string | null };
  const control = { postNetwork: false, failPost: false, failPatch: false, networkFailure: false, patchCount: 0 };
  const events: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), body = JSON.parse(String(init?.body ?? '{}'));
    if (url.includes('/experiences?')) return { ok: true, json: async () => ({ experiences: [{ ...experience, ...(db.created ? { impressionId: 'impression' } : {}) }] }) };
    if (url.includes('/experience-events')) { events.push(body.eventType); return { ok: true, status: 201, json: async () => ({ impressionId: 'impression' }) }; }
    if (url.endsWith('/survey-responses')) {
      if (control.failPost) { if (control.postNetwork) throw new Error('offline'); return { ok: false, status: 503 }; }
      const status = db.created ? 200 : 201; db.created = true;
      return { ok: true, status, json: async () => structuredClone({ responseId: 'response', ...db }) };
    }
    control.patchCount++;
    if (control.networkFailure) throw new Error('offline');
    if (control.failPatch) return { ok: false, status: 500 };
    db.answers = body.answers; db.currentStepId = body.currentStepId ?? db.currentStepId;
    if (body.submitted) db.submittedAt = '2026-10-23T00:00:00Z';
    return { ok: true, status: 204 };
  }));
  const start = async (ready = true) => {
    const loader = new ExperienceLoader('https://api.example.test', 'site', session); loaders.push(loader); await loader.evaluate();
    if (ready) await vi.waitFor(() => expect(action('next').disabled).toBe(false));
    return loader;
  };
  return { db, control, events, start };
}

describe('Survey persistence reliability gate', () => {
  beforeEach(() => { document.documentElement.innerHTML = '<head></head><body></body>'; localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { loaders.splice(0).forEach(loader => loader.destroy()); vi.unstubAllGlobals(); });

  it.each(['status', 'network'])('blocks progress after a failed POST (%s) and retries creation without a second impression', async mode => {
    const f = fixture(); f.control.failPost = true; f.control.postNetwork = mode === 'network'; await f.start(false);
    await vi.waitFor(() => expect(root().querySelector('[data-movcues-survey-retry]')).not.toBeNull());
    expect(f.db.created).toBe(false); expect(f.events.filter(type => type === 'experience_shown')).toHaveLength(1);
    f.control.failPost = false; root().querySelector<HTMLButtonElement>('[data-movcues-survey-retry]')!.click();
    await vi.waitFor(() => expect(action('next').disabled).toBe(false));
    fill('A'); action('next').click(); await vi.waitFor(() => expect(f.db.currentStepId).toBe('two'));
    expect(f.events.filter(type => type === 'experience_shown')).toHaveLength(1);
  });

  it.each(['status', 'network'])('retains answers and the current step after failed PATCH (%s), then retries', async mode => {
    const f = fixture(); await f.start(); fill('Keep this answer');
    f.control.failPatch = mode === 'status'; f.control.networkFailure = mode === 'network'; action('next').click();
    await vi.waitFor(() => expect(root().textContent).toContain("Couldn't save"));
    expect(root().querySelector<HTMLInputElement>('[data-movcues-question-input]')!.value).toBe('Keep this answer');
    expect(f.events).not.toContain('survey_step_completed'); expect(f.db.currentStepId).toBe('one');
    f.control.failPatch = false; f.control.networkFailure = false; root().querySelector<HTMLButtonElement>('[data-movcues-survey-retry]')!.click();
    await vi.waitFor(() => expect(f.db.currentStepId).toBe('two'));
    expect(f.db.answers).toEqual({ one_answer: 'Keep this answer' });
  });

  it('retains the final answer after a failed Submit and ignores double submission while saving', async () => {
    const f = fixture(); await f.start(); fill('First'); action('next').click();
    await vi.waitFor(() => expect(action('submit').hidden).toBe(false)); fill('Final'); f.control.failPatch = true;
    action('submit').click(); action('submit').click();
    await vi.waitFor(() => expect(root().textContent).toContain("Couldn't save"));
    expect(f.control.patchCount).toBe(2); expect(f.events).not.toContain('survey_submitted');
    expect(root().querySelector<HTMLInputElement>('[data-movcues-question-input]')!.value).toBe('Final');
    f.control.failPatch = false; action('submit').click(); action('submit').click();
    await vi.waitFor(() => expect(document.querySelector('[data-movcues-experience]')).toBeNull());
    expect(f.db.answers).toEqual({ one_answer: 'First', two_answer: 'Final' });
    expect(f.events.filter(type => type === 'survey_submitted')).toHaveLength(1);
  });

  it('restores saved answers and destination step in the same session without another shown/started event', async () => {
    const f = fixture(); const first = await f.start(); fill('Saved first'); action('next').click();
    await vi.waitFor(() => expect(f.db.currentStepId).toBe('two')); first.destroy(); await f.start();
    await vi.waitFor(() => expect(action('submit').hidden).toBe(false)); action('back').click();
    await vi.waitFor(() => expect(root().querySelector<HTMLInputElement>('[data-movcues-question-input]')!.value).toBe('Saved first'));
    expect(f.events.filter(type => type === 'experience_shown')).toHaveLength(1);
    expect(f.events.filter(type => type === 'survey_started')).toHaveLength(1);
  });

  it('persists the current entered answers on abandonment and keeps the Survey open when abandonment fails', async () => {
    const f = fixture(); await f.start(); fill('Not lost on close'); f.control.failPatch = true;
    root().querySelector<HTMLElement>('[data-movcues-runtime-chrome]')!.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => expect(root().textContent).toContain("Couldn't save")); expect(f.events).not.toContain('survey_abandoned');
    f.control.failPatch = false; root().querySelector<HTMLButtonElement>('[data-movcues-survey-retry]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-movcues-experience]')).toBeNull());
    expect(f.db.answers).toEqual({ one_answer: 'Not lost on close' }); expect(f.events.filter(type => type === 'survey_abandoned')).toHaveLength(1);
  });
});
