import type { SurveyQuestion, SurveyStep } from '../types';
export declare function newSurveyQuestion(type: SurveyQuestion['type']): SurveyQuestion;
export declare function newSurveyStep(submitLabel: string): SurveyStep;
export declare function duplicateSurveyStep(source: SurveyStep, submitLabel: string): SurveyStep;
