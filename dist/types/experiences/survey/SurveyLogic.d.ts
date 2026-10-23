import type { SurveyAnswers, SurveyConfig } from '../types';
export declare function nextSurveyStep(survey: SurveyConfig, index: number, answers: SurveyAnswers): number | null;
/** Derived solely from the published definition and answer values, never client visited-step claims. */
export declare function surveyPath(survey: SurveyConfig, answers: SurveyAnswers): number[];
export declare function answersOnSurveyPath(survey: SurveyConfig, answers: SurveyAnswers): SurveyAnswers;
export declare function surveyBranchErrors(survey: SurveyConfig): string[];
