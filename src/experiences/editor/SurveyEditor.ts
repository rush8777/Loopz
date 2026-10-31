import { isSourceAuthored } from "./SourceAuthoring";
import type { SurveyBranchRule, SurveyConfig, SurveyQuestion } from '../types';
import { applyOnsiteDocument, cloneOnsite, onsiteDocumentFromBuilder, onsiteId } from '../onsite/OnsiteDocument';
import { QUESTION_TYPES } from '../survey/SurveyMarkup';
import { surveyBranchErrors } from '../survey/SurveyLogic';
import { duplicateSurveyStep, newSurveyQuestion, newSurveyStep } from './SurveyEditing';
import type { OnsiteCompositionEditor } from './OnsiteCompositionEditor';

interface Options {
  index(): number;
  composer(): OnsiteCompositionEditor | null;
  canEdit(): boolean;
  flush(): boolean;
  changed(): void;
  stepsChanged(index: number): void;
  error(errors: string[]): void;
}
const LABELS: Record<SurveyQuestion['type'], string> = { single_choice: 'Single choice', multiple_choice: 'Multiple choice', short_text: 'Short text', long_text: 'Long text', rating: 'Rating', nps: 'NPS' };

/** Editor-only Survey controls. The existing cell editor owns layout and history. */
export class SurveyEditor {
  private questionHost = document.createElement('div');
  private stepHost = document.createElement('div');
  private dock = document.createElement('div');
  private style = document.createElement('style');
  constructor(private root: ShadowRoot, private survey: SurveyConfig, private options: Options) {
    this.questionHost.dataset.block = 'question'; this.questionHost.hidden = true;
    this.questionHost.innerHTML = `<label>Question type<select data-survey-question-type>${QUESTION_TYPES.map(type => `<option value="${type}">${LABELS[type]}</option>`).join('')}</select></label><label>Question label<input data-survey-question-label aria-label="Question label" maxlength="500"></label><label class="check"><input type="checkbox" data-survey-question-required> Required</label><label data-question-options>Choices (one per line)<textarea data-survey-options rows="4" maxlength="4000"></textarea></label><div data-question-text><label>Placeholder<input data-survey-placeholder maxlength="500"></label><label>Answer length limit<input type="number" data-survey-max-length min="1" max="10000"></label></div><div data-question-rating><label>Minimum<input type="number" data-survey-rating-min min="0" max="99"></label><label>Maximum<input type="number" data-survey-rating-max min="1" max="100"></label></div><label>Question font size<input data-survey-font-size type="number" min="10" max="36"></label><label>Question color<input data-survey-question-color type="color"></label>`;
    this.stepHost.dataset.surveyStepInspector = '';
    this.stepHost.innerHTML = '<label>Survey step heading<input data-survey-step-heading maxlength="160"></label><label class="check"><input type="checkbox" data-survey-allow-back> Allow Back</label><label class="check"><input type="checkbox" data-survey-show-progress> Show progress</label><label>Submit label<input data-survey-submit-label maxlength="80"></label><details data-survey-branch-section><summary>After this step</summary><label>Default next step<select data-survey-default-next></select></label><div data-survey-rules></div><button type="button" class="secondary-button" data-survey-add-rule>Add answer rule</button><small>First matching rule wins. Destinations can only move forward.</small></details>';
    this.dock.dataset.surveyDock = '';
    this.dock.innerHTML = '<button type="button" class="secondary-button compact" data-survey-add-step aria-label="Add Survey step">＋</button><details><summary aria-label="Survey step actions">⋯</summary><div><button type="button" data-survey-duplicate-step>Duplicate step</button><button type="button" data-survey-move="-1">Move step earlier</button><button type="button" data-survey-move="1">Move step later</button><button type="button" data-survey-delete-step>Delete step</button></div></details>';
    this.style.textContent = '[data-survey-step-inspector],[data-block=question]{display:grid;gap:8px}[data-survey-options]{box-sizing:border-box;width:100%;border:1px solid #d7dce3;border-radius:6px;padding:7px;font:12px/1.5 ui-sans-serif,system-ui}[data-survey-branch-section]>summary{cursor:pointer;font-weight:600;margin:4px 0 8px}[data-survey-rule]{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;padding:8px 0;border-top:1px solid #e5e7eb}[data-survey-step-inspector] small{display:block;color:#64748b;font-size:11px;margin-top:6px}.step-navigator>[data-survey-dock]{display:flex;flex:none;gap:4px;align-items:center}[data-survey-dock][hidden]{display:none!important}[data-survey-dock] details>summary{list-style:none;cursor:pointer;border:1px solid #d7dce3;border-radius:6px;padding:3px 7px}[data-survey-dock] details>div{position:absolute;bottom:calc(100% + 6px);right:4px;display:grid;gap:4px;min-width:150px;padding:6px;background:#fff;border:1px solid #d7dce3;border-radius:8px;box-shadow:0 4px 18px #0f172a20}[data-survey-dock] details button{border:0;background:#fff;padding:7px;text-align:left;font:12px ui-sans-serif,system-ui;cursor:pointer}';
    root.querySelector('[data-inspector=block]')?.append(this.questionHost);
    root.querySelector('[data-inspector=step]')?.append(this.stepHost);
    root.querySelector('[data-guide]')?.append(this.dock); root.append(this.style);
    root.addEventListener('change', this.onChange); root.addEventListener('click', this.onClick);
  }

