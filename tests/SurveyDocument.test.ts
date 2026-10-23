import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/survey-v3.json';
import { compileOnsiteDocument, createOnsiteDocument, duplicateSurveyCell, listBlocks, moveCell, resizeSiblings, validateOnsiteDocument } from '../src/experiences/onsite/OnsiteDocument';
import type { OnsiteDocument } from '../src/experiences/onsite/OnsiteDocument';
import type { SurveyQuestion } from '../src/experiences/types';

const fresh = () => structuredClone(fixture) as { document: OnsiteDocument; questions: SurveyQuestion[]; submitLabel: string };
describe('version 3 Survey cell contract', () => {
  it('compiles all six canonical types with existing runtime markers and no question copies in cells', () => {
    const f = fresh(), compiled = compileOnsiteDocument(f.document, 'survey', f);
    expect(createHash('sha256').update(JSON.stringify(compiled)).digest('hex')).toBe(fixture.expectedHash);
    const html = document.createElement('template'); html.innerHTML = compiled.html;
    for (const question of f.questions) {
      const node = html.content.querySelector(`[data-movcues-question-id="${question.id}"]`)!;
      expect(node.getAttribute('data-movcues-question-type')).toBe(question.type);
    }
    expect(html.content.querySelectorAll('[data-movcues-question-id]')).toHaveLength(6);
    expect(html.content.querySelectorAll('[data-movcues-survey-action]')).toHaveLength(3);
    expect(html.content.querySelector('[data-movcues-survey-action="submit"]')?.textContent).toBe('Send feedback');
    expect(compiled.html).toContain('Choose &lt;one&gt;');
    expect(JSON.stringify(f.document)).not.toContain('Choose');
    expect(JSON.stringify(f.document)).not.toContain('options');
    expect(compiled.html).toContain('data-movcues-document-version="3"');
  });
  it('rejects orphaned/duplicate references and missing controls', () => {
    const f = fresh(); const first = listBlocks(f.document.root)[0];
    if (first.type !== 'question') throw new Error('Question expected');
    first.questionId = 'missing'; expect(() => compileOnsiteDocument(f.document, 'survey', f)).toThrow(/Orphaned/);
    first.questionId = 'q_multiple'; expect(() => compileOnsiteDocument(f.document, 'survey', f)).toThrow(/exactly once/);
    f.document.root.children!.pop(); expect(() => compileOnsiteDocument(f.document, 'survey', f)).toThrow(/navigation/);
  });
  it('rejects unsupported types, duplicate canonical IDs and embedded definitions', () => {
    const f = fresh(); (f.questions[0] as { type: string }).type = 'html';
    expect(() => compileOnsiteDocument(f.document, 'survey', f)).toThrow(/Unsupported/);
    f.questions = fresh().questions; f.questions[0].id = f.questions[1].id;
    expect(() => compileOnsiteDocument(f.document, 'survey', f)).toThrow(/unique/);
    const bad = fresh().document; Object.assign(listBlocks(bad.root)[0], { question: { label: 'Duplicated model' } });
    expect(validateOnsiteDocument(bad).valid).toBe(false);
  });
  it('keeps version 2 Widgets/Guides and rejects Survey references in version 2 or outside a Survey', () => {
    expect(compileOnsiteDocument(createOnsiteDocument(), 'modal').html).toContain('data-movcues-document-version="2"');
    expect(compileOnsiteDocument(createOnsiteDocument(true), 'anchored_card').content.primaryAction?.type).toBe('next_step');
    const f = fresh(); expect(() => compileOnsiteDocument(f.document, 'modal', f)).toThrow(/Survey question context/);
    expect(() => compileOnsiteDocument(f.document, 'survey')).toThrow(/context/);
    f.document.schemaVersion = 2; expect(validateOnsiteDocument(f.document).valid).toBe(false);
  });
  it('duplicates question, option, block and cell IDs atomically without changing the original', () => {
    const f = fresh(), original = structuredClone(f), id = f.document.root.children![0].id;
    const result = duplicateSurveyCell(f.document, f.questions, id)!;
    expect(f).toEqual(original); expect(result.questions).toHaveLength(7);
    expect(result.cellId).not.toBe(id);
    const copied = result.document.root.children![1].block!;
    expect(copied.id).not.toBe(f.document.root.children![0].block!.id);
    if (copied.type !== 'question') throw new Error('Question expected');
    const question = result.questions.find(value => value.id === copied.questionId)!;
    expect(question.id).not.toBe(f.questions[0].id);
    if (question.type !== 'single_choice') throw new Error('Choice expected');
    expect(question.options.map(option => option.id)).not.toEqual(['option_a', 'option_b']);
    expect(() => compileOnsiteDocument(result.document, 'survey', { questions: result.questions })).not.toThrow();
  });
  it('preserves all existing IDs and references through move, resize and styling', () => {
    const f = fresh(), ids = listBlocks(f.document.root).map(block => block.id).sort();
    const first = f.document.root.children![0], second = f.document.root.children![1];
    moveCell(f.document, second.id, -1); resizeSiblings(f.document, first.id, second.id, 1.4);
    first.style = { background: '#f1f5f9', borderRadius: 8 }; expect(listBlocks(f.document.root).map(block => block.id).sort()).toEqual(ids);
    expect(() => compileOnsiteDocument(f.document, 'survey', f)).not.toThrow();
  });
});
