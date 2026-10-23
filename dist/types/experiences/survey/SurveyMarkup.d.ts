import type { SurveyQuestion } from '../types';
export interface OnsiteSurveyContext {
    questions: SurveyQuestion[];
    submitLabel?: string;
}
export declare const QUESTION_TYPES: readonly ["single_choice", "multiple_choice", "short_text", "long_text", "rating", "nps"];
/** Small pure projection shared by the two compilers; SurveyRenderer owns behavior. */
export declare function surveyQuestionMarkup(question: SurveyQuestion, blockId: string): string;
export declare function surveyControlsMarkup(blockId: string, label: string): string;
export declare const SURVEY_CELL_CSS = ".movcues-widget .movcues-survey-question__label{margin:0 0 8px;font-weight:600}.movcues-widget .movcues-survey-options{display:flex;flex-wrap:wrap;gap:6px}.movcues-widget .movcues-survey-option,.movcues-widget [data-movcues-survey-action]{min-height:36px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:inherit;padding:8px 12px;font:inherit;cursor:pointer}.movcues-widget .movcues-survey-option.is-selected{border-color:var(--movcues-primary);background:color-mix(in srgb,var(--movcues-primary) 12%,white)}.movcues-widget .movcues-survey-input{box-sizing:border-box;width:100%;min-width:0;min-height:36px;border:1px solid #cbd5e1;border-radius:6px;padding:8px;font:inherit}.movcues-widget textarea.movcues-survey-input{min-height:84px;resize:vertical}.movcues-widget .movcues-survey-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}.movcues-widget .movcues-survey-footer{width:100%}.movcues-widget [data-movcues-survey-progress]{font-size:12px;margin-bottom:8px}.movcues-widget [data-movcues-survey-progress-bar]{display:block;height:3px;background:var(--movcues-primary);margin-top:5px}.movcues-widget .movcues-survey-validation{color:#b91c1c;font-size:12px}.movcues-widget .movcues-survey-question.has-error{outline:2px solid #dc2626;outline-offset:4px}";
export declare function surveyQuestionErrors(questions: SurveyQuestion[]): string[];