  setDefinition(survey: SurveyConfig): void { this.survey = survey; }

  sync(): void {
    const step = this.survey.steps[this.options.index()], composer = this.options.composer();
    if (!step) return;
    const source = isSourceAuthored(step.builder);
    this.questionHost.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-survey-question-type],[data-survey-rating-min],[data-survey-rating-max]').forEach(control => {
      control.disabled = source;
      control.title = source ? 'Source question type and rating range preserve their canonical answer structure. Labels, input settings, typography and color remain editable.' : '';
    });
    this.dock.hidden = !this.options.canEdit();
    this.value('[data-survey-step-heading]', step.content.heading);
    this.check('[data-survey-allow-back]', this.survey.allowBack); this.check('[data-survey-show-progress]', this.survey.showProgress); this.value('[data-survey-submit-label]', this.survey.submitLabel);
    this.root.querySelectorAll('[data-step] small').forEach((label, index) => { if (this.survey.steps[index]) label.textContent = this.survey.steps[index].content.heading || `Step ${index + 1}`; });
    const question = composer?.getSelectedQuestion(); this.questionHost.hidden = !question;
    if (question) {
      this.value('[data-survey-question-type]', question.type); this.value('[data-survey-question-label]', question.label); this.check('[data-survey-question-required]', Boolean(question.required));
      this.questionHost.querySelector<HTMLElement>('[data-question-options]')!.hidden = !('options' in question);
      this.questionHost.querySelector<HTMLElement>('[data-question-text]')!.hidden = !['short_text', 'long_text'].includes(question.type);
      this.questionHost.querySelector<HTMLElement>('[data-question-rating]')!.hidden = question.type !== 'rating';
      if ('options' in question) this.value('[data-survey-options]', question.options.map(option => option.label).join('\n'));
      if (question.type === 'short_text' || question.type === 'long_text') { this.value('[data-survey-placeholder]', question.placeholder ?? ''); this.value('[data-survey-max-length]', String(question.maxLength ?? 10000)); }
      if (question.type === 'rating') { this.value('[data-survey-rating-min]', String(question.min)); this.value('[data-survey-rating-max]', String(question.max)); }
      const block = composer?.getSelectedBlock(); if (block?.type === 'question') { this.value('[data-survey-font-size]', String(block.fontSize)); this.value('[data-survey-question-color]', block.color ?? '#111827'); }
    }
    const select = this.root.querySelector<HTMLSelectElement>('[data-survey-default-next]')!;
    const choices = this.destinations(); const markup = '<option value="">Next in order</option>' + choices;
    if (select.innerHTML !== markup) select.innerHTML = markup;
    this.value('[data-survey-default-next]', step.branching?.defaultNextStepId ?? '');
    const rules = this.root.querySelector<HTMLElement>('[data-survey-rules]')!;
    const signature = JSON.stringify([step.id, step.questions, step.branching, this.survey.steps.map(step => [step.id, step.content.heading])]);
    if (rules.dataset.signature !== signature) { rules.dataset.signature = signature; rules.innerHTML = (step.branching?.rules ?? []).map((rule, index) => this.ruleMarkup(rule, index)).join(''); }
    this.root.querySelector<HTMLButtonElement>('[data-survey-add-rule]')!.disabled = !step.questions.length || (step.branching?.rules.length ?? 0) >= 10;
  }

  private destinations(): string {
    return this.survey.steps.slice(this.options.index() + 1).map((step, offset) => `<option value="${escape(step.id)}">${this.options.index() + offset + 2}. ${escape(step.content.heading || 'Survey step')}</option>`).join('') + '<option value="submit">Submit Survey</option>';
  }
  private ruleMarkup(rule: SurveyBranchRule, index: number): string {
    const questions = this.survey.steps[this.options.index()].questions, question = questions.find(question => question.id === rule.questionId)!;
    const operators = question?.type === 'multiple_choice' ? [['includes', 'includes'], ['answered', 'has an answer']] : question?.type === 'rating' || question?.type === 'nps' ? [['equals', 'equals'], ['not_equals', 'does not equal'], ['gte', 'is at least'], ['lte', 'is at most'], ['answered', 'has an answer']] : [['equals', 'equals'], ['not_equals', 'does not equal'], ['answered', 'has an answer']];
    const value = rule.operator === 'answered' ? '' : question && 'options' in question ? `<label>Answer<select data-rule-value>${question.options.map(option => `<option value="${escape(option.id)}"${rule.value === option.id ? ' selected' : ''}>${escape(option.label)}</option>`).join('')}</select></label>` : `<label>Answer<input data-rule-value value="${escape(String(rule.value ?? ''))}"${question?.type === 'rating' || question?.type === 'nps' ? ' type="number"' : ''}></label>`;
    return `<div data-survey-rule="${index}"><label>Question<select data-rule-question>${questions.map(question => `<option value="${escape(question.id)}"${question.id === rule.questionId ? ' selected' : ''}>${escape(question.label)}</option>`).join('')}</select></label><label>Condition<select data-rule-operator>${operators.map(([key, label]) => `<option value="${key}"${key === rule.operator ? ' selected' : ''}>${label}</option>`).join('')}</select></label>${value}<label>Go to<select data-rule-next>${this.destinations().replace(`value="${escape(rule.nextStepId)}"`, `value="${escape(rule.nextStepId)}" selected`)}</select></label><button class="secondary-button compact" type="button" data-survey-remove-rule="${index}">Remove rule</button></div>`;
  }

  private onChange = (event: Event): void => {
    const input = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (!input.dataset || !this.options.canEdit()) return;
    const composer = this.options.composer(), step = this.survey.steps[this.options.index()], question = composer?.getSelectedQuestion();
    if (input.matches('[data-survey-default-next],[data-rule-question],[data-rule-operator],[data-rule-value],[data-rule-next]')) {
      const branching = cloneOnsite(step.branching ?? { rules: [] });
      if (input.matches('[data-survey-default-next]')) branching.defaultNextStepId = input.value || undefined;
      else {
        const index = Number(input.closest<HTMLElement>('[data-survey-rule]')!.dataset.surveyRule), rule = branching.rules[index];
        if (input.matches('[data-rule-question]')) Object.assign(rule, this.defaultRule(step.questions.find(question => question.id === input.value)!));
        if (input.matches('[data-rule-operator]')) { rule.operator = input.value as SurveyBranchRule['operator']; if (rule.operator === 'answered') delete rule.value; else if (rule.value === undefined) rule.value = this.defaultRule(step.questions.find(question => question.id === rule.questionId)!).value; }
        if (input.matches('[data-rule-next]')) rule.nextStepId = input.value;
        if (input.matches('[data-rule-value]')) { const question = step.questions.find(question => question.id === rule.questionId)!; rule.value = question.type === 'rating' || question.type === 'nps' ? Number(input.value) : input.value; }
      }
      composer?.updateBranching(branching); this.sync(); return;
    }
    if (input.matches('[data-survey-allow-back],[data-survey-show-progress],[data-survey-submit-label]')) {
      if (!this.options.flush()) return;
      if (input.matches('[data-survey-submit-label]') && !input.value.trim()) { this.options.error(['Submit label cannot be empty.']); return; }
      this.survey.allowBack = this.root.querySelector<HTMLInputElement>('[data-survey-allow-back]')!.checked;
      this.survey.showProgress = this.root.querySelector<HTMLInputElement>('[data-survey-show-progress]')!.checked;
      this.survey.submitLabel = this.root.querySelector<HTMLInputElement>('[data-survey-submit-label]')!.value.trim();
      this.recompile(); composer?.refreshSurvey(); this.options.changed(); return;
    }
    if (input.matches('[data-survey-step-heading]')) { composer?.updateStepHeading(input.value); this.sync(); return; }
    if (!question || !composer || !this.questionHost.contains(input)) return;
    if (input.matches('[data-survey-font-size]')) { composer.updateBlock({ fontSize: Number(input.value) }); return; }
    if (input.matches('[data-survey-question-color]')) { composer.updateBlock({ color: input.value }); return; }
    const next = cloneOnsite(question);
    // Type changes replace the union object, so no stale options/ranges survive.
    const value = input.matches('[data-survey-question-type]') ? { ...newSurveyQuestion(input.value as SurveyQuestion['type']), id: question.id, label: question.label, required: question.required } : next;
    if (input.matches('[data-survey-question-label]')) value.label = input.value;
    if (input.matches('[data-survey-question-required]')) value.required = (input as HTMLInputElement).checked;
    if ('options' in value && input.matches('[data-survey-options]')) { const existing = value.options; value.options = input.value.split('\n').map((label, index) => ({ id: existing[index]?.id ?? onsiteId('option'), label })); }
    if (value.type === 'short_text' || value.type === 'long_text') { if (input.matches('[data-survey-placeholder]')) value.placeholder = input.value; if (input.matches('[data-survey-max-length]')) value.maxLength = Number(input.value); }
    if (value.type === 'rating') { if (input.matches('[data-survey-rating-min]')) value.min = Number(input.value); if (input.matches('[data-survey-rating-max]')) value.max = Number(input.value); }
    composer.updateQuestion(value); this.sync();
  };

  private onClick = (event: Event): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!target || !this.options.canEdit()) return;
    const step = this.survey.steps[this.options.index()], composer = this.options.composer();
    if (target.matches('[data-survey-add-rule]')) { if (!step.questions.length) return; composer?.updateBranching({ ...step.branching, rules: [...(step.branching?.rules ?? []), this.defaultRule(step.questions[0])] }); this.sync(); return; }
    if (target.matches('[data-survey-remove-rule]')) { composer?.updateBranching({ ...step.branching, rules: step.branching!.rules.filter((_, index) => index !== Number(target.dataset.surveyRemoveRule)) }); this.sync(); return; }
    if (!this.dock.contains(target) || !this.options.flush()) return;
    let index = this.options.index(); const steps = cloneOnsite(this.survey.steps);
    if (target.matches('[data-survey-add-step]')) { if (steps.length >= 20) return; steps.push(newSurveyStep(this.survey.submitLabel)); index = steps.length - 1; }
    if (target.matches('[data-survey-duplicate-step]')) { if (steps.length >= 20) return; steps.splice(index + 1, 0, duplicateSurveyStep(steps[index], this.survey.submitLabel)); index++; }
    if (target.matches('[data-survey-move]')) { const next = index + Number(target.dataset.surveyMove); if (next < 0 || next >= steps.length) return; [steps[index], steps[next]] = [steps[next], steps[index]]; index = next; }
    if (target.matches('[data-survey-delete-step]')) {
      if (steps.length === 1) return;
      const removed = steps.splice(index, 1)[0].id; index = Math.min(index, steps.length - 1);
      steps.forEach(step => { if (step.branching) { step.branching.rules = step.branching.rules.filter(rule => rule.nextStepId !== removed); if (step.branching.defaultNextStepId === removed) delete step.branching.defaultNextStepId; } });
    }
    const errors = surveyBranchErrors({ ...this.survey, steps }); if (errors.length) { this.options.error(errors); return; }
    this.survey.steps = steps; this.dock.querySelector('details')!.open = false; this.options.stepsChanged(index);
  };

  private defaultRule(question: SurveyQuestion): SurveyBranchRule {
    return { questionId: question.id, operator: question.type === 'multiple_choice' ? 'includes' : 'equals', value: 'options' in question ? question.options[0].id : question.type === 'rating' ? question.min : question.type === 'nps' ? 0 : '', nextStepId: this.survey.steps[this.options.index() + 1]?.id ?? 'submit' };
  }
  private recompile(): void { this.survey.steps.forEach(step => { const doc = onsiteDocumentFromBuilder(step.builder); if (isSourceAuthored(step.builder) && step.builder) {
      const template = document.createElement('template'); template.innerHTML = step.builder.html;
      const submit = template.content.querySelector('[data-movcues-survey-action="submit"]'); if (submit) submit.textContent = this.survey.submitLabel;
      step.builder.html = template.innerHTML;
    } else if (doc && step.builder) Object.assign(step.content, applyOnsiteDocument(step.builder, doc, 'survey', { questions: step.questions, submitLabel: this.survey.submitLabel }).content); }); }
  private value(selector: string, value: string): void { const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector); if (input && this.root.activeElement !== input) input.value = value; }
  private check(selector: string, value: boolean): void { const input = this.root.querySelector<HTMLInputElement>(selector); if (input) input.checked = value; }
  destroy(): void { this.root.removeEventListener('change', this.onChange); this.root.removeEventListener('click', this.onClick); this.questionHost.remove(); this.stepHost.remove(); this.dock.remove(); this.style.remove(); }
}

function escape(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
