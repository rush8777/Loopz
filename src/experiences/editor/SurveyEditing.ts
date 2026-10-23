import type { SurveyQuestion, SurveyStep } from '../types';
import { applyOnsiteDocument, cloneOnsite, createOnsiteSurveyDocument, duplicateDocument, listBlocks, onsiteDocumentFromBuilder, onsiteId } from '../onsite/OnsiteDocument';

export function newSurveyQuestion(type: SurveyQuestion['type']): SurveyQuestion {
  const base = { id: onsiteId('question'), label: 'Your question', required: false };
  if (type === 'single_choice' || type === 'multiple_choice') return { ...base, type, options: [{ id: onsiteId('option'), label: 'Yes' }, { id: onsiteId('option'), label: 'No' }] };
  if (type === 'short_text' || type === 'long_text') return { ...base, type, placeholder: '', maxLength: type === 'short_text' ? 200 : 2000 };
  if (type === 'rating') return { ...base, type, min: 1, max: 5 };
  return { ...base, type: 'nps' };
}

export function newSurveyStep(submitLabel: string): SurveyStep {
  const step: SurveyStep = { id: onsiteId('step'), content: { heading: 'New Survey step', body: '' }, questions: [], builder: { version: 1, html: '', css: '', projectData: {} } };
  step.content = applyOnsiteDocument(step.builder!, createOnsiteSurveyDocument(step.questions, step.content), 'survey', { questions: step.questions, submitLabel }).content;
  return step;
}

export function duplicateSurveyStep(source: SurveyStep, submitLabel: string): SurveyStep {
  const copy = cloneOnsite(source); copy.id = onsiteId('step');
  const questions = new Map<string, string>(), options = new Map<string, string>();
  copy.questions.forEach(question => {
    const old = question.id; question.id = onsiteId('question'); questions.set(old, question.id);
    if ('options' in question) question.options.forEach(option => { const old = option.id; option.id = onsiteId('option'); options.set(`${question.id}:${old}`, option.id); });
  });
  copy.branching?.rules.forEach(rule => { rule.questionId = questions.get(rule.questionId)!; const key = `${rule.questionId}:${rule.value}`; if (typeof rule.value === 'string' && options.has(key)) rule.value = options.get(key)!; });
  const document = onsiteDocumentFromBuilder(copy.builder);
  if (!document || !copy.builder) throw new Error('This Survey step is not an on-site document.');
  const duplicated = duplicateDocument(document);
  listBlocks(duplicated.root).forEach(block => { if (block.type === 'question') block.questionId = questions.get(block.questionId)!; });
  copy.content = applyOnsiteDocument(copy.builder, duplicated, 'survey', { questions: copy.questions, submitLabel }).content;
  return copy;
}
